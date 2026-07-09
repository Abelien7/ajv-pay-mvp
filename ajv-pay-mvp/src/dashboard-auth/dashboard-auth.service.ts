import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { Merchant } from '../merchants/merchant.entity';
import { hashApiKey } from '../common/auth/hmac.util';
import { hashPassword, verifyPassword } from '../common/auth/password.util';

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

  /** Résout un marchand actif + l'id de son merchant_user à partir d'un jeton de session en clair — `null` si absent/expiré/marchand inactif. */
  async resolveSession(sessionToken: string): Promise<{ merchant: Merchant; merchantUserId: string } | null> {
    const { rows } = await this.db.query<Merchant & { merchant_user_id: string }>(
      `SELECT m.*, u.id AS merchant_user_id FROM merchant_sessions s
       JOIN merchant_users u ON u.id = s.merchant_user_id
       JOIN merchants m ON m.id = u.merchant_id
       WHERE s.session_token_hash = $1 AND s.expires_at > NOW() AND m.is_active = TRUE`,
      [hashApiKey(sessionToken)],
    );
    const row = rows[0];
    if (!row) return null;
    const { merchant_user_id, ...merchant } = row;
    return { merchant: merchant as Merchant, merchantUserId: merchant_user_id };
  }

  /**
   * Changement de mot de passe self-service (marchand déjà connecté,
   * confirme son mot de passe actuel). Les sessions existantes (y compris
   * la session courante) ne sont volontairement pas invalidées ici —
   * simplification assumée pour ce MVP, à revoir si un jour plusieurs
   * personnes partagent un même compte marchand.
   */
  async changePassword(merchantUserId: string, currentPassword: string, newPassword: string): Promise<void> {
    const { rows } = await this.db.query<MerchantUserRow>(
      `SELECT * FROM merchant_users WHERE id = $1`,
      [merchantUserId],
    );
    const user = rows[0];
    if (!user) {
      throw new NotFoundException('Compte introuvable.');
    }
    const validPassword = await verifyPassword(currentPassword, user.password_hash);
    if (!validPassword) {
      throw new UnauthorizedException('Mot de passe actuel invalide.');
    }
    if (newPassword.length < 8) {
      throw new BadRequestException('Le nouveau mot de passe doit contenir au moins 8 caractères.');
    }

    await this.db.query(
      `UPDATE merchant_users SET password_hash = $2, updated_at = NOW() WHERE id = $1`,
      [merchantUserId, await hashPassword(newPassword)],
    );
  }

  /**
   * Réinitialisation par l'admin plateforme (voir AdminApiKeyGuard) — pas de
   * vérification de l'ancien mot de passe, l'autorité vient de la clé
   * admin. Existe faute d'infrastructure d'e-mail dans ce projet pour un
   * flux "mot de passe oublié" en libre-service : un marchand qui perd son
   * mot de passe contacte l'admin, qui lui en fixe un nouveau ici.
   * Invalide toutes les sessions existantes de ce compte par précaution
   * (un mot de passe oublié peut aussi signifier un accès compromis).
   */
  async resetPasswordByEmail(email: string, newPassword: string): Promise<void> {
    if (newPassword.length < 8) {
      throw new BadRequestException('Le nouveau mot de passe doit contenir au moins 8 caractères.');
    }
    const { rows } = await this.db.query<MerchantUserRow>(
      `SELECT * FROM merchant_users WHERE email = $1`,
      [email],
    );
    const user = rows[0];
    if (!user) {
      throw new NotFoundException(`Aucun compte de connexion dashboard pour l'e-mail "${email}".`);
    }

    await this.db.withTransaction(async (client) => {
      await client.query(
        `UPDATE merchant_users SET password_hash = $2, updated_at = NOW() WHERE id = $1`,
        [user.id, await hashPassword(newPassword)],
      );
      await client.query(`DELETE FROM merchant_sessions WHERE merchant_user_id = $1`, [user.id]);
    });
  }
}
