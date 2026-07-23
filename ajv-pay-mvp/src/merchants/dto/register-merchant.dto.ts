import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class RegisterMerchantDto {
  @IsString()
  @IsNotEmpty({ message: 'Le nom du marchand est obligatoire.' })
  @MaxLength(200)
  name!: string;

  /** Obligatoire : sert aussi d'identifiant de connexion au dashboard (voir merchant_users). */
  @IsEmail({}, { message: 'email doit être une adresse e-mail valide.' })
  email!: string;

  /** Mot de passe du compte de connexion dashboard créé avec le marchand — jamais confondu avec hmac_secret (clé d'intégration). */
  @IsString()
  @MinLength(8, { message: 'password doit contenir au moins 8 caractères.' })
  password!: string;

  @IsOptional()
  @IsUrl(
    { require_tld: false, protocols: ['https'], require_protocol: true },
    { message: 'webhookUrl doit être une URL https valide (ex: https://exemple.com/webhooks/ajvpay).' },
  )
  webhookUrl?: string;
}
