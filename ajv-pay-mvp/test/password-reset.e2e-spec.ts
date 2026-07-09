import { INestApplication } from '@nestjs/common';
import request from 'supertest';
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
 * Garanties testées : réinitialisation par l'admin plateforme (faute
 * d'infrastructure d'e-mail, voir DashboardAuthService.resetPasswordByEmail)
 * et changement de mot de passe self-service pour un marchand déjà connecté.
 */
describe('Réinitialisation de mot de passe (e2e)', () => {
  let app: INestApplication;
  let account: TestMerchant & TestDashboardUser;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    account = await createTestMerchantWithUser(app);
  });

  describe('Réinitialisation par l’admin plateforme', () => {
    it('fixe un nouveau mot de passe et invalide les sessions existantes', async () => {
      const agent = await loginDashboard(app, account.email, account.password);
      await agent.get('/dashboard/me').expect(200); // session valide avant réinitialisation

      const resetRes = await request(app.getHttpServer())
        .post('/admin/merchant-users/reset-password')
        .set('Authorization', `Bearer ${process.env.ADMIN_API_KEY}`)
        .send({ email: account.email, newPassword: 'nouveau-mot-de-passe-123' });
      expect(resetRes.status).toBe(200);

      // L'ancienne session ne fonctionne plus.
      await agent.get('/dashboard/me').expect(401);

      // L'ancien mot de passe ne fonctionne plus.
      const oldLoginRes = await request(app.getHttpServer())
        .post('/dashboard/login')
        .send({ email: account.email, password: account.password });
      expect(oldLoginRes.status).toBe(401);

      // Le nouveau mot de passe fonctionne.
      const newLoginRes = await request(app.getHttpServer())
        .post('/dashboard/login')
        .send({ email: account.email, password: 'nouveau-mot-de-passe-123' });
      expect(newLoginRes.status).toBe(200);
    });

    it('refuse sans la clé admin', async () => {
      const res = await request(app.getHttpServer())
        .post('/admin/merchant-users/reset-password')
        .send({ email: account.email, newPassword: 'peu-importe123' });
      expect(res.status).toBe(401);
    });

    it("échoue proprement pour un e-mail inconnu", async () => {
      const res = await request(app.getHttpServer())
        .post('/admin/merchant-users/reset-password')
        .set('Authorization', `Bearer ${process.env.ADMIN_API_KEY}`)
        .send({ email: 'inconnu@example.com', newPassword: 'peu-importe123' });
      expect(res.status).toBe(404);
    });
  });

  describe('Changement de mot de passe self-service', () => {
    it('change le mot de passe avec le mot de passe actuel correct', async () => {
      const agent = await loginDashboard(app, account.email, account.password);
      const res = await agent
        .post('/dashboard/change-password')
        .set(csrfHeader())
        .send({ currentPassword: account.password, newPassword: 'autre-mot-de-passe-456' });
      expect(res.status).toBe(200);

      const newLoginRes = await request(app.getHttpServer())
        .post('/dashboard/login')
        .send({ email: account.email, password: 'autre-mot-de-passe-456' });
      expect(newLoginRes.status).toBe(200);
    });

    it('refuse si le mot de passe actuel est incorrect', async () => {
      const agent = await loginDashboard(app, account.email, account.password);
      const res = await agent
        .post('/dashboard/change-password')
        .set(csrfHeader())
        .send({ currentPassword: 'mauvais-mot-de-passe', newPassword: 'autre-mot-de-passe-456' });
      expect(res.status).toBe(401);

      // L'ancien mot de passe fonctionne toujours (rien n'a changé).
      const loginRes = await request(app.getHttpServer())
        .post('/dashboard/login')
        .send({ email: account.email, password: account.password });
      expect(loginRes.status).toBe(200);
    });
  });
});
