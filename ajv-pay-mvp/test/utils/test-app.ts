import { randomBytes } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { DatabaseService } from '../../src/database/database.service';
import { computeHmacSignature, hashApiKey } from '../../src/common/auth/hmac.util';
import { hashPassword } from '../../src/common/auth/password.util';
import { CSRF_HEADER_NAME } from '../../src/dashboard-auth/session-cookie.constants';

export interface TestMerchant {
  id: string;
  apiKey: string;
  hmacSecret: string;
  testApiKey: string;
  testHmacSecret: string;
}

/**
 * Démarre la vraie AppModule (mêmes modules/guards/pipes qu'en production)
 * contre la base ajvpay_test — pas un module de test allégé, pour que ces
 * tests engagent réellement DatabaseService, LedgerService, OutboxService,
 * etc. tels qu'ils tournent en prod.
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

/** Vide toutes les tables mutables entre deux tests — jamais schema_migrations. */
export async function resetDatabase(app: INestApplication): Promise<void> {
  const db = app.get(DatabaseService);
  await db.query(`
    TRUNCATE TABLE
      webhook_attempts, outbox_events, manual_payment_proofs, ledger_entries,
      payment_events, payments, idempotency_keys, audit_logs, merchants,
      worker_heartbeats, merchant_users, merchant_sessions
    CASCADE
  `);
}

/** Réplique la logique de scripts/create-merchant.js (2 paires de clés), mais en process pour les tests. */
export async function createTestMerchant(
  app: INestApplication,
  name = 'Test Merchant',
): Promise<TestMerchant> {
  const db = app.get(DatabaseService);
  const apiKey = `ajvpay_live_test_${randomBytes(16).toString('hex')}`;
  const hmacSecret = randomBytes(32).toString('hex');
  const testApiKey = `ajvpay_test_test_${randomBytes(16).toString('hex')}`;
  const testHmacSecret = randomBytes(32).toString('hex');

  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO merchants (name, email, api_key_hash, hmac_secret, test_api_key_hash, test_hmac_secret)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [name, null, hashApiKey(apiKey), hmacSecret, hashApiKey(testApiKey), testHmacSecret],
  );

  return { id: rows[0].id, apiKey, hmacSecret, testApiKey, testHmacSecret };
}

/**
 * En-têtes d'authentification marchand pour une requête POST/PATCH avec
 * corps JSON — signature HMAC obligatoire dès qu'il y a un body (voir
 * ApiKeyGuard). `idempotencyKey` omis pour les routes qui n'en ont pas
 * besoin (submit-proof, etc.).
 */
export function signedHeaders(
  merchant: TestMerchant,
  body: unknown,
  idempotencyKey?: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${merchant.apiKey}`,
    'X-Signature': computeHmacSignature(merchant.hmacSecret, JSON.stringify(body ?? {})),
  };
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }
  return headers;
}

/** En-tête d'authentification pour une simple lecture GET (signature optionnelle, voir ApiKeyGuard). */
export function authHeader(merchant: TestMerchant): Record<string, string> {
  return { Authorization: `Bearer ${merchant.apiKey}` };
}

/** Équivalent de signedHeaders() mais avec la paire de clés "test" du marchand (voir migrations/009_sandbox_mode.sql). */
export function signedTestModeHeaders(
  merchant: TestMerchant,
  body: unknown,
  idempotencyKey?: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${merchant.testApiKey}`,
    'X-Signature': computeHmacSignature(merchant.testHmacSecret, JSON.stringify(body ?? {})),
  };
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }
  return headers;
}

export interface TestDashboardUser {
  merchantId: string;
  email: string;
  password: string;
}

/** Crée un marchand ET son compte de connexion dashboard (voir migrations/010_merchant_dashboard_auth.sql), mot de passe en clair connu pour les tests. */
export async function createTestMerchantWithUser(
  app: INestApplication,
  name = 'Test Merchant',
): Promise<TestMerchant & TestDashboardUser> {
  const merchant = await createTestMerchant(app, name);
  const db = app.get(DatabaseService);
  const email = `${randomBytes(6).toString('hex')}@example.com`;
  const password = 'correct-horse-battery-staple';

  await db.query(
    `INSERT INTO merchant_users (merchant_id, email, password_hash) VALUES ($1, $2, $3)`,
    [merchant.id, email, await hashPassword(password)],
  );

  return { ...merchant, merchantId: merchant.id, email, password };
}

/**
 * Se connecte au dashboard et retourne un agent supertest qui conserve le
 * cookie de session entre les appels (`request()` seul ne le fait PAS —
 * il faut `request.agent(...)` pour ça).
 */
export async function loginDashboard(
  app: INestApplication,
  email: string,
  password: string,
): Promise<ReturnType<typeof request.agent>> {
  const agent = request.agent(app.getHttpServer());
  await agent.post('/dashboard/login').send({ email, password }).expect(200);
  return agent;
}

/** En-tête anti-CSRF exigé par SessionGuard sur toute requête mutante vers /dashboard/*. */
export function csrfHeader(): Record<string, string> {
  return { [CSRF_HEADER_NAME]: '1' };
}
