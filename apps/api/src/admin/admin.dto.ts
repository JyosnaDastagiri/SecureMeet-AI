import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class AdminUpdateUserDto {
  @IsOptional()
  @IsIn(['PARTICIPANT', 'HOST', 'ADMIN'])
  role?: 'PARTICIPANT' | 'HOST' | 'ADMIN';

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateModerationDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  warnThreshold?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  blockThreshold?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  customTerms?: string[];
}
