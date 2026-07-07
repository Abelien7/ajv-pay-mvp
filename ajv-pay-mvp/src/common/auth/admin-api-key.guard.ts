import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

/**
 * Authentifie l'admin plateforme AJV Pay (toi) — distinct des marchands
 * (voir ApiKeyGuard, qui identifie un marchand par sa propre clé API). Une
 * seule clé partagée suffit pour ce MVP : un seul admin humain vérifie les
 * paiements manuels de tous les marchands connectés, pas de gestion
 * multi-utilisateurs nécessaire pour l'instant.
 */
@Injectable()
export class AdminApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const expected = this.config.get<string>('ADMIN_API_KEY', '');

    if (!expected) {
      throw new UnauthorizedException('ADMIN_API_KEY non configurée côté serveur.');
    }

    const authHeader = req.headers['authorization'];
    if (typeof authHeader !== 'string' || authHeader !== `Bearer ${expected}`) {
      throw new UnauthorizedException('Clé admin invalide.');
    }
    return true;
  }
}
