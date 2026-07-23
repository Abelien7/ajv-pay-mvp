import { IsUrl } from 'class-validator';

export class UpdateWebhookUrlDto {
  @IsUrl(
    { require_tld: false, protocols: ['https'], require_protocol: true },
    { message: 'webhookUrl doit être une URL https valide (ex: https://exemple.com/webhooks/ajvpay).' },
  )
  webhookUrl!: string;
}
