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
import { CurrentPaymentMode } from '../common/auth/current-payment-mode.decorator';
import { PaymentMode } from '../merchants/merchant.entity';
import { PaymentsService } from './payments.service';
import { PaymentOrchestrator } from '../orchestrator/payment-orchestrator.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { Merchant } from '../merchants/merchant.entity';
import { ManualPaymentsService } from '../manual-payments/manual-payments.service';
import { SubmitProofDto } from '../manual-payments/dto/submit-proof.dto';
import { toPaymentResponse } from './payment-response.mapper';

@Controller('payments')
@UseGuards(ApiKeyGuard)
export class PaymentsController {
  constructor(
    private readonly orchestrator: PaymentOrchestrator,
    private readonly payments: PaymentsService,
    private readonly manualPayments: ManualPaymentsService,
  ) {}

  /**
   * Info publique (mais authentifiée marchand, par cohérence avec le reste)
   * pour le provider 'manual' : numéro marchand + syntaxe USSD pour chacun
   * des deux réseaux (Moov Money, Mixx by Yas). Volontairement séparé du
   * payload de création de paiement — ces informations sont fixes et
   * partagées par tous les paiements manuels, pas une donnée par paiement.
   */
  @Get('manual/info')
  manualInfo() {
    return this.manualPayments.getAllNetworksInfo();
  }

  /**
   * L'écriture (création de paiement) passe TOUJOURS par l'orchestrateur —
   * jamais directement par PaymentsService depuis un controller.
   */
  @Post()
  async create(
    @CurrentMerchant() merchant: Merchant,
    @CurrentPaymentMode() mode: PaymentMode,
    @Body() dto: CreatePaymentDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    const payment = await this.orchestrator.createPayment(dto, merchant, mode, idempotencyKey);
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

  /**
   * Soumet la preuve de paiement (ID de transaction mobile money) qu'un
   * client a communiquée au marchand pour un paiement 'manual'. Appelé par
   * le marchand (Mavahi, etc.) pour le compte de son client — le client
   * final ne parle jamais directement à AJV Pay. Ne change PAS le statut du
   * paiement : ça reste 'processing' jusqu'à la revue de l'admin plateforme
   * (voir ManualReviewController).
   */
  @Post(':id/submit-proof')
  @HttpCode(200)
  async submitProof(
    @CurrentMerchant() merchant: Merchant,
    @Param('id') id: string,
    @Body() dto: SubmitProofDto,
  ) {
    await this.manualPayments.submitProof(id, merchant.id, dto.reference, dto.note);
    return { status: 'submitted' };
  }

  private toResponse(payment: any) {
    return toPaymentResponse(payment);
  }
}
