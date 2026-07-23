import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { OutboxService } from './outbox.service';
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
    private readonly db: DatabaseService,
    private readonly outbox: OutboxService,
    private readonly webhooks: WebhooksService,
  ) {}

  /**
   * Traite jusqu'à 50 événements, un par un, chacun réclamé (`FOR UPDATE
   * SKIP LOCKED`, voir OutboxService.claimNext) et marqué traité dans SA
   * PROPRE transaction — jamais une seule grande transaction pour tout le
   * lot, pour qu'un échec sur un événement ne fasse pas annuler (et donc
   * retraiter en double) les événements précédents déjà traités avec
   * succès dans cette même passe. Le process API (livraison immédiate
   * après chaque transition) et le process Worker (@Cron 10s) peuvent
   * appeler cette méthode en concurrence sans jamais traiter deux fois le
   * même événement.
   */
  async processOutbox(): Promise<void> {
    for (let i = 0; i < 50; i++) {
      const processed = await this.processNext();
      if (!processed) return;
    }
  }

  /** @returns true si un événement a été réclamé et traité, false si la file est vide. */
  private async processNext(): Promise<boolean> {
    try {
      return await this.db.withTransaction(async (client) => {
        const event = await this.outbox.claimNext(client);
        if (!event) return false;

        if (this.notifiableEvents.has(event.event_type)) {
          // Le payload est un snapshot suffisant des champs lus par enqueue().
          await this.webhooks.enqueueInTransaction(client, event.payload as Payment);
        }

        await this.outbox.markProcessedInTransaction(client, event.id);
        return true;
      });
    } catch (err: any) {
      // On NE marque PAS l'événement comme traité en cas d'erreur (la
      // transaction entière est annulée) : il sera retenté au prochain
      // appel (livraison immédiate suivante ou prochain tick du Worker).
      // Pas d'échec silencieux, pas de perte d'événement — mais on arrête
      // cette passe pour ne pas boucler indéfiniment sur le même événement
      // en échec.
      this.logger.error(`Échec traitement outbox: ${err.message}`);
      return false;
    }
  }
}
