import { Injectable, ConflictException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { Merchant, PaymentMode } from './merchant.entity';
import { hashApiKey } from '../common/auth/hmac.util';
import { RegisterMerchantDto } from './dto/register-merchant.dto';

export interface MerchantMatch {
  merchant: Merchant;
  mode: PaymentMode;
}

@Injectable()
export class MerchantsService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Retrouve un marchand actif à partir de sa clé API en clair (reçue dans
   * le header Authorization) — clé "live" OU clé "test", jamais les deux à
   * la fois (voir migrations/009_sandbox_mode.sql). On ne compare jamais la
   * clé en clair : on la hash et on compare le hash, pour ne jamais avoir de
   * clé API lisible en base, même côté serveur. Le mode résolu ici décide,
   * plus loin dans la requête, si le paiement touchera le ledger ou non
   * (voir PaymentOrchestrator/TestModeAdapter) — jamais choisi par le
   * marchand lui-même dans le corps de la requête.
   */
  async findByApiKey(apiKey: string): Promise<MerchantMatch | null> {
    const hash = hashApiKey(apiKey);
    const { rows } = await this.db.query<Merchant>(
      `SELECT * FROM merchants
       WHERE (api_key_hash = $1 OR test_api_key_hash = $1) AND is_active = TRUE
       LIMIT 1`,
      [hash],
    );
    const merchant = rows[0];
    if (!merchant) return null;

    const mode: PaymentMode = merchant.test_api_key_hash === hash ? 'test' : 'live';
    return { merchant, mode };
  }

  async findById(id: string): Promise<Merchant | null> {
    const { rows } = await this.db.query<Merchant>(
      `SELECT * FROM merchants WHERE id = $1 LIMIT 1`,
      [id],
    );
    return rows[0] ?? null;
  }

  /**
   * Crée un nouveau compte marchand avec SES DEUX paires de clés d'un coup
   * (comme l'onboarding Stripe) : une "live" (paiements réels, ledger) et
   * une "test" (paiements simulés, jamais de ledger — voir
   * TestModeAdapter). Les 4 secrets en clair ne sont retournés qu'UNE
   * SEULE FOIS — seuls leurs hashs sont conservés en base.
   */
  async register(
    dto: RegisterMerchantDto,
  ): Promise<{
    merchant: Merchant;
    live: { apiKey: string; hmacSecret: string };
    test: { apiKey: string; hmacSecret: string };
  }> {
    const liveApiKey = `ajvpay_live_${randomBytes(24).toString('hex')}`;
    const liveHmacSecret = randomBytes(32).toString('hex');
    const testApiKey = `ajvpay_test_${randomBytes(24).toString('hex')}`;
    const testHmacSecret = randomBytes(32).toString('hex');

    try {
      const { rows } = await this.db.query<Merchant>(
        `INSERT INTO merchants (name, email, api_key_hash, hmac_secret, test_api_key_hash, test_hmac_secret, webhook_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          dto.name,
          dto.email ?? null,
          hashApiKey(liveApiKey),
          liveHmacSecret,
          hashApiKey(testApiKey),
          testHmacSecret,
          dto.webhookUrl ?? null,
        ],
      );
      return {
        merchant: rows[0],
        live: { apiKey: liveApiKey, hmacSecret: liveHmacSecret },
        test: { apiKey: testApiKey, hmacSecret: testHmacSecret },
      };
    } catch (err: any) {
      if (err.code === '23505') {
        throw new ConflictException('Un compte marchand avec cet e-mail existe déjà.');
      }
      throw err;
    }
  }

  /** Utilisé par le dashboard marchand pour configurer son endpoint de notification. */
  async updateWebhookUrl(merchantId: string, webhookUrl: string): Promise<Merchant> {
    const { rows } = await this.db.query<Merchant>(
      `UPDATE merchants SET webhook_url = $2, updated_at = now() WHERE id = $1 RETURNING *`,
      [merchantId, webhookUrl],
    );
    return rows[0];
  }
}
