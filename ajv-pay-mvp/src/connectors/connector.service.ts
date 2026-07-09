import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PAYMENT_ADAPTER_REGISTRY } from './connector.token';
import { TestModeAdapter } from './adapters/test-mode.adapter';
import {
  InitiateResult,
  PaymentProviderAdapter,
  ProviderName,
  StatusResult,
  WebhookParseResult,
} from './connector.interface';
import { Payment } from '../payments/payment.entity';

/**
 * Façade autour du registre de tous les providers actifs. Route chaque
 * opération vers l'adapter correspondant au `method` du paiement (ou au nom
 * de provider explicite, ex: pour les webhooks, où la route HTTP appelée
 * — /webhooks/moov, /webhooks/mixx — désigne déjà sans
 * ambiguïté le provider concerné). C'est la seule classe que
 * PaymentOrchestrator connaît de la couche connector — ni PaymentsService
 * ni le reste du métier n'appellent plus jamais un adapter directement.
 *
 * `initiate`/`refund` routent d'abord sur `payment.mode` : un paiement
 * "test" passe TOUJOURS par TestModeAdapter, quel que soit `payment.method`
 * — jamais le vrai adapter moov/mixx/manual (voir migrations/009_sandbox_mode.sql).
 * Les webhooks entrants provider (`checkStatus`/`parseWebhook`) ne sont eux
 * jamais concernés : un paiement test ne reçoit jamais de vrai webhook.
 */
@Injectable()
export class ConnectorService {
  constructor(
    @Inject(PAYMENT_ADAPTER_REGISTRY) private readonly registry: Map<ProviderName, PaymentProviderAdapter>,
    private readonly testMode: TestModeAdapter,
  ) {}

  private adapterFor(name: ProviderName): PaymentProviderAdapter {
    const adapter = this.registry.get(name);
    if (!adapter) {
      throw new NotFoundException(`Aucun connector enregistré pour le provider "${name}"`);
    }
    return adapter;
  }

  async initiate(payment: Payment): Promise<InitiateResult> {
    const adapter = payment.mode === 'test' ? this.testMode : this.adapterFor(payment.method);
    return adapter.initiate({
      paymentId: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      phoneNumber: payment.phone_number ?? '',
    });
  }

  async checkStatus(provider: ProviderName, providerReference: string): Promise<StatusResult> {
    return this.adapterFor(provider).checkStatus(providerReference);
  }

  parseWebhook(provider: ProviderName, payload: unknown): WebhookParseResult {
    return this.adapterFor(provider).parseWebhook(payload);
  }

  async refund(payment: Payment): Promise<{ success: boolean }> {
    const adapter = payment.mode === 'test' ? this.testMode : this.adapterFor(payment.method);
    return adapter.refund(payment.provider_reference ?? '', payment.amount);
  }

  /** `undefined` = la vérification de signature n'est pas implémentée pour ce provider. */
  verifySignature(
    provider: ProviderName,
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): boolean | undefined {
    return this.adapterFor(provider).verifyWebhookSignature?.(rawBody, headers);
  }

  requiresStatusConfirmation(provider: ProviderName): boolean {
    return Boolean(this.adapterFor(provider).confirmViaStatusCheck);
  }
}
