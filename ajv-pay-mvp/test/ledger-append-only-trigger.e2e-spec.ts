import { INestApplication } from '@nestjs/common';
import { DatabaseService } from '../src/database/database.service';
import { createTestApp, createTestMerchant, resetDatabase } from './utils/test-app';

/**
 * Garantie testée : le trigger Postgres `forbid_update_delete()`
 * (migrations/001_init.sql) bloque physiquement tout UPDATE/DELETE sur
 * ledger_entries et payment_events — un test avec un client `pg` mocké ne
 * peut jamais couvrir ça, seule une vraie base le peut.
 */
describe('Trigger append-only (ledger_entries / payment_events) (e2e)', () => {
  let app: INestApplication;
  let db: DatabaseService;

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(DatabaseService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  it('refuse un UPDATE direct sur ledger_entries', async () => {
    const merchant = await createTestMerchant(app);
    await db.query(
      `INSERT INTO ledger_entries (merchant_id, account, direction, amount, currency, reference)
       VALUES ($1, 'merchant_payable', 'debit', 1000, 'XOF', 'test-update')`,
      [merchant.id],
    );

    await expect(
      db.query(`UPDATE ledger_entries SET amount = 2000 WHERE merchant_id = $1`, [merchant.id]),
    ).rejects.toThrow(/append-only/i);
  });

  it('refuse un DELETE direct sur ledger_entries', async () => {
    const merchant = await createTestMerchant(app);
    await db.query(
      `INSERT INTO ledger_entries (merchant_id, account, direction, amount, currency, reference)
       VALUES ($1, 'merchant_payable', 'credit', 1500, 'XOF', 'test-delete')`,
      [merchant.id],
    );

    await expect(
      db.query(`DELETE FROM ledger_entries WHERE merchant_id = $1`, [merchant.id]),
    ).rejects.toThrow(/append-only/i);
  });

  it('refuse une suppression directe sur payment_events', async () => {
    const merchant = await createTestMerchant(app);
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO payments (merchant_id, amount, currency, method, phone_number, idempotency_key, status)
       VALUES ($1, 1000, 'XOF', 'manual', '+22890000002', 'trigger-test', 'pending') RETURNING id`,
      [merchant.id],
    );
    const paymentId = rows[0].id;
    await db.query(
      `INSERT INTO payment_events (payment_id, event_type, payload) VALUES ($1, 'created', '{}')`,
      [paymentId],
    );

    await expect(
      db.query(`DELETE FROM payment_events WHERE payment_id = $1`, [paymentId]),
    ).rejects.toThrow(/append-only/i);
  });
});
