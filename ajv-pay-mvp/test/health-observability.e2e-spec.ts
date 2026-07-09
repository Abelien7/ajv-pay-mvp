import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service';
import { createTestApp, resetDatabase } from './utils/test-app';

/**
 * Garantie testée : /health doit rendre visible un Worker arrêté ou en
 * retard, et une file de webhooks qui s'accumule — avant qu'un marchand ne
 * remarque une notification manquante (voir health.controller.ts).
 */
describe('GET /health — observabilité Worker/Outbox (e2e)', () => {
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

  it('signale un Worker qui n’a jamais battu (aucune ligne de heartbeat)', async () => {
    const res = await request(app.getHttpServer()).get('/health').send();
    expect(res.status).toBe(200);
    expect(res.body.worker.alive).toBe(false);
    expect(res.body.worker.lastTickAt).toBeNull();
    expect(res.body.outbox.unprocessedCount).toBe(0);
    expect(res.body.webhooks.pendingCount).toBe(0);
  });

  it('signale un Worker vivant juste après un battement récent', async () => {
    await db.query(
      `INSERT INTO worker_heartbeats (id, last_tick_at) VALUES ('worker', NOW())`,
    );

    const res = await request(app.getHttpServer()).get('/health').send();
    expect(res.status).toBe(200);
    expect(res.body.worker.alive).toBe(true);
    expect(res.body.worker.secondsSinceLastTick).toBeLessThan(5);
  });

  it('signale un Worker en retard (dernier battement trop ancien)', async () => {
    await db.query(
      `INSERT INTO worker_heartbeats (id, last_tick_at) VALUES ('worker', NOW() - INTERVAL '2 minutes')`,
    );

    const res = await request(app.getHttpServer()).get('/health').send();
    expect(res.status).toBe(200);
    expect(res.body.worker.alive).toBe(false);
    expect(res.body.worker.secondsSinceLastTick).toBeGreaterThan(30);
  });
});
