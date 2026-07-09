import { INestApplication } from '@nestjs/common';
import { DatabaseService } from '../src/database/database.service';
import { OutboxService } from '../src/outbox/outbox.service';
import { WebhooksService } from '../src/webhooks/webhooks.service';
import { AlertingService } from '../src/worker/alerting.service';
import { createTestApp, resetDatabase } from './utils/test-app';

/**
 * Garanties testées : AlertingService (Phase 7b, voir worker/alerting.service.ts)
 * n'envoie rien tant qu'ALERT_WEBHOOK_URL n'est pas configuré ni tant que
 * la file reste sous le seuil, envoie bien un webhook JSON au-delà du
 * seuil, et respecte le cooldown pour ne pas spammer.
 *
 * `AlertingService` est instancié directement ici (comme un test unitaire)
 * plutôt que résolu via le conteneur DI — seul `ConfigService` est simulé,
 * `OutboxService`/`WebhooksService` sont les vraies instances de l'app,
 * donc les requêtes de comptage touchent réellement la base de test.
 */
describe('AlertingService — alerte webhook backlog outbox/webhooks (e2e)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let outbox: OutboxService;
  let webhooks: WebhooksService;

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(DatabaseService);
    outbox = app.get(OutboxService);
    webhooks = app.get(WebhooksService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  function makeAlerting(overrides: Record<string, string>): AlertingService {
    const config = { get: (_key: string, def?: string) => overrides[_key] ?? def } as any;
    return new AlertingService(config, outbox, webhooks);
  }

  async function seedUnprocessedOutboxEvents(count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
      await db.query(`INSERT INTO outbox_events (event_type, payload) VALUES ('payment.succeeded', '{}')`);
    }
  }

  it("n'envoie rien si ALERT_WEBHOOK_URL n'est pas configuré, même très au-dessus du seuil", async () => {
    await seedUnprocessedOutboxEvents(50);
    const fetchSpy = jest.spyOn(global, 'fetch');
    const alerting = makeAlerting({});

    await alerting.checkAndAlert();

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('n’envoie rien si la file reste sous le seuil configuré', async () => {
    await seedUnprocessedOutboxEvents(5);
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as any);
    const alerting = makeAlerting({
      ALERT_WEBHOOK_URL: 'https://example.com/hook',
      ALERT_OUTBOX_BACKLOG_THRESHOLD: '20',
    });

    await alerting.checkAndAlert();

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('envoie une alerte au-delà du seuil, puis respecte le cooldown', async () => {
    await seedUnprocessedOutboxEvents(25);
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as any);
    const alerting = makeAlerting({
      ALERT_WEBHOOK_URL: 'https://example.com/hook',
      ALERT_OUTBOX_BACKLOG_THRESHOLD: '20',
      ALERT_COOLDOWN_MINUTES: '15',
    });

    await alerting.checkAndAlert();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://example.com/hook');
    const body = JSON.parse((options as any).body);
    expect(body.outboxUnprocessedCount).toBe(25);

    // Deuxième vérification immédiate : toujours au-dessus du seuil, mais
    // sous cooldown — pas de nouvelle alerte envoyée.
    await alerting.checkAndAlert();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fetchSpy.mockRestore();
  });
});
