import { IsIn, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

/**
 * Les propriétés sans valeur par défaut utilisent `!` (definite assignment
 * assertion) : elles ne sont jamais construites via `new CreatePaymentDto()`
 * dans notre code — c'est le ValidationPipe de NestJS qui les peuple à partir
 * du corps de la requête HTTP, après quoi class-validator vérifie qu'elles
 * respectent bien les contraintes ci-dessous.
 */
export class CreatePaymentDto {
  @IsInt()
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsString()
  currency?: string = 'XOF';

  @IsIn(['moov', 'mixx', 'manual', 'cinetpay'])
  method!: 'moov' | 'mixx' | 'manual' | 'cinetpay';

  @IsString()
  @Matches(/^\+?[0-9]{8,15}$/, {
    message: 'Numéro de téléphone invalide (format attendu : +228XXXXXXXX)',
  })
  phoneNumber!: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}
