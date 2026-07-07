import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  InitiateParams,
  InitiateResult,
  PaymentProviderAdapter,
  StatusResult,
  WebhookParseResult,
} from '../connector.interface';

/**
 * Adapter Moov Money — même remarque que MixxAdapter : la structure HTTP
 * (auth Bearer, timeout, mapping de statuts, signature webhook générique)
 * est réelle et fonctionnelle ; les chemins d'URL et noms de champs exacts
 * restent à confirmer avec la documentation technique Moov Africa obtenue à
 * l'onboarding marchand, et sont 100% configurables via `.env`.
 */
@Injectable()
export class MoovAdapter implements PaymentProviderAdapter {
  readonly name = 'moov' as const;
  private readonly logger = new Logger(MoovAdapter.name);

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly merchantCode: string;
  private readonly collectPath: string;
  private readonly statusPath: string;
  private readonly refundPath: string;
  private readonly webhookSecret: string;
  private readonly webhookSignatureHeader: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config.get<string>('MOOV_API_BASE_URL', '');
    this.apiKey = this.config.get<string>('MOOV_API_KEY', '');
    this.merchantCode = this.config.get<string>('MOOV_MERCHANT_CODE', '');
    this.collectPath = this.config.get<string>('MOOV_COLLECT_PATH', '/v1/collect');
    this.statusPath = this.config.get<string>('MOOV_STATUS_PATH', '/v1/collect');
    this.refundPath = this.config.get<string>('MOOV_REFUND_PATH', '/v1/refund');
    this.webhookSecret = this.config.get<string>('MOOV_WEBHOOK_SECRET', '');
    this.webhookSignatureHeader = this.config.get<string>('MOOV_WEBHOOK_SIGNATURE_HEADER', 'x-moov-signature');
  }

  private client() {
    return axios.create({
      baseURL: this.baseUrl,
      timeout: 15_000,
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      validateStatus: () => true,
    });
  }

  async initiate(params: InitiateParams): Promise<InitiateResult> {
    this.logger.log(`Initiation Moov payment=${params.paymentId} amount=${params.amount}`);

    const response = await this.client().post(this.collectPath, {
      merchant_code: this.merchantCode,
      amount: params.amount,
      currency: params.currency,
      phone_number: params.phoneNumber,
      external_reference: params.paymentId,
    });

    if (response.status >= 400) {
      throw new Error(`Moov a refusé l'initiation (HTTP ${response.status}): ${JSON.stringify(response.data)}`);
    }

    const data = response.data;
    const providerReference: string | undefined = data?.transaction_id ?? data?.reference;
    if (!providerReference) {
      throw new Error(`Réponse Moov inattendue, aucune référence de transaction trouvée: ${JSON.stringify(data)}`);
    }

    const mapped = this.mapStatus(data?.status);
    return { providerReference, status: mapped === 'expired' ? 'failed' : mapped };
  }

  async checkStatus(providerReference: string): Promise<StatusResult> {
    const response = await this.client().get(`${this.statusPath}/${providerReference}`);

    if (response.status >= 400) {
      throw new Error(`Moov checkStatus a échoué (HTTP ${response.status}): ${JSON.stringify(response.data)}`);
    }

    const data = response.data;
    const mapped = this.mapStatus(data?.status);

    return { status: (mapped ?? 'processing') as StatusResult['status'], providerReference, raw: data };
  }

  parseWebhook(payload: any): WebhookParseResult {
    const providerStatus: string = payload?.status;
    const providerReference: string = payload?.reference ?? payload?.transaction_id;

    const mapped = this.mapStatus(providerStatus);
    const status: WebhookParseResult['status'] = mapped === 'processing' || mapped === undefined ? 'failed' : mapped;

    return { providerReference, status, raw: payload };
  }

  async refund(providerReference: string, amount: number): Promise<{ success: boolean }> {
    const response = await this.client().post(this.refundPath, {
      merchant_code: this.merchantCode,
      transaction_id: providerReference,
      amount,
    });

    if (response.status >= 400) {
      this.logger.error(`Remboursement Moov refusé (HTTP ${response.status}): ${JSON.stringify(response.data)}`);
      return { success: false };
    }
    return { success: true };
  }

  verifyWebhookSignature(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean | undefined {
    if (!this.webhookSecret) return undefined;

    const headerValue = headers[this.webhookSignatureHeader];
    const signature = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    if (!signature) return false;

    const expected = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    const bufA = Buffer.from(signature);
    const bufB = Buffer.from(expected);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }

  private mapStatus(providerStatus: string | undefined): 'processing' | 'succeeded' | 'failed' | 'expired' | undefined {
    switch ((providerStatus ?? '').toUpperCase()) {
      case 'SUCCESS':
        return 'succeeded';
      case 'EXPIRED':
      case 'TIMEOUT':
        return 'expired';
      case 'FAILED':
      case 'REJECTED':
        return 'failed';
      case 'PENDING':
      case 'PROCESSING':
        return 'processing';
      default:
        return undefined;
    }
  }
}
