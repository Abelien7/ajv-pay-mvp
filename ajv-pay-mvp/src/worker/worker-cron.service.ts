import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OutboxProcessorService } from '../outbox/outbox-processor.service';
import { WebhooksService } from '../webhooks/webhooks.service';

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
    private readonly outboxProcessor: OutboxProcessorService,
    private readonly webhooks: WebhooksService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async tick(): Promise<void> {
    try {
      await this.outboxProcessor.processOutbox();
      await this.webhooks.processDue();
    } catch (err: any) {
      this.logger.error(`Erreur pendant le tick worker: ${err.message}`);
    }
  }
}
