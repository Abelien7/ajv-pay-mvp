import { Module } from '@nestjs/common';
import { DashboardAuthService } from './dashboard-auth.service';
import { DashboardAuthController } from './dashboard-auth.controller';

/**
 * Login/logout du dashboard marchand (email + mot de passe → cookie de
 * session). `DashboardAuthService` est exporté pour que `SessionGuard`
 * (src/common/auth/session.guard.ts) puisse résoudre une session sur les
 * routes /dashboard/* qui l'utilisent — voir dashboard/dashboard.module.ts.
 */
@Module({
  providers: [DashboardAuthService],
  controllers: [DashboardAuthController],
  exports: [DashboardAuthService],
})
export class DashboardAuthModule {}
