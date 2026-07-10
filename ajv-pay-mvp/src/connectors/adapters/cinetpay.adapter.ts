import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  InitiateParams,
  InitiateResult,
  PaymentProviderAdapter,
  StatusResult,
  WebhookParseResult,
} from '../connector.interface';

/**
 * Adapter CinetPay — carte bancaire (Visa/Mastercard) en redirection.
 * Contrairement à Moov/Mixx (push USSD direct), CinetPay renvoie une
 * `payment_url` hébergée où le client saisit sa carte : ni AJV Pay ni cet
 * adapter ne voient jamais le numéro de carte (hors périmètre PCI-DSS).
 *
 * Endpoints et noms de champs confirmés via la documentation officielle
 * CinetPay (docs.cinetpay.com/api/1.0-fr/checkout/*) — contrairement aux
 * adapters Moov/Mixx (stubs en attente de la doc technique obtenue à
 * l'onboarding), ce contrat est déjà réel. Reste à vérifier une fois de
 * vraies clés `CINETPAY_API_KEY`/`CINETPAY_SITE_ID` obtenues : un test réel
 * en sandbox CinetPay avant toute mise en production.
 *
 * `confirmViaStatusCheck = true` : la notification CinetPay ne transporte
 * que `cpm_trans_id`/`cpm_site_id`, jamais un statut fiable par elle-même —
 * leur propre documentation impose de rappeler l'endpoint de vérification
 * pour obtenir la vérité terrain (voir PaymentOrchestrator.handleProviderWebhook).
 */
@Injectable()
export class CinetpayAdapter implements PaymentProviderAdapter {
  readonly name = 'cinetpay' as const;
  readonly confirmViaStatusCheck = true;
  private readonly logger = new Logger(CinetpayAdapter.name);

  private readonly baseUrl = 'https://api-checkout.cinetpay.com/v2';
  private readonly apiKey: string;
  private readonly siteId: string;
  private readonly notifyUrl: string;
  private readonly returnUrl: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('CINETPAY_API_KEY', '');
    this.siteId = this.config.get<string>('CINETPAY_SITE_ID', '');
    this.notifyUrl = this.config.get<string>('CINETPAY_NOTIFY_URL', '');
    this.returnUrl = this.config.get<string>('CINETPAY_RETURN_URL', '');
  }

  private client() {
    return axios.create({ timeout: 15_000, headers: { 'Content-Type': 'application/json' }, validateStatus: () => true });
  }

  async initiate(params: InitiateParams): Promise<InitiateResult> {
    this.logger.log(`Initiation CinetPay payment=${params.paymentId} amount=${params.amount}`);

    const response = await this.client().post(`${this.baseUrl}/payment`, {
      apikey: this.apiKey,
      site_id: this.siteId,
      transaction_id: params.paymentId,
      amount: params.amount,
      currency: params.currency,
      description: `Paiement AJV Pay ${params.paymentId}`,
      notify_url: this.notifyUrl,
      return_url: this.returnUrl,
      channels: 'CREDIT_CARD',
      customer_phone_number: params.phoneNumber || undefined,
    });

    const data = response.data;
    if (response.status >= 400 || data?.code !== '201') {
      throw new Error(`CinetPay a refusé l'initiation (HTTP ${response.status}): ${JSON.stringify(data)}`);
    }

    const paymentUrl: string | undefined = data?.data?.payment_url;
    if (!paymentUrl) {
      throw new Error(`Réponse CinetPay inattendue, aucune payment_url trouvée: ${JSON.stringify(data)}`);
    }

    // providerReference = notre propre transaction_id : CinetPay ne renvoie
    // pas d'identifiant à eux à ce stade (seulement à la confirmation).
    return { providerReference: params.paymentId, status: 'processing', redirectUrl: paymentUrl };
  }

  async checkStatus(providerReference: string): Promise<StatusResult> {
    const response = await this.client().post(`${this.baseUrl}/payment/check`, {
      apikey: this.apiKey,
      site_id: this.siteId,
      transaction_id: providerReference,
    });

    if (response.status >= 400) {
      throw new Error(`CinetPay checkStatus a échoué (HTTP ${response.status}): ${JSON.stringify(response.data)}`);
    }

    const data = response.data;
    const mapped = this.mapStatus(data?.code, data?.data?.status);
    return { status: mapped ?? 'processing', providerReference, raw: data };
  }

  parseWebhook(payload: any): WebhookParseResult {
    // Payload minimal et non fiable par design (voir doc CinetPay) — ne sert
    // qu'à identifier QUELLE transaction re-vérifier via checkStatus(), le
    // statut réel n'est jamais lu ici (confirmViaStatusCheck = true ignore
    // volontairement `status` ci-dessous, voir PaymentOrchestrator).
    const providerReference: string = payload?.cpm_trans_id;
    return { providerReference, status: 'failed', raw: payload };
  }

  async refund(): Promise<{ success: boolean }> {
    // CinetPay ne documente pas d'endpoint de remboursement automatisé pour
    // les paiements carte — à traiter manuellement via leur support/dashboard
    // marchand tant qu'aucune API de remboursement confirmée n'existe.
    this.logger.warn('Remboursement CinetPay demandé — aucune API de remboursement disponible, à traiter manuellement.');
    return { success: false };
  }

  private mapStatus(
    code: string | undefined,
    providerStatus: string | undefined,
  ): 'processing' | 'succeeded' | 'failed' | 'expired' | undefined {
    if (code === '00' || providerStatus === 'ACCEPTED') return 'succeeded';
    if (providerStatus === 'REFUSED' || providerStatus === 'CANCELLED') return 'failed';
    if (code === '600' || code === '627') return 'failed';
    return 'processing';
  }
}
