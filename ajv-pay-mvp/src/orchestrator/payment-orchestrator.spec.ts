import { PaymentOrchestrator } from './payment-orchestrator.service';
import { DatabaseService } from '../database/database.service';
import { PaymentsService } from '../payments/payments.service';
import { ConnectorService } from '../connectors/connector.service';
import { LedgerService } from '../ledger/ledger.service';
import { OutboxService } from '../outbox/outbox.service';
import { OutboxProcessorService } from '../outbox/outbox-processor.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { Payment } from '../payments/payment.entity';

/**
 * Régression pour le bug trouvé le 2026-08-12 (voir commit f94f0fb) : un
 * paiement FedaPay réellement approuvé restait bloqué en 'processing' pour
 * toujours parce que handleProviderWebhook sortait sur
 * `parsed.status === 'processing'` AVANT de vérifier
 * `requiresStatusConfirmation` — pour un provider comme FedaPay dont le
 * webhook ne transporte jamais de statut fiable (parseWebhook renvoie
 * toujours 'processing' par conception), checkStatus() n'était donc jamais
 * appelé, quel que soit l'événement réel reçu côté provider.
 */
describe('PaymentOrchestrator.handleProviderWebhook — providers confirmViaStatusCheck (ex: FedaPay)', () => {
  function makeOrchestrator(checkStatusResult: { status: string; providerReference: string; raw: unknown }) {
    const fakePayment: Payment = {
      id: 'pay-1',
      merchant_id: 'merch-1',
      amount: 1000,
      currency: 'XOF',
      method: 'fedapay',
      mode: 'test', // évite d'avoir à mocker le ledger : hors-sujet pour ce test précis
      phone_number: '90000000',
      status: 'processing',
      provider_reference: 'ref-fedapay-1',
      redirect_url: null,
      idempotency_key: 'idem-1',
      metadata: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const db = {
      withTransaction: jest.fn(async (fn: (client: unknown) => Promise<unknown>) => fn({})),
    } as unknown as DatabaseService;

    const payments = {
      findByProviderReference: jest.fn().mockResolvedValue(fakePayment),
      applyFinalTransition: jest.fn().mockImplementation(async (_client, _id, newStatus) => ({
        ...fakePayment,
        status: newStatus,
      })),
    } as unknown as PaymentsService;

    const connector = {
      // FedaPayAdapter.parseWebhook renvoie TOUJOURS 'processing', quel que
      // soit l'événement reçu (transaction.approved, .declined, peu importe)
      // — c'est exactement ce qui déclenchait le bug.
      parseWebhook: jest.fn().mockReturnValue({ providerReference: 'ref-fedapay-1', status: 'processing', raw: {} }),
      requiresStatusConfirmation: jest.fn().mockReturnValue(true),
      checkStatus: jest.fn().mockResolvedValue(checkStatusResult),
    } as unknown as ConnectorService;

    const ledger = { writeEntries: jest.fn() } as unknown as LedgerService;
    const outbox = { recordInTransaction: jest.fn(), record: jest.fn() } as unknown as OutboxService;
    const outboxProcessor = { processOutbox: jest.fn() } as unknown as OutboxProcessorService;
    const webhooksDelivery = { processDue: jest.fn() } as unknown as WebhooksService;

    const orchestrator = new PaymentOrchestrator(db, payments, connector, ledger, outbox, outboxProcessor, webhooksDelivery);
    return { orchestrator, payments, connector };
  }

  it('appelle checkStatus() et confirme le paiement même si le webhook annonce "processing"', async () => {
    const { orchestrator, payments, connector } = makeOrchestrator({
      status: 'succeeded',
      providerReference: 'ref-fedapay-1',
      raw: { status: 'approved' },
    });

    await orchestrator.handleProviderWebhook('fedapay', { object_id: '112468925' });

    // Le cœur de la régression : sans le fix, checkStatus() n'est jamais appelé.
    expect(connector.checkStatus).toHaveBeenCalledWith('fedapay', 'ref-fedapay-1');
    expect(payments.applyFinalTransition).toHaveBeenCalledWith(
      expect.anything(),
      'pay-1',
      'succeeded',
      expect.anything(),
      'ref-fedapay-1',
      undefined,
    );
  });

  it('ne transitionne rien si checkStatus() confirme encore "processing"', async () => {
    const { orchestrator, payments, connector } = makeOrchestrator({
      status: 'processing',
      providerReference: 'ref-fedapay-1',
      raw: {},
    });

    await orchestrator.handleProviderWebhook('fedapay', { object_id: '112468925' });

    expect(connector.checkStatus).toHaveBeenCalled();
    expect(payments.applyFinalTransition).not.toHaveBeenCalled();
  });

  it('confirme aussi un échec (transaction déclinée côté provider)', async () => {
    const { orchestrator, payments } = makeOrchestrator({
      status: 'failed',
      providerReference: 'ref-fedapay-1',
      raw: { status: 'declined' },
    });

    await orchestrator.handleProviderWebhook('fedapay', { object_id: '112468925' });

    expect(payments.applyFinalTransition).toHaveBeenCalledWith(
      expect.anything(),
      'pay-1',
      'failed',
      expect.anything(),
      'ref-fedapay-1',
      undefined,
    );
  });
});
