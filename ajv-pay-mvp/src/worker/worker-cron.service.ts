import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import { OutboxProcessorService } from '../outbox/outbox-processor.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { AlertingService } from './alerting.service';

/**
 * Seul endroit du système avec un `@Cron` en continu — vit uniquement dans
 * le process Worker (voir worker.ts), un service Railway séparé de l'API
 * (qui, elle, déclenche déjà une livraison immédiate best-effort juste
 * après confirmation d'un paiement, voir PaymentOrchestrator). Ce tick est
 * le filet de sécurité qui rattrape tout ce que la livraison immédiate
 * aurait manqué (ex: le endpoint du marchand était temporairement injoignable).
 */
@Injectable()
export class WorkerCronService {
  private readonly logger = new Logger(WorkerCronService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly outboxProcessor: OutboxProcessorService,
    private readonly webhooks: WebhooksService,
    private readonly alerting: AlertingService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async tick(): Promise<void> {
    // Écrit AVANT le traitement, pas après : le battement de cœur doit
    // prouver que la boucle Worker tourne toujours, même si processOutbox/
    // processDue échouent eux-mêmes — /health (process API séparé) n'a
    // aucun autre moyen de savoir si ce process est encore vivant.
    await this.recordHeartbeat();

    try {
      await this.outboxProcessor.processOutbox();
      await this.webhooks.processDue();
    } catch (err: any) {
      this.logger.error(`Erreur pendant le tick worker: ${err.message}`);
    }

    try {
      await this.alerting.checkAndAlert();
    } catch (err: any) {
      this.logger.error(`Échec de la vérification d'alerte: ${err.message}`);
    }
  }

  private async recordHeartbeat(): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO worker_heartbeats (id, last_tick_at) VALUES ('worker', NOW())
         ON CONFLICT (id) DO UPDATE SET last_tick_at = NOW()`,
      );
    } catch (err: any) {
      this.logger.error(`Échec écriture du battement de cœur: ${err.message}`);
    }
  }
}
