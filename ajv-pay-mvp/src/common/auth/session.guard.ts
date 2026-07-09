import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { DashboardAuthService } from '../../dashboard-auth/dashboard-auth.service';
import { CSRF_HEADER_NAME, SESSION_COOKIE_NAME } from '../../dashboard-auth/session-cookie.constants';

/**
 * Authentifie les requêtes du dashboard marchand (routes /dashboard/*) via
 * le cookie de session — jamais une clé API/HMAC (voir ApiKeyGuard pour
 * l'authentification serveur-à-serveur, un guard volontairement séparé).
 *
 * Le cookie de session est SameSite=None (déploiement cross-origin réel :
 * dashboard Vercel, API Railway), donc un site tiers peut faire envoyer ce
 * cookie par le navigateur d'un marchand connecté — c'est le CSRF. Défense :
 * exiger un header personnalisé sur toute requête mutante (voir
 * session-cookie.constants.ts pour le détail du raisonnement). Une lecture
 * simple (GET) ne mute rien, donc pas de vérification CSRF nécessaire pour
 * elle — même logique que l'exemption GET dans ApiKeyGuard.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly dashboardAuth: DashboardAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { merchant?: any; merchantUserId?: string }>();

    const token = req.cookies?.[SESSION_COOKIE_NAME];
    if (!token) {
      throw new UnauthorizedException('Session dashboard manquante.');
    }

    if (req.method !== 'GET' && !req.headers[CSRF_HEADER_NAME]) {
      throw new UnauthorizedException('Requête refusée (protection CSRF).');
    }

    const resolved = await this.dashboardAuth.resolveSession(token);
    if (!resolved) {
      throw new UnauthorizedException('Session dashboard invalide ou expirée.');
    }

    req.merchant = resolved.merchant;
    req.merchantUserId = resolved.merchantUserId;
    return true;
  }
}
