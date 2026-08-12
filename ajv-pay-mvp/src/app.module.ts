import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './database/database.module';
import { MerchantsModule } from './merchants/merchants.module';
import { PaymentsModule } from './payments/payments.module';
import { AuditModule } from './audit/audit.module';
import { OutboxModule } from './outbox/outbox.module';
import { OutboxProcessorModule } from './outbox/outbox-processor.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { OrchestratorModule } from './orchestrator/orchestrator.module';
import { DashboardAuthModule } from './dashboard-auth/dashboard-auth.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SiteContentModule } from './site-content/site-content.module';
import { HealthController } from './health.controller';
import { WorkerCronService } from './worker/worker-cron.service';
import { AlertingService } from './worker/alerting.service';

/**
 * Module racine du service API (voir main.ts). Le `@Cron` en continu
 * (WorkerCronService/AlertingService, historiquement un process Railway
 * "Worker" séparé — voir worker.ts/worker.module.ts, gardés pour un futur
 * hébergeur qui supporterait de vrais background workers) tourne ici DANS
 * le même process HTTP depuis le passage à Render (2026-08-11) : le tier
 * gratuit de Render n'offre pas de service "worker" continu, seulement des
 * Web Services qui s'endorment après inactivité HTTP — un ping externe
 * régulier (cron-job.org sur /health) suffit à garder ce process éveillé,
 * ET par ricochet à garder le `@Cron` interne vivant. L'API déclenche déjà
 * une livraison immédiate best-effort juste après une transition de
 * paiement (voir PaymentOrchestrator), ce `@Cron` n'étant qu'un filet de
 * sécurité en continu.
 *
 * OutboxModule/WebhooksModule/OrchestratorModule sont déjà utilisés à
 * l'intérieur de PaymentsModule mais pas ré-exportés par lui — importés ici
 * séparément : OutboxModule/WebhooksModule pour que HealthController (voir
 * /health) puisse lire la taille des files d'attente, OrchestratorModule
 * pour que WorkerCronService puisse appeler
 * PaymentOrchestrator.reconcileStaleProcessingPayments (filet de sécurité
 * qui rattrape un paiement dont le webhook de confirmation ne serait jamais
 * arrivé). Nest réutilise la même instance singleton de chaque service,
 * importer un module deux fois ne duplique rien.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    ScheduleModule.forRoot(),
    DatabaseModule,
    AuditModule,
    MerchantsModule,
    PaymentsModule,
    OutboxModule,
    OutboxProcessorModule,
    WebhooksModule,
    OrchestratorModule,
    DashboardAuthModule,
    DashboardModule,
    SiteContentModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    WorkerCronService,
    AlertingService,
  ],
})
export class AppModule {}
