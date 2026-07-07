import { Injectable, Logger } from '@nestjs/common';
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
 * Pas de `@Cron` ici : `processOutbox()` est appelée de deux façons — juste
 * après qu'un paiement change de statut (PaymentOrchestrator, dans le
 * process API, livraison quasi immédiate) et en continu par
 * `WorkerCronService` (process Worker, service Railway séparé — filet de
 * sécurité pour tout ce qui aurait échoué au premier passage).
 */
@Injectable()
export class OutboxProcessorService {
  private readonly logger = new Logger(OutboxProcessorService.name);

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

  async processOutbox(): Promise<void> {
    const events = await this.outbox.listUnprocessed();

    for (const event of events) {
      try {
        await this.handle(event);
        await this.outbox.markProcessed(event.id);
      } catch (err: any) {
        // On NE marque PAS l'événement comme traité en cas d'erreur : il
        // sera retenté au prochain appel (livraison immédiate suivante ou
        // prochain tick du Worker). Pas d'échec silencieux, pas de perte
        // d'événement.
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
