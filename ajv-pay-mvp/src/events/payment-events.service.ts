import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';

export type PaymentEventType =
  | 'created'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'expired'
  | 'refunded';

/**
 * Toute transition de statut DOIT passer par ce service, dans la même
 * transaction SQL que la mise à jour de `payments.status`. La table
 * payment_events est protégée en append-only au niveau base (trigger),
 * donc même un bug applicatif ne peut pas réécrire l'historique.
 */
@Injectable()
export class PaymentEventsService {
  async record(
    client: PoolClient,
    paymentId: string,
    eventType: PaymentEventType,
    payload: Record<string, unknown> = {},
  ): Promise<void> {
    await client.query(
      `INSERT INTO payment_events (payment_id, event_type, payload)
       VALUES ($1, $2, $3)`,
      [paymentId, eventType, JSON.stringify(payload)],
    );
  }
}
