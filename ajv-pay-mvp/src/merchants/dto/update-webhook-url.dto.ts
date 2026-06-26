import { IsUrl } from 'class-validator';

export class UpdateWebhookUrlDto {
  @IsUrl({ require_tld: false }, { message: 'webhookUrl doit être une URL valide (ex: https://exemple.com/webhooks/ajvpay)' })
  webhookUrl!: string;
}
