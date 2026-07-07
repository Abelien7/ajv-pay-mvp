import { Module } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { MerchantsModule } from '../merchants/merchants.module';

/**
 * Ce module ne gère QUE les webhooks sortants (notifications vers les
 * marchands). Les webhooks entrants des providers (Moov/Mixx) sont reçus
 * par ProviderWebhooksController, déclaré dans PaymentsModule, pour éviter
 * une dépendance circulaire (ce controller a besoin de PaymentsService).
 *
 * Pas de `@Cron` ici : ce module est partagé par le process API (main.ts —
 * livraison immédiate best-effort juste après une transition de statut,
 * voir PaymentOrchestrator) et par le process Worker (worker.ts, service
 * Railway séparé — voir WorkerCronService, seul endroit du système avec un
 * `@Cron` en continu, filet de sécurité qui rattrape ce que la livraison
 * immédiate aurait manqué).
 */
@Module({
  imports: [MerchantsModule],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
