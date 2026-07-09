import { IsEmail, IsString, MinLength } from 'class-validator';

export class AdminResetPasswordDto {
  @IsEmail({}, { message: 'email doit être une adresse valide.' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'newPassword doit contenir au moins 8 caractères.' })
  newPassword!: string;
}
