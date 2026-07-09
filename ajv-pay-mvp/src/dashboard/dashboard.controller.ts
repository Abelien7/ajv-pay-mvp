import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SessionGuard } from '../common/auth/session.guard';
import { CurrentMerchant } from '../common/auth/current-merchant.decorator';
import { Merchant } from '../merchants/merchant.entity';
import { MerchantsService } from '../merchants/merchants.service';
import { LedgerService } from '../ledger/ledger.service';
import { PaymentsService } from '../payments/payments.service';
import { PaymentOrchestrator } from '../orchestrator/payment-orchestrator.service';
import { UpdateWebhookUrlDto } from '../merchants/dto/update-webhook-url.dto';
import { toPaymentResponse } from '../payments/payment-response.mapper';

/**
 * Surface dédiée au dashboard humain (session cookie, voir SessionGuard) —
 * séparée de /merchants/me* et /payments/* (clé API, intégration
 * serveur-à-serveur, voir ApiKeyGuard). Réutilise les MÊMES services que
 * ces routes-là : aucune logique métier dupliquée, seul le guard change.
 */
@ApiExcludeController() // dashboard humain (cookie de session), pas une API d'intégration tierce
@Controller('dashboard')
@UseGuards(SessionGuard)
export class DashboardController {
  constructor(
    private readonly merchants: MerchantsService,
    private readonly ledger: LedgerService,
    private readonly payments: PaymentsService,
    private readonly orchestrator: PaymentOrchestrator,
  ) {}

  @Get('me')
  async getMe(@CurrentMerchant() merchant: Merchant) {
    const balance = await this.ledger.getMerchantBalance(merchant.id);
    return {
      id: merchant.id,
      name: merchant.name,
      email: merchant.email,
      webhook_url: merchant.webhook_url,
      balance,
      is_active: merchant.is_active,
    };
  }

  @Patch('webhook-url')
  async updateWebhookUrl(@CurrentMerchant() merchant: Merchant, @Body() dto: UpdateWebhookUrlDto) {
    const updated = await this.merchants.updateWebhookUrl(merchant.id, dto.webhookUrl);
    return { webhook_url: updated.webhook_url };
  }

  @Get('payments')
  async listPayments(
    @CurrentMerchant() merchant: Merchant,
    @Query('limit') limitParam?: string,
    @Query('offset') offsetParam?: string,
  ) {
    const limit = Math.min(Number(limitParam) || 20, 100);
    const offset = Number(offsetParam) || 0;
    const { items, total } = await this.payments.listPayments(merchant.id, limit, offset);
    return { items: items.map(toPaymentResponse), total, limit, offset };
  }

  @Post('payments/:id/refund')
  @HttpCode(200)
  async refund(@CurrentMerchant() merchant: Merchant, @Param('id') id: string) {
    await this.payments.getPayment(merchant.id, id); // lève 404 si le paiement n'appartient pas à ce marchand
    const payment = await this.orchestrator.refundPayment(id);
    return toPaymentResponse(payment);
  }
}
