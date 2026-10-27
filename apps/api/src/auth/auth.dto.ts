import { IsEmail, IsIn, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).+$/;
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class RegisterDto {
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  email: string;

  @Transform(trim)
  @IsString()
  @Length(2, 60)
  name: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72) // bcrypt only uses the first 72 bytes
  @Matches(PASSWORD_RULE, { message: 'password must contain at least one letter and one number' })
  password: string;

  @IsOptional()
  @IsIn(['PARTICIPANT', 'HOST'])
  role?: 'PARTICIPANT' | 'HOST';
}

export class LoginDto {
  @Transform(trim)
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password: string;
}
