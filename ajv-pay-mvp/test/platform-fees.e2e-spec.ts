import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { LedgerService } from '../src/ledger/ledger.service';
import {
  createTestApp,
  createTestMerchant,
  resetDatabase,
  signedHeaders,
  signedTestModeHeaders,
  TestMerchant,
} from './utils/test-app';

/**
 * Garantie testée de bout en bout (API réelle + vraie base) : avec
 * PLATFORM_FEE_BPS configuré, un paiement 'live' réussi prélève la
 * commission et la retrouve dans le solde marchand ET le solde de
 * commissions — le calcul arithmétique pur (buildSuccessEntries/
 * buildRefundEntries) est lui déjà couvert par ledger.service.spec.ts.
 *
 * `process.env.PLATFORM_FEE_BPS` est réglé AVANT `createTestApp()` (lu une
 * fois à l'initialisation de ConfigService pour cette instance d'app) et
 * nettoyé en `afterAll` — cette suite tourne dans le même process que les
 * autres fichiers e2e (`--runInBand`), qui supposent tous PLATFORM_FEE_BPS
 * désactivé (défaut) pour leurs propres assertions de solde.
 */
describe('Commission plateforme (PLATFORM_FEE_BPS) (e2e)', () => {
  let app: INestApplication;
  let ledger: LedgerService;
  let merchant: TestMerchant;

  beforeAll(async () => {
    process.env.PLATFORM_FEE_BPS = '200'; // 2%
    app = await createTestApp();
    ledger = app.get(LedgerService);
  });

  afterAll(async () => {
    await app.close();
    delete process.env.PLATFORM_FEE_BPS;
  });

  beforeEach(async () => {
    await resetDatabase(app);
    merchant = await createTestMerchant(app);
  });

  it('un paiement manual réussi (mode live) crédite le marchand du net et AJV Pay de la commission', async () => {
    const body = {
      amount: 10_000,
      currency: 'XOF',
      method: 'manual',
      phoneNumber: '+22890007777',
      metadata: { network: 'mixx' },
    };
    const createRes = await request(app.getHttpServer())
      .post('/payments')
      .set(signedHeaders(merchant, body, 'fee-e2e-1'))
      .send(body);
    const paymentId = createRes.body.id;

    await request(app.getHttpServer())
      .post(`/admin/manual-payments/${paymentId}/confirm`)
      .set('Authorization', `Bearer ${process.env.ADMIN_API_KEY}`)
      .send();

    expect(await ledger.getMerchantBalance(merchant.id)).toBe(9_800);
    expect(await ledger.getFeesBalance()).toBe(200);
  });

  it('un paiement en mode test ne prélève aucune commission (le ledger est entièrement ignoré)', async () => {
    const body = {
      amount: 5_000,
      currency: 'XOF',
      method: 'moov',
      phoneNumber: '+22890008888',
      metadata: { network: 'moov' },
    };
    await request(app.getHttpServer())
      .post('/payments')
      .set(signedTestModeHeaders(merchant, body, 'fee-e2e-2'))
      .send(body);

    expect(await ledger.getMerchantBalance(merchant.id)).toBe(0);
    expect(await ledger.getFeesBalance()).toBe(0);
  });
});
