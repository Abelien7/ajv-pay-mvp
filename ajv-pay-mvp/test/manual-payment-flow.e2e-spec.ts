import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { LedgerService } from '../src/ledger/ledger.service';
import { createTestApp, authHeader, createTestMerchant, resetDatabase, signedHeaders, TestMerchant } from './utils/test-app';

/**
 * Scénario complet côté "manual" : déterministe, aucun appel réseau externe
 * (ManualAdapter.initiate() ne contacte aucun provider), contrairement à
 * moov/mixx qui dépendent de vraies credentials pas encore obtenues.
 */
describe('Scénario complet paiement manual (e2e)', () => {
  let app: INestApplication;
  let ledger: LedgerService;
  let merchant: TestMerchant;

  beforeAll(async () => {
    app = await createTestApp();
    ledger = app.get(LedgerService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    merchant = await createTestMerchant(app);
  });

  it('création → preuve → confirmation admin → solde marchand correct', async () => {
    const body = {
      amount: 15000,
      currency: 'XOF',
      method: 'manual',
      phoneNumber: '+22890000003',
      metadata: { network: 'mixx', order_id: 'TEST-1' },
    };

    const createRes = await request(app.getHttpServer())
      .post('/payments')
      .set(signedHeaders(merchant, body, 'manual-flow-1'))
      .send(body);
    expect(createRes.status).toBe(201);
    expect(createRes.body.status).toBe('processing');
    const paymentId = createRes.body.id;

    const proofBody = { reference: 'MIXX-REF-12345', note: 'Paiement client' };
    const proofRes = await request(app.getHttpServer())
      .post(`/payments/${paymentId}/submit-proof`)
      .set(signedHeaders(merchant, proofBody))
      .send(proofBody);
    expect(proofRes.status).toBe(200);

    const confirmRes = await request(app.getHttpServer())
      .post(`/admin/manual-payments/${paymentId}/confirm`)
      .set('Authorization', `Bearer ${process.env.ADMIN_API_KEY}`)
      .send();
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.status).toBe('succeeded');

    const balance = await ledger.getMerchantBalance(merchant.id);
    expect(balance).toBe(15000);

    const getRes = await request(app.getHttpServer())
      .get(`/payments/${paymentId}`)
      .set(authHeader(merchant))
      .send();
    expect(getRes.status).toBe(200);
    expect(getRes.body.status).toBe('succeeded');
  });
});
