import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { WebhooksService } from './webhooks.service';
import { WebhooksCron } from './webhooks.cron';
import { MerchantsModule } from '../merchants/merchants.module';

/**
 * Ce module ne gère QUE les webhooks sortants (notifications vers les
 * marchands). Les webhooks entrants des providers (Flooz/Moov) sont reçus
 * par ProviderWebhooksController, déclaré dans PaymentsModule, pour éviter
 * une dépendance circulaire (ce controller a besoin de PaymentsService).
 */
@Module({
  imports: [ScheduleModule, MerchantsModule],
  providers: [WebhooksService, WebhooksCron],
  exports: [WebhooksService],
})
export class WebhooksModule {}
