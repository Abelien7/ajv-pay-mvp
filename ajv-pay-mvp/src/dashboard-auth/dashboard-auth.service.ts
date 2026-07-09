import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { Merchant } from '../merchants/merchant.entity';
import { hashApiKey } from '../common/auth/hmac.util';
import { verifyPassword } from '../common/auth/password.util';

export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

interface MerchantUserRow {
  id: string;
  merchant_id: string;
  email: string;
  password_hash: string;
}

/**
 * Authentification du dashboard marchand (login humain email/mot de passe)
 * — complètement séparée de l'authentification API (clés live/test, voir
 * ApiKeyGuard). Le marchand n'a jamais besoin de connaître son hmac_secret
 * pour utiliser le dashboard.
 *
 * Jeton de session : une valeur aléatoire à 256 bits générée ici, dont seul
 * le hash SHA-256 (hashApiKey, réutilisé tel quel — même famille que les
 * clés API) est stocké en base. Pas de bcrypt sur le jeton : il est déjà
 * aléatoire, un hash lent n'ajouterait qu'un coût sur chaque requête
 * authentifiée sans bénéfice de sécurité.
 */
@Injectable()
export class DashboardAuthService {
  constructor(private readonly db: DatabaseService) {}

  /** Lève UnauthorizedException pour tout échec — jamais de détail sur la cause précise (email inconnu vs mot de passe faux). */
  async login(email: string, password: string): Promise<{ sessionToken: string; merchant: Merchant }> {
    const { rows } = await this.db.query<MerchantUserRow>(
      `SELECT * FROM merchant_users WHERE email = $1`,
      [email],
    );
    const user = rows[0];
    if (!user) {
      throw new UnauthorizedException('E-mail ou mot de passe invalide.');
    }

    const validPassword = await verifyPassword(password, user.password_hash);
    if (!validPassword) {
      throw new UnauthorizedException('E-mail ou mot de passe invalide.');
    }

    const { rows: merchantRows } = await this.db.query<Merchant>(
      `SELECT * FROM merchants WHERE id = $1 AND is_active = TRUE`,
      [user.merchant_id],
    );
    const merchant = merchantRows[0];
    if (!merchant) {
      throw new UnauthorizedException('Compte marchand inactif.');
    }

    const sessionToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    await this.db.query(
      `INSERT INTO merchant_sessions (merchant_user_id, session_token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, hashApiKey(sessionToken), expiresAt],
    );

    return { sessionToken, merchant };
  }

  async logout(sessionToken: string): Promise<void> {
    await this.db.query(
      `DELETE FROM merchant_sessions WHERE session_token_hash = $1`,
      [hashApiKey(sessionToken)],
    );
  }

  /** Résout un marchand actif à partir d'un jeton de session en clair — `null` si absent/expiré/marchand inactif. */
  async resolveSession(sessionToken: string): Promise<Merchant | null> {
    const { rows } = await this.db.query<Merchant>(
      `SELECT m.* FROM merchant_sessions s
       JOIN merchant_users u ON u.id = s.merchant_user_id
       JOIN merchants m ON m.id = u.merchant_id
       WHERE s.session_token_hash = $1 AND s.expires_at > NOW() AND m.is_active = TRUE`,
      [hashApiKey(sessionToken)],
    );
    return rows[0] ?? null;
  }
}
