import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OutboxService, OutboxEventRow } from './outbox.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { Payment } from '../payments/payment.entity';

/**
 * Seul consommateur de l'outbox au MVP : transforme tout événement de
 * statut final (succeeded/failed/expired/refunded) en une notification
 * webhook marchand. `payment.created`/`payment.processing` sont
 * enregistrés pour traçabilité/évolution future mais ne déclenchent pas de
 * notification — le marchand n'a pas besoin d'un webhook pour un état
 * transitoire qu'il connaît déjà (il vient de faire l'appel `POST /payments`).
 *
 * Le payload de chaque événement contient déjà tout ce qu'il faut (snapshot
 * du paiement écrit par PaymentOrchestrator) — ce processor ne relit jamais
 * `payments`, exactement comme le ferait un vrai consumer SNS/SQS.
 */
@Injectable()
export class OutboxProcessorCron {
  private readonly logger = new Logger(OutboxProcessorCron.name);

  private readonly notifiableEvents = new Set([
    'payment.succeeded',
    'payment.failed',
    'payment.expired',
    'payment.refunded',
  ]);

  constructor(
    private readonly outbox: OutboxService,
    private readonly webhooks: WebhooksService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async processOutbox(): Promise<void> {
    const events = await this.outbox.listUnprocessed();

    for (const event of events) {
      try {
        await this.handle(event);
        await this.outbox.markProcessed(event.id);
      } catch (err: any) {
        // On NE marque PAS l'événement comme traité en cas d'erreur : il
        // sera retenté au prochain passage du cron. Pas d'échec silencieux,
        // pas de perte d'événement.
        this.logger.error(`Échec traitement outbox event=${event.id}: ${err.message}`);
      }
    }
  }

  private async handle(event: OutboxEventRow): Promise<void> {
    if (!this.notifiableEvents.has(event.event_type)) {
      return; // event tracé mais pas de notification (created/processing)
    }
    // Le payload est un snapshot suffisant des champs lus par enqueue().
    await this.webhooks.enqueue(event.payload as Payment);
  }
}
