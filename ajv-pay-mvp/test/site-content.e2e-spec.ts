import { randomBytes } from 'crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './utils/test-app';

/**
 * Garanties testées : la lecture publique (site vitrine) ne renvoie que le
 * publié/actif, l'écriture exige la clé admin plateforme, et les données de
 * départ (Togo, Moov Money, Mixx by Yas) posées par la migration 011 sont
 * bien présentes. `news_posts`/`covered_countries`/`payment_networks` ne
 * sont pas vidées par resetDatabase (contenu du site, pas des données de
 * transaction) — chaque test crée donc ses propres éléments avec un nom
 * aléatoire unique plutôt que de compter sur un état vide.
 */
describe('Contenu du site vitrine (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const uniqueName = (label: string) => `${label}-${randomBytes(6).toString('hex')}`;
  const adminAuth = () => ({ Authorization: `Bearer ${process.env.ADMIN_API_KEY}` });

  describe('Données de départ (migration 011)', () => {
    it('le Togo est un pays couvert actif', async () => {
      const res = await request(app.getHttpServer()).get('/site-content/countries').expect(200);
      expect(res.body.some((c: { name: string }) => c.name === 'Togo')).toBe(true);
    });

    it('Moov Money et Mixx by Yas sont des réseaux actifs', async () => {
      const res = await request(app.getHttpServer()).get('/site-content/networks').expect(200);
      const names = res.body.map((n: { name: string }) => n.name);
      expect(names).toEqual(expect.arrayContaining(['Moov Money', 'Mixx by Yas']));
    });
  });

  describe('Données de départ (migration 013)', () => {
    it('les 3 piliers AJV Card sont actifs', async () => {
      const res = await request(app.getHttpServer()).get('/site-content/card-features').expect(200);
      expect(res.body.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Lecture publique', () => {
    it('ne renvoie pas les actualités non publiées', async () => {
      const create = await request(app.getHttpServer())
        .post('/admin/site-content/news')
        .set(adminAuth())
        .send({ title: uniqueName('brouillon'), body: 'contenu' });
      expect(create.status).toBe(201);
      expect(create.body.is_published).toBe(false);

      const res = await request(app.getHttpServer()).get('/site-content/news').expect(200);
      expect(res.body.some((n: { id: string }) => n.id === create.body.id)).toBe(false);
    });

    it('renvoie les actualités publiées', async () => {
      const title = uniqueName('actu');
      const create = await request(app.getHttpServer())
        .post('/admin/site-content/news')
        .set(adminAuth())
        .send({ title, body: 'contenu', isPublished: true });
      expect(create.status).toBe(201);
      expect(create.body.published_at).not.toBeNull();

      const res = await request(app.getHttpServer()).get('/site-content/news').expect(200);
      expect(res.body.some((n: { title: string }) => n.title === title)).toBe(true);
    });

    it('ne renvoie pas un pays désactivé', async () => {
      const name = uniqueName('pays');
      const create = await request(app.getHttpServer())
        .post('/admin/site-content/countries')
        .set(adminAuth())
        .send({ name, isActive: false });
      expect(create.status).toBe(201);

      const res = await request(app.getHttpServer()).get('/site-content/countries').expect(200);
      expect(res.body.some((c: { name: string }) => c.name === name)).toBe(false);
    });
  });

  describe('Écriture admin', () => {
    it('refuse sans la clé admin', async () => {
      const res = await request(app.getHttpServer())
        .post('/admin/site-content/countries')
        .send({ name: uniqueName('pays') });
      expect(res.status).toBe(401);
    });

    it('crée, modifie puis supprime un réseau de paiement', async () => {
      const name = uniqueName('reseau');
      const create = await request(app.getHttpServer())
        .post('/admin/site-content/networks')
        .set(adminAuth())
        .send({ name });
      expect(create.status).toBe(201);
      const id = create.body.id;

      const update = await request(app.getHttpServer())
        .patch(`/admin/site-content/networks/${id}`)
        .set(adminAuth())
        .send({ isActive: false });
      expect(update.status).toBe(200);
      expect(update.body.is_active).toBe(false);
      expect(update.body.name).toBe(name); // inchangé, non fourni dans le PATCH

      const del = await request(app.getHttpServer())
        .delete(`/admin/site-content/networks/${id}`)
        .set(adminAuth());
      expect(del.status).toBe(200);

      const listRes = await request(app.getHttpServer())
        .get('/admin/site-content/networks')
        .set(adminAuth())
        .expect(200);
      expect(listRes.body.some((n: { id: string }) => n.id === id)).toBe(false);
    });

    it("échoue proprement pour un id inconnu", async () => {
      const res = await request(app.getHttpServer())
        .patch('/admin/site-content/countries/00000000-0000-0000-0000-000000000000')
        .set(adminAuth())
        .send({ name: 'peu importe' });
      expect(res.status).toBe(404);
    });

    it('crée, modifie puis supprime un pilier AJV Card', async () => {
      const title = uniqueName('pilier');
      const create = await request(app.getHttpServer())
        .post('/admin/site-content/card-features')
        .set(adminAuth())
        .send({ title, body: 'description du pilier' });
      expect(create.status).toBe(201);
      const id = create.body.id;

      const update = await request(app.getHttpServer())
        .patch(`/admin/site-content/card-features/${id}`)
        .set(adminAuth())
        .send({ isActive: false });
      expect(update.status).toBe(200);
      expect(update.body.is_active).toBe(false);
      expect(update.body.title).toBe(title); // inchangé, non fourni dans le PATCH

      const publicList = await request(app.getHttpServer()).get('/site-content/card-features').expect(200);
      expect(publicList.body.some((f: { id: string }) => f.id === id)).toBe(false);

      const del = await request(app.getHttpServer())
        .delete(`/admin/site-content/card-features/${id}`)
        .set(adminAuth());
      expect(del.status).toBe(200);
    });
  });
});
