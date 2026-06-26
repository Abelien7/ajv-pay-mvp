import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class RegisterMerchantDto {
  @IsString()
  @IsNotEmpty({ message: 'Le nom du marchand est obligatoire.' })
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsEmail({}, { message: 'email doit être une adresse e-mail valide.' })
  email?: string;

  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'webhookUrl doit être une URL valide.' })
  webhookUrl?: string;
}
