import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiKeyGuard } from '../common/auth/api-key.guard';
import { CurrentMerchant } from '../common/auth/current-merchant.decorator';
import { PaymentsService } from './payments.service';
import { PaymentOrchestrator } from '../orchestrator/payment-orchestrator.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { Merchant } from '../merchants/merchant.entity';

@Controller('payments')
@UseGuards(ApiKeyGuard)
export class PaymentsController {
  constructor(
    private readonly orchestrator: PaymentOrchestrator,
    private readonly payments: PaymentsService,
  ) {}

  /**
   * L'écriture (création de paiement) passe TOUJOURS par l'orchestrateur —
   * jamais directement par PaymentsService depuis un controller.
   */
  @Post()
  async create(
    @CurrentMerchant() merchant: Merchant,
    @Body() dto: CreatePaymentDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    const payment = await this.orchestrator.createPayment(dto, merchant, idempotencyKey);
    return this.toResponse(payment);
  }

  /** Liste paginée — alimente le dashboard marchand. */
  @Get()
  async list(
    @CurrentMerchant() merchant: Merchant,
    @Query('limit') limitParam?: string,
    @Query('offset') offsetParam?: string,
  ) {
    const limit = Math.min(Number(limitParam) || 20, 100);
    const offset = Number(offsetParam) || 0;
    const { items, total } = await this.payments.listPayments(merchant.id, limit, offset);
    return { items: items.map((p) => this.toResponse(p)), total, limit, offset };
  }

  /** La lecture simple n'a pas besoin de coordination — accès direct à PaymentsService. */
  @Get(':id')
  async getById(@CurrentMerchant() merchant: Merchant, @Param('id') id: string) {
    const payment = await this.payments.getPayment(merchant.id, id);
    return this.toResponse(payment);
  }

  /**
   * Déclenche un remboursement. On vérifie d'abord que le paiement appartient
   * au marchand authentifié (scope guard), puis on délègue à l'orchestrateur
   * qui appelle le provider et commet la transition refunded + ledger + outbox
   * en une seule transaction atomique.
   */
  @Post(':id/refund')
  @HttpCode(200)
  async refund(@CurrentMerchant() merchant: Merchant, @Param('id') id: string) {
    await this.payments.getPayment(merchant.id, id); // lève 404 si le paiement n'appartient pas à ce marchand
    const payment = await this.orchestrator.refundPayment(id);
    return this.toResponse(payment);
  }

  private toResponse(payment: any) {
    return {
      id: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      method: payment.method,
      status: payment.status,
      provider_reference: payment.provider_reference,
      redirect_url: payment.redirect_url,
      created_at: payment.created_at,
      updated_at: payment.updated_at,
    };
  }
}
