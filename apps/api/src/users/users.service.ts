import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../core/prisma.service';
import { AuditService } from '../core/audit.service';
import { publicUser } from '../auth/auth.service';
import { UpdateProfileDto } from './users.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Used by the "invite people" picker. Returns only id/name/email of active users. */
  async search(requesterId: string, q: string) {
    const term = (q ?? '').trim();
    if (term.length < 2) return [];
    return this.prisma.user.findMany({
      where: {
        isActive: true,
        id: { not: requesterId },
        OR: [{ name: { contains: term, mode: 'insensitive' } }, { email: { contains: term, mode: 'insensitive' } }],
      },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
      take: 10,
    });
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const data: { name?: string; passwordHash?: string } = {};
    if (dto.name) data.name = dto.name;
    if (dto.newPassword) {
      if (!dto.currentPassword) throw new BadRequestException('currentPassword is required to change the password');
      const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
      if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
        throw new UnauthorizedException('Current password is incorrect');
      }
      data.passwordHash = await bcrypt.hash(dto.newPassword, 12);
    }
    if (Object.keys(data).length === 0) throw new BadRequestException('Nothing to update');
    const updated = await this.prisma.user.update({ where: { id: userId }, data });
    await this.audit.log(userId, 'PROFILE_UPDATE', 'User', userId, { nameChanged: !!data.name, passwordChanged: !!data.passwordHash });
    return publicUser(updated);
  }
}
