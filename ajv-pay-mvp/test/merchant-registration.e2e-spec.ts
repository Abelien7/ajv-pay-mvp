import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, resetDatabase } from './utils/test-app';

/**
 * Garantie testée : POST /merchants/register (utilisé par le formulaire
 * d'inscription du dashboard, voir dashboard/src/SignupForm.tsx) crée à la
 * fois le marchand ET son compte de connexion dashboard en une seule
 * opération — un marchand fraîchement inscrit doit pouvoir se connecter
 * immédiatement avec l'e-mail/mot de passe qu'il vient de choisir.
 */
describe('POST /merchants/register (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  it('crée un marchand + son compte dashboard, et permet de se connecter juste après', async () => {
    const registerRes = await request(app.getHttpServer())
      .post('/merchants/register')
      .send({ name: 'Nouveau Commerce', email: 'nouveau@example.com', password: 'motdepasse123' });

    expect(registerRes.status).toBe(201);
    expect(registerRes.body.live_api_key).toMatch(/^ajvpay_live_/);
    expect(registerRes.body.test_api_key).toMatch(/^ajvpay_test_/);
    expect(registerRes.body.live_hmac_secret).toBeTruthy();
    expect(registerRes.body.test_hmac_secret).toBeTruthy();

    const loginRes = await request(app.getHttpServer())
      .post('/dashboard/login')
      .send({ email: 'nouveau@example.com', password: 'motdepasse123' });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.name).toBe('Nouveau Commerce');
    expect(loginRes.body.id).toBe(registerRes.body.id);
  });

  it('refuse une deuxième inscription avec le même e-mail (409)', async () => {
    const body = { name: 'Commerce A', email: 'duplique@example.com', password: 'motdepasse123' };
    await request(app.getHttpServer()).post('/merchants/register').send(body).expect(201);

    const secondRes = await request(app.getHttpServer()).post('/merchants/register').send(body);
    expect(secondRes.status).toBe(409);
  });

  it('refuse un mot de passe trop court', async () => {
    const res = await request(app.getHttpServer())
      .post('/merchants/register')
      .send({ name: 'Commerce Court', email: 'court@example.com', password: '123' });
    expect(res.status).toBe(400);
  });
});
