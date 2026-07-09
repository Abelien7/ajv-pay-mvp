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
   * Inscription publique — aucune authentification requise. Retourne LES
   * DEUX paires de clés (live + test, voir migrations/009_sandbox_mode.sql)
   * EN CLAIR une seule fois. Le marchand doit les conserver immédiatement :
   * elles ne sont plus récupérables après cette réponse (seuls les hashs
   * sont stockés en base). Recommandation : intégrer et tester d'abord avec
   * la paire "test" (aucun impact financier, résolution instantanée), ne
   * passer en "live" qu'une fois l'intégration validée.
   */
  @Post('register')
  @HttpCode(201)
  async register(@Body() dto: RegisterMerchantDto) {
    const { merchant, live, test } = await this.merchants.register(dto);
    return {
      id: merchant.id,
      name: merchant.name,
      email: merchant.email,
      live_api_key: live.apiKey,
      live_hmac_secret: live.hmacSecret,
      test_api_key: test.apiKey,
      test_hmac_secret: test.hmacSecret,
      is_active: merchant.is_active,
      created_at: merchant.created_at,
      _notice:
        'Conservez ces 4 valeurs maintenant — elles ne seront plus affichées. Commencez par intégrer avec la paire "test", aucun impact financier.',
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
