import { Module } from '@nestjs/common';
import { PaymentOrchestrator } from './payment-orchestrator.service';
import { PaymentsCoreModule } from '../payments/payments-core.module';
import { ConnectorsModule } from '../connectors/connectors.module';
import { LedgerModule } from '../ledger/ledger.module';
import { OutboxModule } from '../outbox/outbox.module';
import { OutboxProcessorModule } from '../outbox/outbox-processor.module';
import { WebhooksModule } from '../webhooks/webhooks.module';

/**
 * Assemble les "providers de side-effects" derrière le seul composant qui a
 * le droit de les coordonner : PaymentOrchestrator. DatabaseService n'a pas
 * besoin d'être importé ici : il est déclaré @Global() dans DatabaseModule
 * (voir src/database/database.module.ts) et donc injectable partout —
 * mais c'est bien PaymentOrchestrator qui pilote désormais la transaction
 * SQL unique couvrant statut + ledger + outbox pour toute transition finale
 * (voir payment-orchestrator.service.ts). OutboxProcessorModule et
 * WebhooksModule sont importés en plus d'OutboxModule pour que
 * l'orchestrateur puisse déclencher la livraison webhook immédiatement
 * après le commit, sans dépendre d'un cron en tâche de fond.
 */
@Module({
  imports: [PaymentsCoreModule, ConnectorsModule, LedgerModule, OutboxModule, OutboxProcessorModule, WebhooksModule],
  providers: [PaymentOrchestrator],
  exports: [PaymentOrchestrator],
})
export class OrchestratorModule {}
