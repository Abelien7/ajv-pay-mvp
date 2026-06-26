import { Injectable, Logger } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { LedgerLine, ProviderLedgerAccount } from './ledger.types';
import { Payment } from '../payments/payment.entity';

/** `payment.method` ('flooz'|'moov'|'cinetpay') -> compte ledger correspondant ('provider_<method>'). */
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

  constructor(private readonly db: DatabaseService) {}

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
   * Construit les lignes standard pour un paiement entrant réussi :
   *   crédit provider_<X>      : l'argent reçu du provider
   *   débit  merchant_payable  : ce qu'AJV Pay doit reverser au marchand
   *
   * (Les frais AJV Pay pourront être ajoutés ici plus tard comme une
   * troisième paire d'écritures — fees / ajv_cash — sans changer la
   * structure de l'appelant.)
   */
  buildSuccessEntries(amount: number, providerAccount: ProviderLedgerAccount): LedgerLine[] {
    return [
      { account: providerAccount, direction: 'credit', amount },
      { account: 'merchant_payable', direction: 'debit', amount },
    ];
  }

  /**
   * Lignes d'inversion pour un remboursement : on annule exactement le
   * mouvement initial avec des directions inversées, sans toucher aux
   * lignes d'origine.
   */
  buildRefundEntries(amount: number, providerAccount: ProviderLedgerAccount): LedgerLine[] {
    return [
      { account: providerAccount, direction: 'debit', amount },
      { account: 'merchant_payable', direction: 'credit', amount },
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
}
