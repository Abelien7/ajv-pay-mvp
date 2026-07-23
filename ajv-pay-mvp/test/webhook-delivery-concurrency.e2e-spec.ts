import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { lookup } from 'dns/promises';
import { DatabaseService } from '../src/database/database.service';
import { OutboxProcessorService } from '../src/outbox/outbox-processor.service';
import { WebhooksService } from '../src/webhooks/webhooks.service';
import { createTestApp, createTestMerchant, resetDatabase, signedTestModeHeaders, TestMerchant } from './utils/test-app';

// `dns/promises` a des exports non reconfigurables — jest.spyOn() échoue
// avec "Cannot redefine property: lookup". jest.mock() (remplacement du
// module entier, résolu avant l'import) est la façon fiable de le mocker.
jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
const mockedLookup = lookup as jest.MockedFunction<typeof lookup>;

/**
 * Garantie testée : le process API (livraison immédiate best-effort après
 * chaque transition, voir PaymentOrchestrator.commitFinalState) et le
 * process Worker (@Cron 10s, voir WorkerCronService) peuvent tous deux
 * appeler `processOutbox()`/`processDue()` dans la même fenêtre de temps
 * SANS jamais livrer le même webhook marchand deux fois — corrigé via
 * `FOR UPDATE SKIP LOCKED` (outbox) et un bail `claimed_at` (webhook_attempts),
 * voir migrations/015_webhook_attempt_claim.sql et OutboxService.claimNext.
 *
 * `fetch` et `dns/promises.lookup` (utilisé par le garde-fou SSRF, voir
 * ssrf-guard.ts) sont mockés — ce test vérifie la garantie de concurrence,
 * pas la vraie livraison réseau (déjà couverte manuellement en prod).
 */
describe('Concurrence outbox → webhook_attempts → livraison (e2e)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let merchant: TestMerchant;

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(DatabaseService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    merchant = await createTestMerchant(app);
  });

  async function createSucceededPayment(idemKey: string): Promise<string> {
    const body = {
      amount: 3000,
      currency: 'XOF',
      method: 'manual',
      phoneNumber: '+22890008888',
      metadata: { network: 'mixx' },
    };
    const res = await request(app.getHttpServer())
      .post('/payments')
      .set(signedTestModeHeaders(merchant, body, idemKey))
      .send(body);
    expect(res.body.status).toBe('succeeded');
    return res.body.id;
  }

  it('deux passes outbox concurrentes ne créent qu’une seule tentative webhook pour le même événement', async () => {
    // Créé SANS webhook_url pour que la livraison immédiate automatique de
    // la création du paiement soit un no-op (voir WebhooksService.doEnqueue)
    // — seul l'événement synthétique ci-dessous doit produire une tentative,
    // pour isoler précisément ce qu'on teste.
    const paymentId = await createSucceededPayment('outbox-race-1');
    await db.query(`UPDATE merchants SET webhook_url = 'https://example.com/hook' WHERE id = $1`, [merchant.id]);

    await db.query(
      `INSERT INTO outbox_events (event_type, payment_id, merchant_id, payload)
       VALUES ('payment.succeeded', $1, $2, $3)`,
      [
        paymentId,
        merchant.id,
        JSON.stringify({
          id: paymentId,
          merchant_id: merchant.id,
          amount: 3000,
          currency: 'XOF',
          method: 'manual',
          status: 'succeeded',
          provider_reference: null,
          metadata: null,
        }),
      ],
    );

    const outboxProcessor = app.get(OutboxProcessorService);
    await Promise.all([outboxProcessor.processOutbox(), outboxProcessor.processOutbox()]);

    const { rows } = await db.query(`SELECT * FROM webhook_attempts WHERE payment_id = $1`, [paymentId]);
    expect(rows).toHaveLength(1);
  });

  it('deux livraisons concurrentes de la même tentative webhook n’appellent le marchand qu’une seule fois', async () => {
    mockedLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 } as any);
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as any);

    try {
      const paymentId = await createSucceededPayment('delivery-race-1');
      await db.query(`UPDATE merchants SET webhook_url = 'https://example.com/hook' WHERE id = $1`, [merchant.id]);

      await db.query(
        `INSERT INTO webhook_attempts (merchant_id, payment_id, url, payload, status, next_retry_at)
         VALUES ($1, $2, 'https://example.com/hook', $3, 'pending', NOW())`,
        [
          merchant.id,
          paymentId,
          JSON.stringify({ event: 'payment.succeeded', payment_id: paymentId, merchant_id: merchant.id }),
        ],
      );

      const webhooks = app.get(WebhooksService);
      await Promise.all([webhooks.processDue(), webhooks.processDue()]);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      mockedLookup.mockReset();
      fetchSpy.mockRestore();
    }
  });
});
