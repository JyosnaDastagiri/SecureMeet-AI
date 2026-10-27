import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateMeetingDto {
  @Transform(trim)
  @IsString()
  @Length(3, 120)
  title: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsDateString()
  scheduledStart: string;

  @IsOptional()
  @IsDateString()
  scheduledEnd?: string;

  @IsOptional()
  @IsBoolean()
  waitingRoomEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  moderationEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  inviteeIds?: string[];
}

export class UpdateMeetingDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(3, 120)
  title?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsDateString()
  scheduledStart?: string;

  @IsOptional()
  @IsDateString()
  scheduledEnd?: string;

  @IsOptional()
  @IsBoolean()
  waitingRoomEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  moderationEnabled?: boolean;
}

export class InviteDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  userIds: string[];
}
