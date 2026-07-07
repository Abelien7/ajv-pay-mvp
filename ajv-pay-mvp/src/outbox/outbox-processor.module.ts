import { Module } from '@nestjs/common';
import { OutboxModule } from './outbox.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { OutboxProcessorService } from './outbox-processor.service';

/**
 * Module séparé d'OutboxModule pour la même raison que PaymentsCoreModule
 * est séparé de PaymentsModule : OrchestratorModule doit pouvoir importer
 * OutboxModule (pour publier des événements, écriture) indépendamment de
 * ce module-ci (lecture + notification). Exporté pour que
 * OrchestratorModule (process API, livraison immédiate) et WorkerModule
 * (process Worker, `@Cron` en continu — filet de sécurité) puissent tous
 * les deux appeler `processOutbox()`.
 */
@Module({
  imports: [OutboxModule, WebhooksModule],
  providers: [OutboxProcessorService],
  exports: [OutboxProcessorService],
})
export class OutboxProcessorModule {}
