import { Injectable, Logger } from '@nestjs/common';
import {
  InitiateParams,
  InitiateResult,
  PaymentProviderAdapter,
  StatusResult,
  WebhookParseResult,
} from '../connector.interface';

/**
 * Adapter "manual" — le client envoie l'argent lui-même vers un numéro
 * marchand fixe (mobile money) et soumet l'ID de transaction reçu ; un admin
 * AJV Pay vérifie et confirme depuis le dashboard (voir
 * ManualReviewController, qui appelle PaymentOrchestrator.confirmManualPayment/
 * rejectManualPayment). Contrairement aux autres adapters, `initiate()` ne
 * fait aucun appel réseau : il n'y a rien à déclencher côté provider, juste
 * une référence à communiquer au client (le numéro marchand et la syntaxe
 * USSD par réseau sont exposés séparément via `GET /payments/manual/info`,
 * voir ManualPaymentsService — pas par cet adapter).
 */
@Injectable()
export class ManualAdapter implements PaymentProviderAdapter {
  readonly name = 'manual' as const;
  private readonly logger = new Logger(ManualAdapter.name);

  async initiate(params: InitiateParams): Promise<InitiateResult> {
    this.logger.log(`Paiement manuel en attente de preuve, payment=${params.paymentId}`);
    return {
      providerReference: params.paymentId,
      status: 'processing',
    };
  }

  /**
   * Aucune vérification active n'est possible ici : la seule source de
   * vérité est la décision d'un admin. Cette méthode existe uniquement pour
   * satisfaire l'interface commune — elle n'est appelée par aucun chemin
   * réel de ce système (`confirmViaStatusCheck` n'est pas activé pour
   * 'manual', donc PaymentOrchestrator ne la rappelle jamais).
   */
  async checkStatus(providerReference: string): Promise<StatusResult> {
    return { status: 'processing', providerReference };
  }

  /**
   * Ce provider ne reçoit jamais de webhook externe (pas de route
   * /webhooks/manual) — la confirmation passe exclusivement par
   * ManualReviewController, jamais par cette méthode.
   */
  parseWebhook(): WebhookParseResult {
    throw new Error("ManualAdapter ne reçoit jamais de webhook — la confirmation passe par le dashboard admin.");
  }

  async refund(): Promise<{ success: boolean }> {
    // Comme CinetPay avant sa suppression : pas d'API à appeler, le
    // remboursement se fait en renvoyant l'argent soi-même. Le ledger trace
    // l'opération quoi qu'il arrive (voir LedgerService.buildRefundEntries).
    throw new Error(
      "Remboursement manuel : renvoyez l'argent vous-même puis notez-le, aucune API à appeler pour ce provider.",
    );
  }
}
