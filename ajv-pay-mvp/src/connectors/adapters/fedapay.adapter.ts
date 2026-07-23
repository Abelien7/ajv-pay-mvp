import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FedaPay, Transaction, Webhook } from 'fedapay';
import {
  InitiateParams,
  InitiateResult,
  PaymentProviderAdapter,
  StatusResult,
  WebhookParseResult,
} from '../connector.interface';

/**
 * Adapter FedaPay — agrégateur mobile money/carte pour l'Afrique de l'Ouest,
 * utilisé ici pour automatiser Moov Togo (`moov_tg`) et Togocel/Mixx by Yas
 * (`togocel`), qui ne passaient jusqu'ici que par le provider 'manual'
 * (vérification humaine). Contrairement à MoovAdapter/MixxAdapter, cette
 * intégration est RÉELLE et confirmée contre le SDK officiel
 * (github.com/fedapay/fedapay-node), pas un stub en attente de doc.
 *
 * Flux d'initiation — VÉRIFIÉ EN VRAI contre le sandbox FedaPay (pas
 * seulement compilé) le 2026-07-23 : `Transaction.create()` (crée la
 * transaction FedaPay, statut `pending`) puis `transaction.generateToken()`
 * pour obtenir une URL de paiement hébergée (`InitiateResult.redirectUrl`,
 * même mécanisme que CinetPay) — le client y choisit lui-même Moov Togo/
 * Togocel/carte et confirme son paiement. Le statut définitif arrive
 * uniquement via webhook/`checkStatus`, jamais de façon synchrone ici.
 *
 * Le push USSD direct sans redirection (`transaction.sendNow('moov_tg'|
 * 'togocel')`, testé le 2026-07-23) est REFUSÉ par le compte sandbox actuel
 * ("Opération non autorisée", HTTP 400) alors que `generateToken()`
 * fonctionne parfaitement avec les mêmes identifiants — cette capacité
 * semble nécessiter une activation spécifique côté FedaPay (à demander à
 * leur support si un flux 100% sans redirection est voulu plus tard). Ne
 * pas re-tenter `sendNow` sans avoir d'abord confirmé cette activation.
 *
 * `confirmViaStatusCheck=true` : FedaPay ne met PAS le détail de la
 * transaction dans le corps du webhook (juste l'id de la ressource
 * concernée) — la doc officielle recommande explicitement de toujours
 * revérifier le statut réel via l'API plutôt que de faire confiance au
 * webhook seul. `parseWebhook` renvoie donc toujours `'processing'`,
 * PaymentOrchestrator rappelle systématiquement `checkStatus()` juste après
 * (comportement déjà supporté nativement par l'interface, voir
 * connector.interface.ts).
 *
 * Remboursement : PAS IMPLÉMENTÉ — aucune API de remboursement FedaPay
 * confirmée dans la documentation publique ni le SDK officiel (seuls
 * create/retrieve/update/delete/token existent sur Transaction). À valider
 * avec le support FedaPay avant d'activer quoi que ce soit ici ; `refund()`
 * retourne `{success:false}` et logge clairement plutôt que de deviner une
 * route non confirmée avec de l'argent réel.
 */
@Injectable()
export class FedaPayAdapter implements PaymentProviderAdapter {
  readonly name = 'fedapay' as const;
  readonly confirmViaStatusCheck = true;
  private readonly logger = new Logger(FedaPayAdapter.name);

  private readonly webhookSecret: string;
  private readonly country: string;

  constructor(private readonly config: ConfigService) {
    const secretKey = this.config.get<string>('FEDAPAY_SECRET_KEY', '');
    const environment = this.config.get<string>('FEDAPAY_ENVIRONMENT', 'sandbox');
    this.webhookSecret = this.config.get<string>('FEDAPAY_WEBHOOK_SECRET', '');
    this.country = this.config.get<string>('FEDAPAY_PHONE_COUNTRY', 'TG');

    if (secretKey) {
      FedaPay.setApiKey(secretKey);
      FedaPay.setEnvironment(environment);
    } else {
      this.logger.warn('FEDAPAY_SECRET_KEY non configurée — FedaPayAdapter échouera à la première utilisation.');
    }
  }

  async initiate(params: InitiateParams): Promise<InitiateResult> {
    this.logger.log(`Initiation FedaPay payment=${params.paymentId} amount=${params.amount}`);

    const transaction = await Transaction.create({
      description: `AJV Pay — paiement ${params.paymentId}`,
      amount: params.amount,
      currency: { iso: params.currency },
      // Pas de nom/email client collecté par AJV Pay (paiement mobile money par numéro
      // uniquement) — placeholder syntaxiquement valide et traçable, jamais présenté
      // comme une vraie identité client.
      customer: {
        firstname: 'Client',
        lastname: 'AJV Pay',
        email: `paiement-${params.paymentId}@ajvpay.local`,
        phone_number: { number: params.phoneNumber, country: this.country },
      },
    });

    const tokenObject = await transaction.generateToken({});

    return { providerReference: String(transaction.id), status: 'processing', redirectUrl: tokenObject.url };
  }

  async checkStatus(providerReference: string): Promise<StatusResult> {
    const transaction = await Transaction.retrieve(providerReference);
    const mapped = this.mapStatus(transaction.status);
    return { status: (mapped ?? 'processing') as StatusResult['status'], providerReference, raw: transaction };
  }

  /**
   * FedaPay ne fournit que l'identité de la ressource dans le webhook —
   * jamais de statut fiable. Toujours 'processing' : c'est `checkStatus()`
   * (rappelé automatiquement par l'orchestrateur via `confirmViaStatusCheck`)
   * qui fait foi.
   */
  parseWebhook(payload: any): WebhookParseResult {
    const objectId = payload?.object_id ?? payload?.entity?.id ?? payload?.id;
    const providerReference = objectId != null ? String(objectId) : '';
    return { providerReference, status: 'processing', raw: payload };
  }

  async refund(): Promise<{ success: boolean }> {
    this.logger.error(
      "Remboursement FedaPay demandé mais aucune API de remboursement n'est confirmée dans la documentation " +
        'officielle ni le SDK — à valider avec le support FedaPay avant toute implémentation. Aucun appel effectué.',
    );
    return { success: false };
  }

  verifyWebhookSignature(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean | undefined {
    if (!this.webhookSecret) return undefined;

    const headerValue = headers['x-fedapay-signature'];
    const signature = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    if (!signature) return false;

    try {
      Webhook.constructEvent(rawBody.toString('utf8'), signature, this.webhookSecret);
      return true;
    } catch (err) {
      this.logger.warn(`Signature FedaPay invalide: ${(err as Error).message}`);
      return false;
    }
  }

  private mapStatus(status: string | undefined): 'processing' | 'succeeded' | 'failed' | 'expired' | undefined {
    switch (status) {
      case 'approved':
      case 'transferred':
      case 'approved_partially_refunded':
      case 'transferred_partially_refunded':
        return 'succeeded';
      case 'declined':
      case 'canceled':
        return 'failed';
      case 'pending':
        return 'processing';
      default:
        // Inclut 'refunded' : ne devrait pas être piloté depuis FedaPay tant que refund()
        // n'est pas implémenté ; laissé non mappé plutôt que deviné (voir commentaire de classe).
        return undefined;
    }
  }
}
