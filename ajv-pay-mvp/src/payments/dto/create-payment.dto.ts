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

  /**
   * `fedapay` par défaut si omis : c'est la méthode automatique recommandée
   * pour toute nouvelle plateforme qui se connecte à AJV Pay (résolution
   * par webhook, aucune intervention admin nécessaire) — 'manual' reste
   * disponible mais n'est plus le choix implicite (décision utilisateur
   * du 2026-07-23).
   */
  @IsOptional()
  @IsIn(['moov', 'mixx', 'manual', 'cinetpay', 'fedapay'])
  method?: 'moov' | 'mixx' | 'manual' | 'cinetpay' | 'fedapay' = 'fedapay';

  @IsString()
  @Matches(/^\+?[0-9]{8,15}$/, {
    message: 'Numéro de téléphone invalide (format attendu : +228XXXXXXXX)',
  })
  phoneNumber!: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}
