import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { SessionGuard } from '../common/auth/session.guard';
import { DashboardAuthModule } from '../dashboard-auth/dashboard-auth.module';
import { MerchantsModule } from '../merchants/merchants.module';
import { LedgerModule } from '../ledger/ledger.module';
import { PaymentsCoreModule } from '../payments/payments-core.module';
import { OrchestratorModule } from '../orchestrator/orchestrator.module';

/**
 * DashboardAuthModule est importé ici pour que SessionGuard (qui dépend de
 * DashboardAuthService) puisse être instancié — la connexion/déconnexion
 * elles-mêmes vivent dans DashboardAuthModule/DashboardAuthController,
 * monté séparément dans AppModule.
 */
@Module({
  imports: [DashboardAuthModule, MerchantsModule, LedgerModule, PaymentsCoreModule, OrchestratorModule],
  controllers: [DashboardController],
  providers: [SessionGuard],
})
export class DashboardModule {}
