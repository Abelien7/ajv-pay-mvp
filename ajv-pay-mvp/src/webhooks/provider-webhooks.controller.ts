import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';
import { PaymentOrchestrator } from '../orchestrator/payment-orchestrator.service';
import { ConnectorService } from '../connectors/connector.service';
import { ProviderName } from '../connectors/connector.interface';
import { AuditLogService } from '../audit/audit-log.service';

/**
 * Endpoint public (pas d'ApiKeyGuard ici, car appelé par le provider, pas
 * par le marchand) recevant les notifications Flooz/Moov/CinetPay. Délègue
 * la logique métier à PaymentOrchestrator — ce controller ne fait que :
 *   1. déterminer sans ambiguïté le provider concerné (par la route appelée),
 *   2. vérifier l'authenticité du webhook (signature) avant tout traitement,
 *   3. router vers l'orchestrateur.
 *
 * Sécurité : si `verifyWebhookSignature` n'est pas implémenté pour un
 * provider donné (retourne `undefined`), on accepte le webhook mais on logge
 * un WARNING explicite — c'est un TODO de sécurité connu (voir adapters),
 * jamais un échec silencieux. Si la méthode est implémentée et retourne
 * `false`, le webhook est rejeté (401) et journalisé dans audit_logs.
 */
@Controller('webhooks')
export class ProviderWebhooksController {
  private readonly logger = new Logger(ProviderWebhooksController.name);

  constructor(
    private readonly orchestrator: PaymentOrchestrator,
    private readonly connector: ConnectorService,
    private readonly audit: AuditLogService,
  ) {}

  @Post('flooz')
  @HttpCode(200)
  async handleFloozWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Body() body: unknown,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    await this.handle('flooz', req, body, headers);
    return { received: true };
  }

  @Post('moov')
  @HttpCode(200)
  async handleMoovWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Body() body: unknown,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    await this.handle('moov', req, body, headers);
    return { received: true };
  }

  @Post('cinetpay')
  @HttpCode(200)
  async handleCinetPayWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Body() body: unknown,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    await this.handle('cinetpay', req, body, headers);
    return { received: true };
  }

  private async handle(
    provider: ProviderName,
    req: RawBodyRequest<Request>,
    body: unknown,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<void> {
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(body ?? {}));
    const verified = this.connector.verifySignature(provider, rawBody, headers);

    if (verified === false) {
      await this.audit.record({
        actorType: 'provider',
        actorId: provider,
        action: 'webhook.rejected',
        resourceType: 'webhook',
        ipAddress: req.ip,
        metadata: { reason: 'invalid_signature' },
      });
      throw new UnauthorizedException(`Signature de webhook ${provider} invalide`);
    }
    if (verified === undefined) {
      this.logger.warn(
        `Vérification de signature non implémentée pour le provider "${provider}" — ` +
          `webhook accepté sans authentification cryptographique (TODO sécurité connu, voir adapter).`,
      );
    }

    await this.orchestrator.handleProviderWebhook(provider, body);
  }
}
