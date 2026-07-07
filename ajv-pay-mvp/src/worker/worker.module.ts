import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from '../database/database.module';
import { OutboxProcessorModule } from '../outbox/outbox-processor.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { WorkerCronService } from './worker-cron.service';

/**
 * Module racine du process Worker (voir worker.ts) — délibérément séparé
 * d'AppModule (le process API, voir main.ts) : pas de controllers HTTP ici,
 * juste la boucle de fond qui traite l'outbox et livre les webhooks
 * marchands en continu. Les deux processes partagent le même code
 * (PaymentsService, LedgerService, etc. via les modules importés) mais
 * tournent comme deux services Railway distincts, démarrés par des
 * commandes différentes (`npm run start` vs `npm run start:worker`).
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    OutboxProcessorModule,
    WebhooksModule,
  ],
  providers: [WorkerCronService],
})
export class WorkerModule {}
