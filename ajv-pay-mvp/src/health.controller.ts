import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from './database/database.service';
import { OutboxService } from './outbox/outbox.service';
import { WebhooksService } from './webhooks/webhooks.service';

/**
 * Au-delà du simple "process HTTP en vie" (utile pour le healthcheck
 * Railway), expose aussi l'état du filet de sécurité asynchrone : si le
 * process Worker (service Railway séparé, voir worker.ts) s'arrête
 * silencieusement, ou si des webhooks marchands s'accumulent sans être
 * livrés, c'est ici que ça doit se voir en premier — avant qu'un marchand
 * ne remarque une notification manquante.
 */
const WORKER_STALE_AFTER_SECONDS = 30; // 3x l'intervalle du @Cron (10s)

@Controller('health')
export class HealthController {
  constructor(
    private readonly db: DatabaseService,
    private readonly outbox: OutboxService,
    private readonly webhooks: WebhooksService,
  ) {}

  @Get()
  async check() {
    const [outboxBacklog, webhookBacklog, worker] = await Promise.all([
      this.outbox.getBacklogStats(),
      this.webhooks.getPendingBacklogStats(),
      this.getWorkerHeartbeat(),
    ]);

    return {
      status: 'ok',
      outbox: {
        unprocessedCount: outboxBacklog.unprocessedCount,
        oldestUnprocessedAt: outboxBacklog.oldestUnprocessedAt,
      },
      webhooks: {
        pendingCount: webhookBacklog.pendingCount,
        oldestPendingAt: webhookBacklog.oldestPendingAt,
      },
      worker,
    };
  }

  private async getWorkerHeartbeat(): Promise<{
    lastTickAt: Date | null;
    secondsSinceLastTick: number | null;
    alive: boolean;
  }> {
    const { rows } = await this.db.query<{ last_tick_at: Date }>(
      `SELECT last_tick_at FROM worker_heartbeats WHERE id = 'worker'`,
    );
    const lastTickAt = rows[0]?.last_tick_at ?? null;
    if (!lastTickAt) {
      // Aucun tick n'a encore jamais été enregistré (Worker jamais démarré,
      // ou migration 008 pas encore jouée) — pas la même chose qu'un Worker
      // tombé en panne après avoir tourné normalement.
      return { lastTickAt: null, secondsSinceLastTick: null, alive: false };
    }

    const secondsSinceLastTick = Math.floor((Date.now() - new Date(lastTickAt).getTime()) / 1000);
    return {
      lastTickAt,
      secondsSinceLastTick,
      alive: secondsSinceLastTick <= WORKER_STALE_AFTER_SECONDS,
    };
  }
}
