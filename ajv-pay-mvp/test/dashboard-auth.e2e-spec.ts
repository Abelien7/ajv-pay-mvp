import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service';
import { hashApiKey } from '../src/common/auth/hmac.util';
import { CSRF_HEADER_NAME, SESSION_COOKIE_NAME } from '../src/dashboard-auth/session-cookie.constants';
import {
  createTestApp,
  createTestMerchantWithUser,
  csrfHeader,
  loginDashboard,
  resetDatabase,
  TestDashboardUser,
  TestMerchant,
} from './utils/test-app';

/**
 * Garanties testées : login/logout par cookie de session, jamais de clé
 * API/HMAC ; protection CSRF par header personnalisé sur toute requête
 * mutante ; session expirée refusée (voir migrations/010_merchant_dashboard_auth.sql).
 */
describe('Authentification dashboard marchand (e2e)', () => {
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

  it('refuse un login avec un mot de passe incorrect', async () => {
    const res = await request(app.getHttpServer())
      .post('/dashboard/login')
      .send({ email: account.email, password: 'mauvais-mot-de-passe' });
    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('refuse un login avec un e-mail inconnu', async () => {
    const res = await request(app.getHttpServer())
      .post('/dashboard/login')
      .send({ email: 'inconnu@example.com', password: 'peu-importe123' });
    expect(res.status).toBe(401);
  });

  it('accepte un login valide et pose un cookie de session', async () => {
    const res = await request(app.getHttpServer())
      .post('/dashboard/login')
      .send({ email: account.email, password: account.password });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(account.merchantId);
    const setCookie = res.headers['set-cookie']?.[0] ?? '';
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie.toLowerCase()).toContain('httponly');
  });

  it('refuse /dashboard/me sans aucun cookie de session', async () => {
    const res = await request(app.getHttpServer()).get('/dashboard/me').send();
    expect(res.status).toBe(401);
  });

  it('accepte /dashboard/me avec un cookie de session valide', async () => {
    const agent = await loginDashboard(app, account.email, account.password);
    const res = await agent.get('/dashboard/me').send();
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(account.merchantId);
  });

  it('refuse une requête mutante sans le header anti-CSRF, même avec un cookie valide', async () => {
    const agent = await loginDashboard(app, account.email, account.password);
    const res = await agent.patch('/dashboard/webhook-url').send({ webhookUrl: 'https://exemple.com/hook' });
    expect(res.status).toBe(401);
  });

  it('accepte une requête mutante avec le header anti-CSRF', async () => {
    const agent = await loginDashboard(app, account.email, account.password);
    const res = await agent
      .patch('/dashboard/webhook-url')
      .set(csrfHeader())
      .send({ webhookUrl: 'https://exemple.com/hook' });
    expect(res.status).toBe(200);
    expect(res.body.webhook_url).toBe('https://exemple.com/hook');
  });

  it('la déconnexion invalide immédiatement le cookie de session', async () => {
    const agent = await loginDashboard(app, account.email, account.password);
    // POST /dashboard/logout n'est pas derrière SessionGuard (login/logout
    // n'exigent pas de session valide par nature) — pas de header CSRF
    // nécessaire ici, contrairement aux routes de DashboardController.
    await agent.post('/dashboard/logout').send().expect(200);

    const res = await agent.get('/dashboard/me').send();
    expect(res.status).toBe(401);
  });

  it('refuse une session expirée', async () => {
    const rawToken = 'expired-session-raw-token';
    const { rows } = await db.query<{ id: string }>(
      `SELECT id FROM merchant_users WHERE email = $1`,
      [account.email],
    );
    await db.query(
      `INSERT INTO merchant_sessions (merchant_user_id, session_token_hash, expires_at)
       VALUES ($1, $2, NOW() - INTERVAL '1 minute')`,
      [rows[0].id, hashApiKey(rawToken)],
    );

    const res = await request(app.getHttpServer())
      .get('/dashboard/me')
      .set('Cookie', `${SESSION_COOKIE_NAME}=${rawToken}`)
      .send();
    expect(res.status).toBe(401);
  });
});
