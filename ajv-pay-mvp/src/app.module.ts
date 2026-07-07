import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from './database/database.module';
import { MerchantsModule } from './merchants/merchants.module';
import { PaymentsModule } from './payments/payments.module';
import { AuditModule } from './audit/audit.module';
import { HealthController } from './health.controller';

/**
 * Module racine du service Railway "API" (voir main.ts). Pas de
 * `ScheduleModule` ici : la boucle de fond en continu (outbox + livraison
 * webhook) vit uniquement dans le service "Worker" (voir worker.ts,
 * worker/worker.module.ts) — un second service Railway déployé depuis ce
 * même dépôt. L'API déclenche déjà une livraison immédiate best-effort
 * juste après une transition de paiement (voir PaymentOrchestrator), le
 * Worker n'étant qu'un filet de sécurité en continu.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    DatabaseModule,
    AuditModule,
    MerchantsModule,
    PaymentsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
