import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { AdminApiKeyGuard } from '../common/auth/admin-api-key.guard';
import { DashboardAuthService } from './dashboard-auth.service';
import { AdminResetPasswordDto } from './dto/admin-reset-password.dto';

/**
 * Réservé à l'admin plateforme (AdminApiKeyGuard) — voir
 * DashboardAuthService.resetPasswordByEmail pour le raisonnement complet :
 * faute d'infrastructure d'e-mail dans ce projet, un marchand qui oublie
 * son mot de passe dashboard contacte l'admin, qui lui en fixe un nouveau
 * ici plutôt que d'attendre un lien de réinitialisation envoyé par mail.
 */
@ApiExcludeController() // usage interne admin plateforme, jamais un marchand
@Controller('admin/merchant-users')
@UseGuards(AdminApiKeyGuard)
export class AdminMerchantUsersController {
  constructor(private readonly dashboardAuth: DashboardAuthService) {}

  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() dto: AdminResetPasswordDto) {
    await this.dashboardAuth.resetPasswordByEmail(dto.email, dto.newPassword);
    return { status: 'ok' };
  }
}
