import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { MerchantsService } from '../merchants/merchants.service';
import { Payment } from '../payments/payment.entity';
import { computeHmacSignature } from '../common/auth/hmac.util';
import { assertPublicWebhookUrl } from './ssrf-guard';

interface WebhookAttemptRow {
  id: string;
  merchant_id: string;
  payment_id: string;
  url: string;
  payload: any;
  status: 'pending' | 'success' | 'failed';
  attempt_count: number;
  next_retry_at: Date | null;
}

/**
 * Webhook MVP : pas de SNS/SQS, pas de service réseau séparé. La fiabilité
 * vient de la table `webhook_attempts` + d'un cron qui retente les envois
 * en échec. C'est le pattern Outbox simplifié de l'ADR V3 : la durabilité
 * de l'événement repose sur PostgreSQL, pas sur une infrastructure de queue.
 *
 * `merchants.webhook_url` est ajoutée par migrations/002_add_merchant_webhook_url.sql.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly maxAttempts: number;

  constructor(
    private readonly db: DatabaseService,
    private readonly merchants: MerchantsService,
    private readonly config: ConfigService,
  ) {
    this.maxAttempts = this.config.get<number>('WEBHOOK_MAX_ATTEMPTS', 5);
  }

  /**
   * Enregistre une tentative de webhook à envoyer. Appelée par
   * PaymentOrchestrator APRÈS que PaymentsService a déjà commité la
   * transition de statut — ce n'est plus la même transaction SQL (c'était
   * le cas dans l'ancienne version monolithique). L'INSERT seul reste
   * atomique par nature (une seule instruction SQL), donc la garantie
   * "jamais d'événement perdu" tient toujours : soit la ligne
   * `webhook_attempts` existe, soit elle n'existe pas, jamais d'état
   * intermédiaire.
   */
  async enqueue(payment: Payment): Promise<void> {
    await this.doEnqueue(payment, (sql, params) => this.db.query(sql, params));
  }

  /**
   * Variante transactionnelle d'`enqueue`, utilisée par
   * `OutboxProcessorService` — l'INSERT doit participer à la MÊME
   * transaction que la réclamation de l'événement outbox
   * (`OutboxService.claimNext`/`markProcessedInTransaction`) : si l'INSERT
   * se faisait sur une connexion séparée et réussissait, puis que le
   * marquage "traité" échouait pour une autre raison, le prochain passage
   * réessaierait l'événement et créerait une DEUXIÈME tentative de webhook
   * pour le même paiement — exactement le double envoi qu'on cherche à
   * éliminer, juste déplacé d'une course entre process à une course entre
   * connexions.
   */
  async enqueueInTransaction(client: PoolClient, payment: Payment): Promise<void> {
    await this.doEnqueue(payment, (sql, params) => client.query(sql, params));
  }

  private async doEnqueue(
    payment: Payment,
    exec: (sql: string, params: unknown[]) => Promise<unknown>,
  ): Promise<void> {
    const merchant = await this.merchants.findById(payment.merchant_id);
    const url = (merchant as any)?.webhook_url;

    if (!url) {
      this.logger.warn(
        `Aucune webhook_url configurée pour merchant=${payment.merchant_id} — notification ignorée`,
      );
      return;
    }

    const payload = {
      event: `payment.${payment.status}`,
      payment_id: payment.id,
      merchant_id: payment.merchant_id,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      provider_reference: payment.provider_reference,
      // Echo de ce que le marchand a fourni dans `metadata` à la création
      // du paiement (POST /payments) — lui permet de retrouver sa propre
      // commande sans qu'AJV Pay ait besoin de connaître son schéma.
      metadata: payment.metadata,
    };

    await exec(
      `INSERT INTO webhook_attempts (merchant_id, payment_id, url, payload, status, next_retry_at)
       VALUES ($1, $2, $3, $4, 'pending', NOW())`,
      [payment.merchant_id, payment.id, url, JSON.stringify(payload)],
    );
  }

  /**
   * Appelé par le cron (voir webhooks.cron.ts). Traite toutes les
   * tentatives dues (`status = 'pending'` ET `next_retry_at <= NOW()`),
   * avec backoff exponentiel simple et arrêt après `maxAttempts`.
   * "no silent failure allowed" : un webhook qui épuise ses tentatives
   * reste visible en `status = 'failed'`, jamais supprimé silencieusement.
   */
  /** Utilisé par /health : nombre de livraisons encore en attente et âge de la plus ancienne. */
  async getPendingBacklogStats(): Promise<{ pendingCount: number; oldestPendingAt: Date | null }> {
    const { rows } = await this.db.query<{ count: string; oldest: Date | null }>(
      `SELECT COUNT(*) AS count, MIN(created_at) AS oldest FROM webhook_attempts WHERE status = 'pending'`,
    );
    return {
      pendingCount: Number(rows[0]?.count ?? 0),
      oldestPendingAt: rows[0]?.oldest ?? null,
    };
  }

  /**
   * Traite jusqu'à 50 tentatives dues, une par une, chacune réclamée
   * atomiquement avant l'appel réseau (voir migrations/015_webhook_attempt_claim.sql).
   * Sans ça, le process API (livraison immédiate après chaque transition)
   * et le process Worker (@Cron 10s) pouvaient tous deux lire la même
   * ligne `pending` et livrer le même webhook deux fois au marchand — un
   * marchand qui traite la notification de façon non idempotente (ex:
   * décrément de stock) agirait alors deux fois pour un seul paiement.
   * Le bail de 2 minutes (`claimed_at < NOW() - INTERVAL '2 minutes'`) est
   * un filet de sécurité si un process crashe entre la réclamation et la
   * mise à jour du statut final — sans lui, une tentative réclamée par un
   * process mort resterait bloquée indéfiniment.
   */
  async processDue(): Promise<void> {
    for (let i = 0; i < 50; i++) {
      const attempt = await this.claimNextDue();
      if (!attempt) return;
      await this.attemptDelivery(attempt);
    }
  }

  private async claimNextDue(): Promise<WebhookAttemptRow | null> {
    const { rows } = await this.db.query<WebhookAttemptRow>(
      `UPDATE webhook_attempts SET claimed_at = NOW()
       WHERE id = (
         SELECT id FROM webhook_attempts
         WHERE status = 'pending'
           AND next_retry_at <= NOW()
           AND (claimed_at IS NULL OR claimed_at < NOW() - INTERVAL '2 minutes')
         ORDER BY next_retry_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
    );
    return rows[0] ?? null;
  }

  private async attemptDelivery(attempt: WebhookAttemptRow): Promise<void> {
    const merchant = await this.merchants.findById(attempt.merchant_id);
    if (!merchant) return;

    const body = JSON.stringify(attempt.payload);
    const signature = computeHmacSignature(merchant.hmac_secret, body);

    try {
      // Revérifié à CHAQUE tentative (pas seulement à l'enregistrement de
      // l'URL) — voir ssrf-guard.ts pour le raisonnement complet.
      await assertPublicWebhookUrl(attempt.url);

      const res = await fetch(attempt.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Signature': signature,
        },
        body,
        // Un endpoint marchand qui ne répond jamais bloquerait sinon cette
        // tentative indéfiniment (aucun timeout par défaut sur fetch).
        signal: AbortSignal.timeout(15_000),
      });

      if (res.ok) {
        await this.db.query(
          `UPDATE webhook_attempts SET status = 'success', attempt_count = attempt_count + 1
           WHERE id = $1`,
          [attempt.id],
        );
        this.logger.log(`Webhook livré avec succès (attempt=${attempt.id})`);
        return;
      }

      throw new Error(`Réponse HTTP ${res.status}`);
    } catch (err: any) {
      const newCount = attempt.attempt_count + 1;

      if (newCount >= this.maxAttempts) {
        await this.db.query(
          `UPDATE webhook_attempts SET status = 'failed', attempt_count = $2
           WHERE id = $1`,
          [attempt.id, newCount],
        );
        this.logger.error(
          `Webhook définitivement en échec après ${newCount} tentatives (attempt=${attempt.id}): ${err.message}`,
        );
        return;
      }

      // Backoff exponentiel simple : 1min, 2min, 4min, 8min...
      const delayMinutes = Math.pow(2, newCount);
      await this.db.query(
        `UPDATE webhook_attempts
         SET attempt_count = $2, next_retry_at = NOW() + ($3 || ' minutes')::interval
         WHERE id = $1`,
        [attempt.id, newCount, delayMinutes],
      );
      this.logger.warn(
        `Webhook échec (tentative ${newCount}/${this.maxAttempts}), retry dans ${delayMinutes}min (attempt=${attempt.id}): ${err.message}`,
      );
    }
  }
}
