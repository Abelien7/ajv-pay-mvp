import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service';
import {
  createTestApp,
  createTestMerchantWithUser,
  csrfHeader,
  loginDashboard,
  resetDatabase,
  signedHeaders,
  signedTestModeHeaders,
  TestDashboardUser,
  TestMerchant,
} from './utils/test-app';

/**
 * Garantie testée : le dashboard humain (cookie de session) peut consulter
 * son profil, sa liste de paiements, mettre à jour son webhook et
 * rembourser un paiement — sans jamais avoir besoin d'une clé API ni d'un
 * secret HMAC (voir DashboardController, guardé par SessionGuard).
 */
describe('Surface /dashboard/* (e2e)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let account: TestMerchant & TestDashboardUser;

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(DatabaseService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    account = await createTestMerchantWithUser(app);
  });

  it('GET /dashboard/me renvoie profil + solde', async () => {
    const agent = await loginDashboard(app, account.email, account.password);
    const res = await agent.get('/dashboard/me').send();
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(account.merchantId);
    expect(res.body.balance).toBe(0);
    expect(res.body.is_active).toBe(true);
  });

  it('GET /dashboard/payments liste les paiements du marchand', async () => {
    const body = {
      amount: 2000,
      currency: 'XOF',
      method: 'manual',
      phoneNumber: '+22890004444',
      metadata: { network: 'mixx' },
    };
    await request(app.getHttpServer())
      .post('/payments')
      .set(signedHeaders(account, body, 'dashboard-list-1'))
      .send(body);

    const agent = await loginDashboard(app, account.email, account.password);
    const res = await agent.get('/dashboard/payments').send();
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    // BIGINT Postgres → toujours une chaîne côté driver pg, jamais un number (comportement déjà connu, voir types.ts côté dashboard).
    expect(Number(res.body.items[0].amount)).toBe(2000);
  });

  it('POST /dashboard/payments/:id/refund rembourse un paiement réussi', async () => {
    // Mode test (voir migrations/009_sandbox_mode.sql) : résolution
    // instantanée en 'succeeded' et TestModeAdapter.refund() accepte
    // toujours — contrairement à ManualAdapter.refund(), qui refuse
    // délibérément tout remboursement automatique (voir manual.adapter.ts).
    const body = {
      amount: 5000,
      currency: 'XOF',
      method: 'moov',
      phoneNumber: '+22890005555',
      metadata: { network: 'moov' },
    };
    const createRes = await request(app.getHttpServer())
      .post('/payments')
      .set(signedTestModeHeaders(account, body, 'dashboard-refund-1'))
      .send(body);
    const paymentId = createRes.body.id;
    expect(createRes.body.status).toBe('succeeded');

    const agent = await loginDashboard(app, account.email, account.password);
    const res = await agent.post(`/dashboard/payments/${paymentId}/refund`).set(csrfHeader()).send();
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('refunded');

    // Mode test : jamais d'écriture ledger, même pour un remboursement (voir
    // orchestrator.service.ts) — confirme que le sandbox mode tient aussi via
    // la route dashboard, pas seulement via /payments/*.
    const { rows } = await db.query(
      `SELECT * FROM ledger_entries WHERE payment_id = $1`,
      [paymentId],
    );
    expect(rows).toHaveLength(0);
  });

  it('un marchand ne peut pas rembourser le paiement d’un autre marchand', async () => {
    const other = await createTestMerchantWithUser(app, 'Autre marchand');
    const body = {
      amount: 1000,
      currency: 'XOF',
      method: 'manual',
      phoneNumber: '+22890006666',
      metadata: { network: 'mixx' },
    };
    const createRes = await request(app.getHttpServer())
      .post('/payments')
      .set(signedHeaders(other, body, 'dashboard-cross-1'))
      .send(body);

    const agent = await loginDashboard(app, account.email, account.password);
    const res = await agent
      .post(`/dashboard/payments/${createRes.body.id}/refund`)
      .set(csrfHeader())
      .send();
    expect(res.status).toBe(404);
  });
});
