import { Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { AdminApiKeyGuard } from '../common/auth/admin-api-key.guard';
import { ManualPaymentsService } from './manual-payments.service';
import { PaymentOrchestrator } from '../orchestrator/payment-orchestrator.service';
import { Payment } from '../payments/payment.entity';

/**
 * Réservé à l'admin plateforme AJV Pay (AdminApiKeyGuard, distinct des
 * marchands) : file d'attente centralisée des paiements manuels de TOUS les
 * marchands connectés (Mavahi, futurs projets), et actions de confirmation/
 * rejet. C'est le seul endroit du système où quelqu'un voit des paiements
 * au-delà de son propre marchand.
 */
@Controller('admin/manual-payments')
@UseGuards(AdminApiKeyGuard)
export class ManualReviewController {
  constructor(
    private readonly manualPayments: ManualPaymentsService,
    private readonly orchestrator: PaymentOrchestrator,
  ) {}

  @Get('pending')
  async pending() {
    return this.manualPayments.listPending();
  }

  @Post(':id/confirm')
  @HttpCode(200)
  async confirm(@Param('id') id: string) {
    const payment = await this.orchestrator.confirmManualPayment(id);
    return this.toResponse(payment);
  }

  @Post(':id/reject')
  @HttpCode(200)
  async reject(@Param('id') id: string) {
    const payment = await this.orchestrator.rejectManualPayment(id);
    return this.toResponse(payment);
  }

  private toResponse(payment: Payment) {
    return {
      id: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      method: payment.method,
      status: payment.status,
      provider_reference: payment.provider_reference,
      created_at: payment.created_at,
      updated_at: payment.updated_at,
    };
  }
}
