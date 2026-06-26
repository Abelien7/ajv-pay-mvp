import { Body, Controller, Get, HttpCode, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../common/auth/api-key.guard';
import { CurrentMerchant } from '../common/auth/current-merchant.decorator';
import { Merchant } from './merchant.entity';
import { MerchantsService } from './merchants.service';
import { LedgerService } from '../ledger/ledger.service';
import { RegisterMerchantDto } from './dto/register-merchant.dto';
import { UpdateWebhookUrlDto } from './dto/update-webhook-url.dto';

@Controller('merchants')
export class MerchantsController {
  constructor(
    private readonly merchants: MerchantsService,
    private readonly ledger: LedgerService,
  ) {}

  /**
   * Inscription publique — aucune authentification requise.
   * Retourne la clé API et le secret HMAC EN CLAIR une seule fois.
   * Le marchand doit les conserver immédiatement : ils ne sont plus
   * récupérables après cette réponse (seul le hash est stocké en base).
   */
  @Post('register')
  @HttpCode(201)
  async register(@Body() dto: RegisterMerchantDto) {
    const { merchant, apiKey, hmacSecret } = await this.merchants.register(dto);
    return {
      id: merchant.id,
      name: merchant.name,
      email: merchant.email,
      api_key: apiKey,
      hmac_secret: hmacSecret,
      is_active: merchant.is_active,
      created_at: merchant.created_at,
      _notice: 'Conservez api_key et hmac_secret maintenant — ils ne seront plus affichés.',
    };
  }

  /** Profil + solde du marchand authentifié (utilisé par le dashboard). */
  @Get('me')
  @UseGuards(ApiKeyGuard)
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

  @Patch('me/webhook-url')
  @UseGuards(ApiKeyGuard)
  async updateWebhookUrl(@CurrentMerchant() merchant: Merchant, @Body() dto: UpdateWebhookUrlDto) {
    const updated = await this.merchants.updateWebhookUrl(merchant.id, dto.webhookUrl);
    return { webhook_url: updated.webhook_url };
  }
}
