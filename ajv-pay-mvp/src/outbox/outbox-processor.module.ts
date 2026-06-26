import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { OutboxModule } from './outbox.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { OutboxProcessorCron } from './outbox-processor.cron';

/**
 * Module séparé d'OutboxModule pour la même raison que PaymentsCoreModule
 * est séparé de PaymentsModule : OrchestratorModule doit pouvoir importer
 * OutboxModule (pour publier des événements) SANS dépendre de
 * WebhooksModule. Seul ce module-ci connaît les deux côtés (publication +
 * consommation), exactement comme un vrai bus d'événements le ferait.
 */
@Module({
  imports: [ScheduleModule, OutboxModule, WebhooksModule],
  providers: [OutboxProcessorCron],
})
export class OutboxProcessorModule {}
