import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { MerchantsService } from '../../merchants/merchants.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { computeHmacSignature, safeCompare } from './hmac.util';

/**
 * Authentification des requêtes marchand entrantes :
 *   - header "Authorization: Bearer <api_key>" → identifie le marchand
 *   - header "X-Signature: <hmac>" → garantit l'intégrité du corps de requête
 *     (signature = HMAC-SHA256(secret_marchand, JSON.stringify(body)))
 *
 * Le marchand authentifié est attaché à `req.merchant` pour les controllers.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly merchants: MerchantsService,
    private readonly audit: AuditLogService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { merchant?: any }>();
    const ip = req.ip;

    const authHeader = this.singleHeader(req.headers['authorization']);
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      await this.audit.record({
        actorType: 'merchant',
        action: 'auth.failed',
        resourceType: 'api_request',
        ipAddress: ip,
        metadata: { reason: 'missing_api_key', path: req.path },
      });
      throw new UnauthorizedException('Clé API manquante');
    }
    const apiKey = authHeader.slice('Bearer '.length).trim();

    const merchant = await this.merchants.findByApiKey(apiKey);
    if (!merchant) {
      await this.audit.record({
        actorType: 'merchant',
        action: 'auth.failed',
        resourceType: 'api_request',
        ipAddress: ip,
        metadata: { reason: 'invalid_api_key', path: req.path },
      });
      throw new UnauthorizedException('Clé API invalide');
    }

    const signature = this.singleHeader(req.headers['x-signature']);
    if (signature) {
      // La signature est optionnelle pour GET (lecture simple), mais
      // obligatoire dès qu'un body est envoyé (POST/PUT) — voir contrôle ci-dessous.
      const expected = computeHmacSignature(
        merchant.hmac_secret,
        JSON.stringify(req.body ?? {}),
      );
      if (!safeCompare(signature, expected)) {
        await this.audit.record({
          actorType: 'merchant',
          actorId: merchant.id,
          action: 'auth.failed',
          resourceType: 'api_request',
          ipAddress: ip,
          metadata: { reason: 'invalid_signature', path: req.path },
        });
        throw new UnauthorizedException('Signature HMAC invalide');
      }
    } else if (req.method !== 'GET') {
      throw new UnauthorizedException('Signature HMAC requise pour cette opération');
    }

    req.merchant = merchant;
    return true;
  }

  /**
   * Un header HTTP peut techniquement être reçu comme un tableau (plusieurs
   * occurrences du même nom de header). Pour Authorization/X-Signature,
   * c'est toujours une anomalie — on rejette explicitement plutôt que de
   * prendre silencieusement le premier élément, ce qui pourrait masquer une
   * tentative de confusion de header côté proxy/client malveillant.
   */
  private singleHeader(value: string | string[] | undefined): string | undefined {
    if (Array.isArray(value)) {
      throw new UnauthorizedException('Header dupliqué non autorisé');
    }
    return value;
  }
}
