import { Injectable, Logger } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';

export type OutboxEventType =
  | 'payment.created'
  | 'payment.processing'
  | 'payment.succeeded'
  | 'payment.failed'
  | 'payment.expired'
  | 'payment.refunded';

export interface OutboxEventRow {
  id: string;
  event_type: OutboxEventType;
  payment_id: string | null;
  merchant_id: string | null;
  payload: any;
  processed: boolean;
  created_at: Date;
  processed_at: Date | null;
}

/**
 * Implémentation réelle du pattern Outbox décrit dans l'ADR V3 (section
 * "Pattern Outbox — le compromis clé du MVP") :
 *
 *   - PaymentOrchestrator appelle `record()` à chaque transition de statut
 *     qu'il orchestre. C'est une simple INSERT, donc atomique par nature —
 *     aucun état intermédiaire possible (soit la ligne existe, soit non).
 *   - Un processor (cron, voir outbox-processor.cron.ts) lit les
 *     événements non traités et les transforme en actions concrètes
 *     (aujourd'hui : une notification webhook marchand via WebhooksService).
 *
 * Pourquoi cette séparation compte (et pas juste "une table de plus") :
 *   - PaymentOrchestrator ne connaît plus WebhooksService du tout — il ne
 *     sait que publier un fait ("ce paiement est succeeded"), pas comment
 *     ce fait doit être communiqué. C'est exactement le découplage qu'on
 *     retrouvera avec SNS/SQS en V2 : remplacer `record()` par
 *     `snsClient.publish()` ne change RIEN à PaymentOrchestrator.
 *   - Le processor peut évoluer indépendamment (ajouter un deuxième
 *     consommateur — ex: Reconciliation Service plus tard — sans toucher
 *     à l'orchestrateur).
 */
@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Variante atomique de `record()` : participe à une transaction SQL déjà
   * ouverte ailleurs (typiquement par PaymentOrchestrator), au lieu d'en
   * ouvrir une nouvelle. C'est CETTE méthode qui doit être utilisée pour
   * tout événement lié à une transition de statut financièrement critique
   * (succeeded/failed/expired/refunded) — afin que la mise à jour de
   * `payments.status`, l'écriture du ledger et la publication outbox
   * commitent ensemble, ou pas du tout. `record()` (sa propre transaction)
   * reste correcte pour des événements non critiques (ex: payment.processing,
   * simple traçabilité, perte tolérable).
   */
  async recordInTransaction(
    client: PoolClient,
    eventType: OutboxEventType,
    payload: Record<string, unknown>,
    context: { paymentId?: string; merchantId?: string } = {},
  ): Promise<OutboxEventRow> {
    const { rows } = await client.query<OutboxEventRow>(
      `INSERT INTO outbox_events (event_type, payment_id, merchant_id, payload)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [eventType, context.paymentId ?? null, context.merchantId ?? null, JSON.stringify(payload)],
    );
    return rows[0];
  }

  async record(
    eventType: OutboxEventType,
    payload: Record<string, unknown>,
    context: { paymentId?: string; merchantId?: string } = {},
  ): Promise<OutboxEventRow> {
    const { rows } = await this.db.query<OutboxEventRow>(
      `INSERT INTO outbox_events (event_type, payment_id, merchant_id, payload)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [eventType, context.paymentId ?? null, context.merchantId ?? null, JSON.stringify(payload)],
    );
    const event = rows[0];
    this.logger.log(`Événement outbox enregistré: ${eventType} (id=${event.id})`);
    return event;
  }

  /** Lus par le processor, dans l'ordre chronologique, par lots bornés. */
  async listUnprocessed(limit = 50): Promise<OutboxEventRow[]> {
    const { rows } = await this.db.query<OutboxEventRow>(
      `SELECT * FROM outbox_events
       WHERE processed = FALSE
       ORDER BY created_at ASC
       LIMIT $1`,
      [limit],
    );
    return rows;
  }

  async markProcessed(eventId: string): Promise<void> {
    await this.db.query(
      `UPDATE outbox_events SET processed = TRUE, processed_at = NOW() WHERE id = $1`,
      [eventId],
    );
  }
}
