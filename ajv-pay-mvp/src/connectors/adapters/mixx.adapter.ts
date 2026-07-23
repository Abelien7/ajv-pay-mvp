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
 * Adapter Mixx by Yas (Togocom, ex-T-Money — Flooz, lui, a été rebaptisé
 * Moov Money, déjà couvert par MoovAdapter).
 *
 * IMPORTANT — ce qui est réel vs ce qui reste à confirmer avec Yas/Togocom :
 *   - La structure HTTP (méthode, headers Bearer, timeout, gestion d'erreur,
 *     mapping de statuts) est une implémentation RÉELLE et fonctionnelle.
 *   - Les chemins exacts d'URL (`MIXX_COLLECT_PATH`, `MIXX_STATUS_PATH`,
 *     `MIXX_REFUND_PATH`) et les noms de champs JSON (`merchant_code`,
 *     `transaction_id`, ...) sont ceux d'une intégration mobile money
 *     "collect" standard en Afrique de l'Ouest, mais DOIVENT être confirmés
 *     avec la documentation technique/commerciale Mixx by Yas obtenue à
 *     l'onboarding — ils sont 100% configurables via `.env` pour ne
 *     nécessiter aucune modification de code une fois confirmés.
 *   - Le header de signature webhook (`MIXX_WEBHOOK_SIGNATURE_HEADER`) est
 *     un nom par défaut générique (`x-mixx-signature`) — à remplacer par le
 *     nom réel documenté par Yas/Togocom dès qu'il est connu.
 */
@Injectable()
export class MixxAdapter implements PaymentProviderAdapter {
  readonly name = 'mixx' as const;
  private readonly logger = new Logger(MixxAdapter.name);

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly merchantCode: string;
  private readonly collectPath: string;
  private readonly statusPath: string;
  private readonly refundPath: string;
  private readonly webhookSecret: string;
  private readonly webhookSignatureHeader: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config.get<string>('MIXX_API_BASE_URL', '');
    this.apiKey = this.config.get<string>('MIXX_API_KEY', '');
    this.merchantCode = this.config.get<string>('MIXX_MERCHANT_CODE', '');
    this.collectPath = this.config.get<string>('MIXX_COLLECT_PATH', '/v1/collect');
    this.statusPath = this.config.get<string>('MIXX_STATUS_PATH', '/v1/collect');
    this.refundPath = this.config.get<string>('MIXX_REFUND_PATH', '/v1/refund');
    this.webhookSecret = this.config.get<string>('MIXX_WEBHOOK_SECRET', '');
    this.webhookSignatureHeader = this.config.get<string>('MIXX_WEBHOOK_SIGNATURE_HEADER', 'x-mixx-signature');
  }

  private client() {
    return axios.create({
      baseURL: this.baseUrl,
      timeout: 15_000,
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      validateStatus: () => true, // on gère nous-mêmes les codes d'erreur ci-dessous
    });
  }

  async initiate(params: InitiateParams): Promise<InitiateResult> {
    this.logger.log(
      `Initiation Mixx payment=${params.paymentId} amount=${params.amount} phone=${params.phoneNumber}`,
    );

    const response = await this.client().post(this.collectPath, {
      merchant_code: this.merchantCode,
      amount: params.amount,
      currency: params.currency,
      phone_number: params.phoneNumber,
      external_reference: params.paymentId,
    });

    if (response.status >= 400) {
      throw new Error(
        `Mixx a refusé l'initiation (HTTP ${response.status}): ${JSON.stringify(response.data)}`,
      );
    }

    const data = response.data;
    const providerReference: string | undefined = data?.transaction_id ?? data?.reference;
    if (!providerReference) {
      throw new Error(`Réponse Mixx inattendue, aucune référence de transaction trouvée: ${JSON.stringify(data)}`);
    }

    const mapped = this.mapStatus(data?.status ?? data?.transaction_status);
    return {
      providerReference,
      status: mapped === 'expired' ? 'failed' : mapped,
    };
  }

  async checkStatus(providerReference: string): Promise<StatusResult> {
    const response = await this.client().get(`${this.statusPath}/${providerReference}`);

    if (response.status >= 400) {
      throw new Error(`Mixx checkStatus a échoué (HTTP ${response.status}): ${JSON.stringify(response.data)}`);
    }

    const data = response.data;
    const mapped = this.mapStatus(data?.status ?? data?.transaction_status);

    return {
      status: (mapped ?? 'processing') as StatusResult['status'],
      providerReference,
      raw: data,
    };
  }

  /**
   * Interprète le payload webhook envoyé par Mixx. La structure exacte
   * (noms de champs, valeurs de statut) doit être ajustée selon la doc
   * réelle — ce mapping illustre le principe : traduire le vocabulaire du
   * provider vers les statuts normalisés AJV Pay.
   */
  parseWebhook(payload: any): WebhookParseResult {
    const providerStatus: string = payload?.status ?? payload?.transaction_status;
    const providerReference: string = payload?.transaction_id ?? payload?.reference;

    const mapped = this.mapStatus(providerStatus);
    // Statut intermédiaire (PENDING/PROCESSING) ou non reconnu : jamais une
    // transition finale (voir le commentaire sur WebhookParseResult.status).
    const status: WebhookParseResult['status'] = mapped ?? 'processing';
    return { providerReference, status, raw: payload };
  }

  async refund(providerReference: string, amount: number): Promise<{ success: boolean }> {
    const response = await this.client().post(this.refundPath, {
      merchant_code: this.merchantCode,
      transaction_id: providerReference,
      amount,
    });

    if (response.status >= 400) {
      this.logger.error(`Remboursement Mixx refusé (HTTP ${response.status}): ${JSON.stringify(response.data)}`);
      return { success: false };
    }
    return { success: true };
  }

  /**
   * Vérification générique de signature HMAC-SHA256 du corps brut, motif le
   * plus courant côté providers mobile money ouest-africains. Si
   * `MIXX_WEBHOOK_SECRET` n'est pas configuré, retourne `undefined`
   * (= "non configuré", traité explicitement comme un avertissement par
   * `ProviderWebhooksController`, jamais comme un succès silencieux).
   */
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
