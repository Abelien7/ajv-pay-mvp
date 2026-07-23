import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { LedgerLine, ProviderLedgerAccount } from './ledger.types';
import { Payment } from '../payments/payment.entity';

/** `payment.method` ('moov'|'mixx'|'manual') -> compte ledger correspondant ('provider_<method>'). */
export function providerLedgerAccount(method: Payment['method']): ProviderLedgerAccount {
  return `provider_${method}` as ProviderLedgerAccount;
}

/**
 * LedgerService = module interne au MVP (pas un service réseau séparé),
 * mais le modèle de données et les garanties sont déjà celles d'un vrai
 * système de comptabilité en partie double :
 *
 *   - Chaque mouvement financier s'écrit comme un ENSEMBLE de lignes
 *     débit/crédit qui s'équilibrent exactement (somme débits = somme crédits).
 *   - Aucune ligne n'est jamais modifiée ni supprimée (garanti aussi par un
 *     trigger PostgreSQL — voir migrations/001_init.sql).
 *   - Un remboursement n'efface rien : il ajoute une nouvelle paire de lignes
 *     inversées.
 *
 * recordSuccess()/recordRefund() ouvrent leur propre transaction et sont le
 * point d'entrée normal depuis PaymentOrchestrator. writeEntries() reste
 * disponible en bas niveau pour composer des écritures dans une
 * transaction déjà ouverte par un futur appelant (ex: Reconciliation Service).
 */
@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Commission plateforme, en points de base (`PLATFORM_FEE_BPS`, ex: 200 =
   * 2%). Défaut à 0 (désactivé) délibérément : ce mécanisme doit être un
   * choix explicite de l'utilisateur, jamais une commission qui commence à
   * être prélevée silencieusement sur un marchand déjà connecté (Mavahi)
   * simplement parce que le code a été déployé. Tant que la variable n'est
   * pas réglée, le comportement du ledger reste identique à avant l'ajout
   * de cette fonctionnalité — vérifié par les tests existants.
   */
  private computeFee(amount: number): number {
    const bps = Number(this.config.get<string>('PLATFORM_FEE_BPS', '0'));
    if (!bps || bps <= 0) return 0;
    // >= 10000 bps = 100%+ : `net = amount - fee` deviendrait <= 0, ce qui
    // ferait échouer l'INSERT de la ligne `merchant_payable` (contrainte
    // `CHECK(amount > 0)` sur ledger_entries) et donc ROLLBACK toute la
    // transaction commitFinalState — pour CHAQUE paiement réussi, avec
    // l'argent déjà prélevé côté provider mais le paiement bloqué en
    // `processing` côté AJV Pay, sans notification ni trace claire. Une
    // simple faute de frappe de config (ex: "10000" au lieu de "100") ne
    // doit jamais pouvoir produire ça — on désactive plutôt le frais et on
    // logue fort, cohérent avec le défaut "désactivé" documenté ci-dessus.
    if (bps >= 10_000) {
      this.logger.error(
        `PLATFORM_FEE_BPS=${bps} est invalide (>= 10000 = 100%+) — frais ignoré pour ce paiement. Corrigez la variable d'environnement.`,
      );
      return 0;
    }
    return Math.floor((amount * bps) / 10_000);
  }

  /**
   * Point d'entrée appelé par PaymentOrchestrator après confirmation de
   * succès provider. Ouvre sa PROPRE transaction SQL (distincte de celle
   * de PaymentsService.updateFromProvider, déjà commitée à ce stade) — ce
   * découplage est voulu : Ledger ne doit dépendre d'aucun état de
   * transaction ouvert ailleurs, conformément au nouveau flux orchestré.
   */
  async recordSuccess(payment: Payment): Promise<void> {
    const providerAccount = providerLedgerAccount(payment.method);
    await this.db.withTransaction((client) =>
      this.writeEntries(client, {
        paymentId: payment.id,
        merchantId: payment.merchant_id,
        currency: payment.currency,
        reference: `payment:${payment.id}`,
        lines: this.buildSuccessEntries(payment.amount, providerAccount),
      }),
    );
  }

  /** Symétrique de recordSuccess() pour un remboursement confirmé. */
  async recordRefund(payment: Payment): Promise<void> {
    const providerAccount = providerLedgerAccount(payment.method);
    await this.db.withTransaction((client) =>
      this.writeEntries(client, {
        paymentId: payment.id,
        merchantId: payment.merchant_id,
        currency: payment.currency,
        reference: `refund:${payment.id}`,
        lines: this.buildRefundEntries(payment.amount, providerAccount),
      }),
    );
  }

  /**
   * Écrit un ensemble de lignes de ledger pour un paiement donné.
   * Refuse d'écrire si les lignes ne s'équilibrent pas — c'est la dernière
   * ligne de défense avant que des données financières incohérentes
   * n'atteignent la base.
   */
  async writeEntries(
    client: PoolClient,
    params: {
      paymentId: string;
      merchantId: string;
      currency: string;
      reference: string;
      lines: LedgerLine[];
    },
  ): Promise<void> {
    const { paymentId, merchantId, currency, reference, lines } = params;

    this.assertBalanced(lines);

    for (const line of lines) {
      await client.query(
        `INSERT INTO ledger_entries
           (payment_id, merchant_id, account, direction, amount, currency, reference)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [paymentId, merchantId, line.account, line.direction, line.amount, currency, reference],
      );
    }

    this.logger.log(
      `Ledger écrit pour payment=${paymentId} ref=${reference} (${lines.length} lignes, équilibré)`,
    );
  }

  /**
   * Construit les lignes pour un paiement entrant réussi :
   *   crédit provider_<X>      : l'argent reçu du provider (montant brut, inchangé)
   *   débit  merchant_payable  : ce qu'AJV Pay doit reverser au marchand (net de commission)
   *   débit  fees              : commission AJV Pay retenue (ligne omise si commission nulle —
   *                              CHECK(amount > 0) sur ledger_entries l'interdirait sinon)
   */
  buildSuccessEntries(amount: number, providerAccount: ProviderLedgerAccount): LedgerLine[] {
    // `amount` peut arriver ici comme une chaîne : Postgres (BIGINT) renvoie
    // toujours payment.amount sous forme de string via le driver `pg`, jamais
    // un number. Sans ce Number() explicite, `net = amount - fee` coerce
    // correctement (l'opérateur `-` force la conversion), mais la ligne
    // credit ci-dessous garderait la chaîne d'origine — assertBalanced
    // comparerait alors un number à une concaténation de chaîne ("0" +
    // "10000" = "010000") et rejetterait à tort une écriture pourtant
    // équilibrée. Bug réel découvert en testant avec une commission non
    // nulle contre une vraie base (voir test/platform-fees.e2e-spec.ts).
    amount = Number(amount);
    const fee = this.computeFee(amount);
    const net = amount - fee;
    const lines: LedgerLine[] = [
      { account: providerAccount, direction: 'credit', amount },
      { account: 'merchant_payable', direction: 'debit', amount: net },
    ];
    if (fee > 0) {
      lines.push({ account: 'fees', direction: 'debit', amount: fee });
    }
    return lines;
  }

  /**
   * Lignes d'inversion pour un remboursement — annule le montant NET
   * réellement dû au marchand, pas le montant brut. **Décision assumée** :
   * comme la plupart des processeurs de paiement réels, AJV Pay conserve sa
   * commission même en cas de remboursement (le service de vérification/
   * traitement a bien eu lieu) — la ligne 'fees' n'est donc jamais reversée
   * ici. Avec `PLATFORM_FEE_BPS` désactivé (défaut), fee=0 et ce
   * comportement est strictement identique à avant.
   */
  buildRefundEntries(amount: number, providerAccount: ProviderLedgerAccount): LedgerLine[] {
    amount = Number(amount); // voir le commentaire équivalent dans buildSuccessEntries
    const fee = this.computeFee(amount);
    const net = amount - fee;
    return [
      { account: providerAccount, direction: 'debit', amount: net },
      { account: 'merchant_payable', direction: 'credit', amount: net },
    ];
  }

  /** Vérifie que la somme des débits égale la somme des crédits. */
  private assertBalanced(lines: LedgerLine[]): void {
    const totalDebit = lines
      .filter((l) => l.direction === 'debit')
      .reduce((sum, l) => sum + l.amount, 0);
    const totalCredit = lines
      .filter((l) => l.direction === 'credit')
      .reduce((sum, l) => sum + l.amount, 0);

    if (totalDebit !== totalCredit) {
      throw new Error(
        `Ledger déséquilibré : debit=${totalDebit} credit=${totalCredit}. Écriture refusée.`,
      );
    }
  }

  /**
   * Calcule le solde d'un compte en sommant les écritures — jamais lu
   * depuis un champ "balance" mutable, toujours recalculé depuis les
   * écritures append-only.
   */
  async getAccountBalance(client: PoolClient, account: string): Promise<number> {
    const { rows } = await client.query(
      `SELECT
         COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount ELSE 0 END), 0) AS balance
       FROM ledger_entries WHERE account = $1`,
      [account],
    );
    return Number(rows[0]?.balance ?? 0);
  }

  /**
   * Solde "à reverser" d'un marchand donné : ce que `merchant_payable`
   * contient pour lui. Sur `merchant_payable`, c'est le DÉBIT qui augmente
   * le montant dû au marchand (voir buildSuccessEntries : "débit
   * merchant_payable = ce qu'AJV Pay doit reverser au marchand") et le
   * CRÉDIT qui le diminue (buildRefundEntries, inversion sur remboursement)
   * — inverse de la convention comptable habituelle d'un compte de passif,
   * mais cohérent avec le sens donné par ce MVP à ce compte précis.
   * Recalculé depuis les écritures append-only, jamais lu depuis un champ
   * "balance" mutable, exactement comme getAccountBalance.
   */
  async getMerchantBalance(merchantId: string): Promise<number> {
    const { rows } = await this.db.query(
      `SELECT
         COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount ELSE 0 END), 0) AS balance
       FROM ledger_entries WHERE account = 'merchant_payable' AND merchant_id = $1`,
      [merchantId],
    );
    return Number(rows[0]?.balance ?? 0);
  }

  /**
   * Total des commissions AJV Pay collectées, tous marchands confondus —
   * même convention de signe que getMerchantBalance (débit augmente),
   * jamais remis à zéro par un remboursement (voir buildRefundEntries).
   */
  async getFeesBalance(): Promise<number> {
    const { rows } = await this.db.query(
      `SELECT
         COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount ELSE 0 END), 0) AS balance
       FROM ledger_entries WHERE account = 'fees'`,
    );
    return Number(rows[0]?.balance ?? 0);
  }
}
