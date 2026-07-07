import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ManualPaymentsService } from './manual-payments.service';
import { ManualReviewController } from './manual-review.controller';
import { OrchestratorModule } from '../orchestrator/orchestrator.module';

/**
 * `ManualPaymentsService` est exporté pour être réutilisé par
 * `PaymentsController` (route `submit-proof`, côté marchand) — la revue
 * admin (`ManualReviewController`) vit ici, mais l'écriture de la preuve
 * reste rattachée au flux marchand normal dans PaymentsModule.
 */
@Module({
  imports: [ConfigModule, OrchestratorModule],
  controllers: [ManualReviewController],
  providers: [ManualPaymentsService],
  exports: [ManualPaymentsService],
})
export class ManualPaymentsModule {}
