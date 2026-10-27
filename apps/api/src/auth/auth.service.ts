import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../core/prisma.service';
import { AuditService } from '../core/audit.service';
import { LoginDto, RegisterDto } from './auth.dto';

const BCRYPT_ROUNDS = 12;
// Used to keep response time similar when the email does not exist (reduces user enumeration).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

export const publicUser = (u: Pick<User, 'id' | 'email' | 'name' | 'role' | 'createdAt'>) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  createdAt: u.createdAt,
});

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('An account with this email already exists');
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({
      data: { email, name: dto.name, passwordHash, role: dto.role ?? 'PARTICIPANT' },
    });
    await this.audit.log(user.id, 'AUTH_REGISTER', 'User', user.id, { role: user.role });
    return { token: await this.sign(user), user: publicUser(user) };
  }

  async login(dto: LoginDto) {
    const email = dto.email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    const ok = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok || !user.isActive) {
      await this.audit.log(user?.id ?? null, 'AUTH_LOGIN_FAILED', 'User', user?.id, { email });
      throw new UnauthorizedException('Invalid email or password');
    }
    await this.audit.log(user.id, 'AUTH_LOGIN', 'User', user.id);
    return { token: await this.sign(user), user: publicUser(user) };
  }

  async logout(userId: string) {
    // JWTs are stateless; the client discards the token. We record the event for auditing.
    await this.audit.log(userId, 'AUTH_LOGOUT', 'User', userId);
    return { ok: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return publicUser(user);
  }

  private sign(user: User) {
    return this.jwt.signAsync({ sub: user.id, role: user.role });
  }
}
