import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutboxService } from '../outbox/outbox.service';
import { WebhooksService } from '../webhooks/webhooks.service';

/**
 * Alerte active si la file outbox ou les livraisons webhook s'accumulent —
 * complète la surveillance passive déjà exposée par /health (voir
 * health.controller.ts, Phase 7a). Vit dans le process Worker (seul
 * endroit avec un `@Cron` en continu, voir WorkerCronService) plutôt que
 * l'API, car c'est là que le problème serait détecté en continu.
 *
 * Volontairement générique (un simple webhook JSON, pas un SDK Slack/e-mail
 * propriétaire) : `ALERT_WEBHOOK_URL` accepte un webhook entrant Slack,
 * Discord, ou tout récepteur HTTP — reste inactif (aucune erreur) tant que
 * cette variable n'est pas configurée, pour ne jamais bloquer le
 * fonctionnement normal du Worker faute de destination d'alerte choisie.
 */
@Injectable()
export class AlertingService {
  private readonly logger = new Logger(AlertingService.name);
  private lastAlertAt: Date | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly outbox: OutboxService,
    private readonly webhooks: WebhooksService,
  ) {}

  async checkAndAlert(): Promise<void> {
    const webhookUrl = this.config.get<string>('ALERT_WEBHOOK_URL');
    if (!webhookUrl) return; // pas de destination configurée : alerting inactif, sans erreur

    const outboxThreshold = Number(this.config.get<string>('ALERT_OUTBOX_BACKLOG_THRESHOLD', '20'));
    const webhookThreshold = Number(this.config.get<string>('ALERT_WEBHOOK_BACKLOG_THRESHOLD', '20'));
    const cooldownMinutes = Number(this.config.get<string>('ALERT_COOLDOWN_MINUTES', '15'));

    const [outboxBacklog, webhookBacklog] = await Promise.all([
      this.outbox.getBacklogStats(),
      this.webhooks.getPendingBacklogStats(),
    ]);

    const reasons: string[] = [];
    if (outboxBacklog.unprocessedCount > outboxThreshold) {
      reasons.push(`${outboxBacklog.unprocessedCount} événements outbox non traités (seuil: ${outboxThreshold})`);
    }
    if (webhookBacklog.pendingCount > webhookThreshold) {
      reasons.push(`${webhookBacklog.pendingCount} livraisons webhook en attente (seuil: ${webhookThreshold})`);
    }
    if (reasons.length === 0) return;

    const onCooldown =
      this.lastAlertAt && Date.now() - this.lastAlertAt.getTime() < cooldownMinutes * 60_000;
    if (onCooldown) return;

    this.lastAlertAt = new Date();
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `⚠️ AJV Pay — accumulation détectée : ${reasons.join(' ; ')}`,
          reasons,
          outboxUnprocessedCount: outboxBacklog.unprocessedCount,
          webhookPendingCount: webhookBacklog.pendingCount,
        }),
      });
    } catch (err: any) {
      this.logger.error(`Échec d'envoi de l'alerte webhook: ${err.message}`);
    }
  }
}
