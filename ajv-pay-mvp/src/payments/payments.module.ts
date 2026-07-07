import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsCoreModule } from './payments-core.module';
import { OrchestratorModule } from '../orchestrator/orchestrator.module';
import { MerchantsModule } from '../merchants/merchants.module';
import { AuditModule } from '../audit/audit.module';
import { ConnectorsModule } from '../connectors/connectors.module';
import { ProviderWebhooksController } from '../webhooks/provider-webhooks.controller';
import { ManualPaymentsModule } from '../manual-payments/manual-payments.module';

/**
 * Module "top-level" : porte les controllers HTTP. Il importe
 * OrchestratorModule pour les écritures (POST /payments, webhooks
 * entrants provider) et PaymentsCoreModule directement pour les lectures
 * simples (GET /payments/:id), qui n'ont pas besoin de passer par
 * l'orchestrateur. ManualPaymentsModule fournit ManualPaymentsService
 * (utilisé ici pour submit-proof/manual-info) — ManualReviewController
 * (revue admin) est déclaré dans ce module-là, pas ici.
 */
@Module({
  imports: [PaymentsCoreModule, OrchestratorModule, MerchantsModule, AuditModule, ConnectorsModule, ManualPaymentsModule],
  controllers: [PaymentsController, ProviderWebhooksController],
})
export class PaymentsModule {}
