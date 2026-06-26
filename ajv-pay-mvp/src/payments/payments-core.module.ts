import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { IdempotencyModule } from '../common/idempotency/idempotency.module';
import { EventsModule } from '../events/events.module';

/**
 * Module séparé du PaymentsModule "top-level" (qui porte les controllers)
 * pour permettre à OrchestratorModule de dépendre uniquement de
 * PaymentsService, sans jamais importer les controllers ni créer de cycle
 * avec OrchestratorModule.
 */
@Module({
  imports: [IdempotencyModule, EventsModule],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsCoreModule {}
