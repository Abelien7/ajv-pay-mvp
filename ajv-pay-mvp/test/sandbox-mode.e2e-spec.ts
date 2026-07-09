import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service';
import {
  createTestApp,
  createTestMerchant,
  resetDatabase,
  signedHeaders,
  signedTestModeHeaders,
  TestMerchant,
} from './utils/test-app';

/**
 * Garanties testées pour le mode test/sandbox (migrations/009_sandbox_mode.sql) :
 *   - résolution instantanée (succès par défaut, échec si le numéro finit par "9999")
 *   - jamais d'écriture ledger, quel que soit le résultat
 *   - la notification webhook (outbox) part quand même — c'est ce qui permet de tester une intégration
 *   - jamais visible dans la file d'admin réservée au vrai argent
 *   - la même Idempotency-Key peut être réutilisée en live et en test sans conflit
 */
describe('Mode test/sandbox (e2e)', () => {
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

  it('résout un paiement test en succès instantané, sans écriture ledger', async () => {
    const body = {
      amount: 7000,
      currency: 'XOF',
      method: 'moov',
      phoneNumber: '+22890001234',
      metadata: { network: 'moov' },
    };

    const res = await request(app.getHttpServer())
      .post('/payments')
      .set(signedTestModeHeaders(merchant, body, 'sandbox-success-1'))
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body.mode).toBe('test');
    expect(res.body.status).toBe('succeeded');

    const { rows: ledgerRows } = await db.query(
      'SELECT * FROM ledger_entries WHERE payment_id = $1',
      [res.body.id],
    );
    expect(ledgerRows).toHaveLength(0);
  });

  it('résout un paiement test en échec instantané quand le numéro finit par 9999', async () => {
    const body = {
      amount: 4000,
      currency: 'XOF',
      method: 'mixx',
      phoneNumber: '+22890009999',
      metadata: { network: 'mixx' },
    };

    const res = await request(app.getHttpServer())
      .post('/payments')
      .set(signedTestModeHeaders(merchant, body, 'sandbox-failure-1'))
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body.mode).toBe('test');
    expect(res.body.status).toBe('failed');

    const { rows: ledgerRows } = await db.query(
      'SELECT * FROM ledger_entries WHERE payment_id = $1',
      [res.body.id],
    );
    expect(ledgerRows).toHaveLength(0);
  });

  it('déclenche quand même une notification outbox pour un paiement test (pour permettre de tester l’intégration)', async () => {
    const body = {
      amount: 2500,
      currency: 'XOF',
      method: 'manual',
      phoneNumber: '+22890001111',
      metadata: { network: 'mixx' },
    };

    const res = await request(app.getHttpServer())
      .post('/payments')
      .set(signedTestModeHeaders(merchant, body, 'sandbox-outbox-1'))
      .send(body);

    const { rows } = await db.query(
      `SELECT * FROM outbox_events WHERE payment_id = $1 AND event_type = 'payment.succeeded'`,
      [res.body.id],
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it('un paiement manual en mode test n’apparaît jamais dans la file admin (réservée au vrai argent)', async () => {
    const body = {
      amount: 3000,
      currency: 'XOF',
      method: 'manual',
      phoneNumber: '+22890002222',
      metadata: { network: 'mixx' },
    };

    await request(app.getHttpServer())
      .post('/payments')
      .set(signedTestModeHeaders(merchant, body, 'sandbox-manual-1'))
      .send(body);

    const pendingRes = await request(app.getHttpServer())
      .get('/admin/manual-payments/pending')
      .set('Authorization', `Bearer ${process.env.ADMIN_API_KEY}`)
      .send();

    expect(pendingRes.status).toBe(200);
    expect(pendingRes.body).toHaveLength(0);
  });

  it('la même Idempotency-Key peut être utilisée en live et en test sans conflit', async () => {
    const body = {
      amount: 1000,
      currency: 'XOF',
      method: 'manual',
      phoneNumber: '+22890003333',
      metadata: { network: 'mixx' },
    };
    const sharedKey = 'shared-across-modes-1';

    const liveRes = await request(app.getHttpServer())
      .post('/payments')
      .set(signedHeaders(merchant, body, sharedKey))
      .send(body);
    const testRes = await request(app.getHttpServer())
      .post('/payments')
      .set(signedTestModeHeaders(merchant, body, sharedKey))
      .send(body);

    expect(liveRes.status).toBe(201);
    expect(testRes.status).toBe(201);
    expect(liveRes.body.mode).toBe('live');
    expect(testRes.body.mode).toBe('test');
    expect(liveRes.body.id).not.toBe(testRes.body.id);

    const { rows } = await db.query(
      'SELECT COUNT(*) FROM payments WHERE merchant_id = $1 AND idempotency_key = $2',
      [merchant.id, sharedKey],
    );
    expect(Number(rows[0].count)).toBe(2);
  });
});
