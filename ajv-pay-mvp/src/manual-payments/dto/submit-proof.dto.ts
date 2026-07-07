import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SubmitProofDto {
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  reference!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
