import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../core/prisma.service';
import { AuditService } from '../core/audit.service';
import { MeetingsService } from '../meetings/meetings.service';
import { ModerationService } from '../moderation/moderation.service';
import { AuthUser } from '../common/auth.types';
import { AdminUpdateUserDto, UpdateModerationDto } from './admin.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly meetings: MeetingsService,
    private readonly moderation: ModerationService,
  ) {}

  async stats() {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const [users, byRole, meetingsByStatus, messages, moderationEvents, recentMeetings, attendanceRows] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
      this.prisma.meeting.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.chatMessage.count(),
      this.prisma.moderationEvent.count(),
      this.prisma.meeting.count({ where: { createdAt: { gte: since } } }),
      this.prisma.attendance.findMany({ where: { leftAt: { not: null } }, select: { joinedAt: true, leftAt: true }, take: 5000 }),
    ]);
    const totalMs = attendanceRows.reduce((s, a) => s + (a.leftAt!.getTime() - a.joinedAt.getTime()), 0);
    return {
      users,
      usersByRole: Object.fromEntries(byRole.map((r) => [r.role, r._count._all])),
      meetingsByStatus: Object.fromEntries(meetingsByStatus.map((r) => [r.status, r._count._all])),
      meetingsCreatedLast7Days: recentMeetings,
      totalChatMessages: messages,
      moderationEvents,
      totalAttendanceMinutes: Math.round(totalMs / 60000),
    };
  }

  listUsers() {
    return this.prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true, _count: { select: { hostedMeetings: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  async updateUser(admin: AuthUser, id: string, dto: AdminUpdateUserDto) {
    if (id === admin.id) throw new BadRequestException('You cannot change your own role or active status');
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('User not found');
    const updated = await this.prisma.user.update({
      where: { id },
      data: { role: dto.role, isActive: dto.isActive },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });
    await this.audit.log(admin.id, 'ADMIN_USER_UPDATE', 'User', id, { ...dto });
    return updated;
  }

  listMeetings() {
    return this.prisma.meeting.findMany({
      include: { host: { select: { id: true, name: true } }, _count: { select: { invitations: true, chatMessages: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  auditLogs(limit = 100, action?: string) {
    return this.prisma.auditLog.findMany({
      where: action ? { action } : undefined,
      include: { actor: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 300),
    });
  }

  moderationSettings() {
    return this.moderation.getSettings();
  }

  updateModeration(admin: AuthUser, dto: UpdateModerationDto) {
    return this.moderation.updateSettings(admin.id, dto);
  }

  moderationEvents() {
    return this.prisma.moderationEvent.findMany({
      include: { user: { select: { id: true, name: true } }, meeting: { select: { id: true, title: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  endMeeting(admin: AuthUser, id: string) {
    return this.meetings.endMeeting(admin, id);
  }
}
