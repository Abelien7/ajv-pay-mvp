import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service';
import { LedgerService } from '../src/ledger/ledger.service';
import { createTestApp, createTestMerchant, resetDatabase, signedHeaders, TestMerchant } from './utils/test-app';

/**
 * Garantie testée : PaymentOrchestrator.commitFinalState() couvre statut +
 * ledger + outbox dans UNE SEULE transaction SQL. Si l'écriture du ledger
 * échoue en cours de route, rien de tout cela ne doit être visible en base —
 * jamais un paiement "succeeded" sans sa trace comptable.
 */
describe('Atomicité de PaymentOrchestrator.commitFinalState (e2e)', () => {
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

  it('si LedgerService.writeEntries échoue, le paiement ne passe jamais succeeded et rien n’est écrit', async () => {
    const body = {
      amount: 3000,
      currency: 'XOF',
      method: 'manual',
      phoneNumber: '+22890000001',
      metadata: { network: 'moov' },
    };
    const createRes = await request(app.getHttpServer())
      .post('/payments')
      .set(signedHeaders(merchant, body, 'atomicity-test-1'))
      .send(body);
    expect(createRes.status).toBe(201);
    expect(createRes.body.status).toBe('processing');
    const paymentId = createRes.body.id;

    const ledger = app.get(LedgerService);
    const spy = jest.spyOn(ledger, 'writeEntries').mockImplementationOnce(async () => {
      throw new Error('Panne simulée pendant commitFinalState');
    });

    const confirmRes = await request(app.getHttpServer())
      .post(`/admin/manual-payments/${paymentId}/confirm`)
      .set('Authorization', `Bearer ${process.env.ADMIN_API_KEY}`)
      .send();
    expect(confirmRes.status).toBeGreaterThanOrEqual(500);

    spy.mockRestore();

    const { rows: paymentRows } = await db.query('SELECT status FROM payments WHERE id = $1', [paymentId]);
    expect(paymentRows[0].status).toBe('processing');

    const { rows: ledgerRows } = await db.query('SELECT * FROM ledger_entries WHERE payment_id = $1', [paymentId]);
    expect(ledgerRows).toHaveLength(0);

    const { rows: outboxRows } = await db.query(
      `SELECT * FROM outbox_events WHERE payment_id = $1 AND event_type = 'payment.succeeded'`,
      [paymentId],
    );
    expect(outboxRows).toHaveLength(0);
  });
});
