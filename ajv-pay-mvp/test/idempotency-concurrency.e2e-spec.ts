import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service';
import { createTestApp, createTestMerchant, resetDatabase, signedHeaders, TestMerchant } from './utils/test-app';

/**
 * Garantie testée : merchant_id + Idempotency-Key ne doit jamais produire
 * deux paiements, MÊME quand deux requêtes identiques arrivent en même
 * temps (double-clic, retry réseau côté marchand) — pas seulement en séquentiel.
 */
describe('Idempotence de POST /payments sous requêtes concurrentes (e2e)', () => {
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

  it('deux requêtes simultanées avec la même Idempotency-Key ne créent qu’un seul paiement, sans 500', async () => {
    const body = {
      amount: 5000,
      currency: 'XOF',
      method: 'manual',
      phoneNumber: '+22890000000',
      metadata: { network: 'mixx' },
    };
    const idemKey = 'concurrent-test-key-1';

    const [res1, res2] = await Promise.all([
      request(app.getHttpServer())
        .post('/payments')
        .set(signedHeaders(merchant, body, idemKey))
        .send(body),
      request(app.getHttpServer())
        .post('/payments')
        .set(signedHeaders(merchant, body, idemKey))
        .send(body),
    ]);

    // Aucune des deux requêtes ne doit jamais échouer en 500 : soit une
    // création normale, soit un replay idempotent — jamais une erreur brute.
    expect(res1.status).toBeLessThan(500);
    expect(res2.status).toBeLessThan(500);
    expect(res1.body.id).toBeDefined();
    expect(res2.body.id).toBe(res1.body.id);

    const { rows } = await db.query(
      'SELECT COUNT(*) FROM payments WHERE merchant_id = $1 AND idempotency_key = $2',
      [merchant.id, idemKey],
    );
    expect(Number(rows[0].count)).toBe(1);
  });
});
