import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WebhooksService } from './webhooks.service';

/**
 * Tourne toutes les 30 secondes (ajustable). Au volume du MVP (quelques
 * marchands), c'est largement suffisant — pas besoin d'un scheduler
 * distribué pour ça.
 */
@Injectable()
export class WebhooksCron {
  private readonly logger = new Logger(WebhooksCron.name);

  constructor(private readonly webhooks: WebhooksService) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async handleDueWebhooks() {
    try {
      await this.webhooks.processDue();
    } catch (err: any) {
      this.logger.error(`Erreur lors du traitement des webhooks dus: ${err.message}`);
    }
  }
}
