import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Forme commune à covered_countries et payment_networks (voir SiteContentService). */
export class CreateListItemDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  displayOrder?: number;
}

export class UpdateListItemDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  displayOrder?: number;
}
