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
 * Adapter CinetPay — agrégateur ouest-africain (carte bancaire Visa/Mastercard
 * + mobile money multi-opérateurs) couvrant les paiements que Flooz/Moov ne
 * couvrent pas individuellement. API publique et documentée :
 * https://docs.cinetpay.com/api/1.0-fr/checkout
 *
 * Contrairement à Flooz/Moov (push USSD direct, statut quasi synchrone),
 * CinetPay fonctionne par redirection : `initiate()` renvoie un
 * `redirectUrl` vers lequel le client doit être renvoyé pour saisir sa
 * carte ou confirmer son paiement mobile money. Le statut final arrive soit
 * par webhook (notify_url), soit en interrogeant `checkStatus`.
 */
@Injectable()
export class CinetPayAdapter implements PaymentProviderAdapter {
  readonly name = 'cinetpay' as const;
  readonly confirmViaStatusCheck = true;
  private readonly logger = new Logger(CinetPayAdapter.name);

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly siteId: string;
  private readonly notifyUrl: string;
  private readonly returnUrl: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config.get<string>('CINETPAY_API_BASE_URL', 'https://api-checkout.cinetpay.com/v2');
    this.apiKey = this.config.get<string>('CINETPAY_API_KEY', '');
    this.siteId = this.config.get<string>('CINETPAY_SITE_ID', '');
    this.notifyUrl = this.config.get<string>('CINETPAY_NOTIFY_URL', '');
    this.returnUrl = this.config.get<string>('CINETPAY_RETURN_URL', '');
  }

  async initiate(params: InitiateParams): Promise<InitiateResult> {
    this.logger.log(`Initiation CinetPay payment=${params.paymentId} amount=${params.amount}`);

    const response = await axios.post(
      `${this.baseUrl}/payment`,
      {
        apikey: this.apiKey,
        site_id: this.siteId,
        transaction_id: params.paymentId,
        amount: params.amount,
        currency: params.currency,
        customer_phone_number: params.phoneNumber,
        notify_url: this.notifyUrl,
        return_url: this.returnUrl,
        channels: 'ALL',
        description: `Paiement ${params.paymentId}`,
      },
      { timeout: 15_000, validateStatus: () => true },
    );

    const data = response.data;
    if (response.status >= 400 || data?.code !== '201') {
      throw new Error(`CinetPay a refusé l'initiation (code=${data?.code}, message=${data?.message}).`);
    }

    return {
      providerReference: params.paymentId, // transaction_id sert de référence côté CinetPay
      status: 'processing',
      redirectUrl: data?.data?.payment_url,
    };
  }

  async checkStatus(providerReference: string): Promise<StatusResult> {
    const response = await axios.post(
      `${this.baseUrl}/payment/check`,
      { apikey: this.apiKey, site_id: this.siteId, transaction_id: providerReference },
      { timeout: 15_000, validateStatus: () => true },
    );

    const data = response.data;
    const cpmStatus: string = data?.data?.status ?? '';

    let status: StatusResult['status'];
    switch (cpmStatus) {
      case 'ACCEPTED':
        status = 'succeeded';
        break;
      case 'REFUSED':
        status = 'failed';
        break;
      case 'EXPIRED':
        status = 'expired';
        break;
      default:
        status = 'processing' as any; // PENDING/WAITING côté CinetPay
    }

    return { status, providerReference, raw: data };
  }

  /**
   * CinetPay envoie en notification HTTP `cpm_trans_id` et `cpm_site_id` en
   * POST (form-encoded ou JSON selon configuration du compte marchand). La
   * notification ne contient PAS le statut final fiable — la doc CinetPay
   * recommande explicitement de toujours rappeler `checkStatus` (payment/check)
   * après réception d'un webhook plutôt que de faire confiance à son contenu
   * brut. On ne fait donc ici que router vers la bonne transaction ;
   * PaymentOrchestrator devra confirmer via un appel `checkStatus` — voir
   * TODO dans `provider-webhooks.controller.ts`.
   */
  parseWebhook(payload: any): WebhookParseResult {
    const providerReference: string = payload?.cpm_trans_id ?? payload?.transaction_id;
    return { providerReference, status: 'succeeded', raw: payload };
  }

  async refund(): Promise<{ success: boolean }> {
    // CinetPay ne propose pas de remboursement automatisé via API pour tous
    // les moyens de paiement — à gérer manuellement côté ops (le ledger
    // trace l'opération quoi qu'il arrive, voir LedgerService.buildRefundEntries).
    throw new Error('CinetPayAdapter.refund() : remboursement à traiter manuellement (pas d\'API CinetPay générique).');
  }

  /**
   * CinetPay ne signe pas ses notifications HTTP avec une clé secrète
   * (contrairement à Stripe) — l'intégrité doit être garantie en rappelant
   * systématiquement `checkStatus` côté serveur (voir parseWebhook ci-dessus)
   * plutôt qu'en faisant confiance au contenu de la requête entrante. On
   * retourne donc `true` ici par construction : la vérification réelle est
   * déplacée vers le re-check actif, pas vers une signature.
   */
  verifyWebhookSignature(): boolean {
    return true;
  }
}
