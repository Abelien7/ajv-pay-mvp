import { Injectable, ConflictException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { Merchant } from './merchant.entity';
import { hashApiKey } from '../common/auth/hmac.util';
import { RegisterMerchantDto } from './dto/register-merchant.dto';

@Injectable()
export class MerchantsService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Retrouve un marchand actif à partir de sa clé API en clair (reçue dans
   * le header Authorization). On ne compare jamais la clé en clair : on la
   * hash et on compare le hash, pour ne jamais avoir de clé API lisible
   * en base, même côté serveur.
   */
  async findByApiKey(apiKey: string): Promise<Merchant | null> {
    const hash = hashApiKey(apiKey);
    const { rows } = await this.db.query<Merchant>(
      `SELECT * FROM merchants WHERE api_key_hash = $1 AND is_active = TRUE LIMIT 1`,
      [hash],
    );
    return rows[0] ?? null;
  }

  async findById(id: string): Promise<Merchant | null> {
    const { rows } = await this.db.query<Merchant>(
      `SELECT * FROM merchants WHERE id = $1 LIMIT 1`,
      [id],
    );
    return rows[0] ?? null;
  }

  /**
   * Crée un nouveau compte marchand. La clé API en clair (`apiKey`) est
   * retournée UNE SEULE FOIS — seul son hash est conservé en base.
   * Le `hmacSecret` est également retourné une seule fois pour que le
   * marchand puisse signer ses requêtes dashboard.
   */
  async register(dto: RegisterMerchantDto): Promise<{ merchant: Merchant; apiKey: string; hmacSecret: string }> {
    const apiKey = `ajvpay_${randomBytes(24).toString('hex')}`;
    const hmacSecret = randomBytes(32).toString('hex');
    const apiKeyHash = hashApiKey(apiKey);

    try {
      const { rows } = await this.db.query<Merchant>(
        `INSERT INTO merchants (name, email, api_key_hash, hmac_secret, webhook_url)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [dto.name, dto.email ?? null, apiKeyHash, hmacSecret, dto.webhookUrl ?? null],
      );
      return { merchant: rows[0], apiKey, hmacSecret };
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
