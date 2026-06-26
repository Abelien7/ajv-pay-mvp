import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsCoreModule } from './payments-core.module';
import { OrchestratorModule } from '../orchestrator/orchestrator.module';
import { MerchantsModule } from '../merchants/merchants.module';
import { AuditModule } from '../audit/audit.module';
import { ConnectorsModule } from '../connectors/connectors.module';
import { ProviderWebhooksController } from '../webhooks/provider-webhooks.controller';

/**
 * Module "top-level" : porte les controllers HTTP. Il importe
 * OrchestratorModule pour les écritures (POST /payments, webhooks
 * entrants provider) et PaymentsCoreModule directement pour les lectures
 * simples (GET /payments/:id), qui n'ont pas besoin de passer par
 * l'orchestrateur.
 */
@Module({
  imports: [PaymentsCoreModule, OrchestratorModule, MerchantsModule, AuditModule, ConnectorsModule],
  controllers: [PaymentsController, ProviderWebhooksController],
})
export class PaymentsModule {}
