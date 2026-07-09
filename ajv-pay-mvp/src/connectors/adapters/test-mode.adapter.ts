import { Injectable, Logger } from '@nestjs/common';
import {
  InitiateParams,
  InitiateResult,
  PaymentProviderAdapter,
  ProviderName,
  StatusResult,
  WebhookParseResult,
} from '../connector.interface';

/**
 * Adapter utilisé pour TOUT paiement en mode "test" (voir
 * migrations/009_sandbox_mode.sql), quel que soit `payment.method` — routé
 * par ConnectorService à la place de l'adapter réel du provider (moov,
 * mixx, manual), pour qu'un marchand puisse intégrer et tester AJV Pay sans
 * jamais toucher de vrai argent, de vraie API provider, ni la file de
 * revue admin (réservée au vrai argent).
 *
 * Convention de test (documentée au marchand, voir README) : un numéro de
 * téléphone se terminant par "9999" simule un échec, tout le reste réussit
 * instantanément — même principe que les cartes de test Stripe.
 */
const FAILURE_SUFFIX = '9999';

@Injectable()
export class TestModeAdapter implements PaymentProviderAdapter {
  readonly name = 'manual' as ProviderName; // valeur arbitraire, jamais lue : ce champ ne sert qu'à satisfaire l'interface commune.
  private readonly logger = new Logger(TestModeAdapter.name);

  async initiate(params: InitiateParams): Promise<InitiateResult> {
    const willFail = params.phoneNumber.endsWith(FAILURE_SUFFIX);
    this.logger.log(
      `Paiement test résolu instantanément payment=${params.paymentId} → ${willFail ? 'failed' : 'succeeded'}`,
    );
    return {
      providerReference: `test_${willFail ? 'fail' : 'ok'}_${params.paymentId}`,
      status: willFail ? 'failed' : 'succeeded',
    };
  }

  async checkStatus(providerReference: string): Promise<StatusResult> {
    const status = providerReference.startsWith('test_fail_') ? 'failed' : 'succeeded';
    return { status, providerReference };
  }

  /** Jamais appelé : le mode test ne reçoit jamais de webhook réel d'un provider (voir ProviderWebhooksController). */
  parseWebhook(): WebhookParseResult {
    throw new Error('TestModeAdapter ne reçoit jamais de webhook — résolution toujours synchrone via initiate().');
  }

  async refund(): Promise<{ success: boolean }> {
    return { success: true };
  }
}
