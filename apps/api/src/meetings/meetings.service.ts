import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { MeetingStatus, ParticipantStatus } from '@prisma/client';
import { PrismaService } from '../core/prisma.service';
import { AuditService } from '../core/audit.service';
import { MeetingEvents } from '../core/meeting-events';
import { AuthUser } from '../common/auth.types';
import { CreateMeetingDto, UpdateMeetingDto } from './meetings.dto';

const ACTIVE: MeetingStatus[] = ['SCHEDULED', 'LIVE'];
const userBrief = { select: { id: true, name: true, email: true } } as const;

export type JoinState = 'ADMITTED' | 'WAITING';

/** Engagement indicator weights. Documented in docs/ARCHITECTURE.md. */
export function engagementScore(input: { attendanceRatio: number; messages: number; votes: number; pollsTotal: number }) {
  const parts: Array<{ weight: number; value: number }> = [
    { weight: 60, value: Math.min(1, Math.max(0, input.attendanceRatio)) },
    { weight: 20, value: Math.min(1, input.messages / 5) },
  ];
  if (input.pollsTotal > 0) parts.push({ weight: 20, value: Math.min(1, input.votes / input.pollsTotal) });
  const total = parts.reduce((s, p) => s + p.weight, 0);
  const score = Math.round((parts.reduce((s, p) => s + p.weight * p.value, 0) / total) * 100);
  const label = score >= 70 ? 'High' : score >= 40 ? 'Medium' : 'Low';
  return { score, label };
}

@Injectable()
export class MeetingsService implements OnModuleInit {
  private readonly logger = new Logger(MeetingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: MeetingEvents,
  ) {}

  async onModuleInit() {
    try {
      // After a crash/restart no sockets exist, so any open attendance sessions are stale.
      const r = await this.prisma.attendance.updateMany({ where: { leftAt: null }, data: { leftAt: new Date() } });
      if (r.count) this.logger.warn(`Closed ${r.count} stale attendance session(s) from a previous run`);
    } catch (err) {
      this.logger.warn(`Startup attendance cleanup skipped: ${(err as Error).message}`);
    }
  }

  // ---------- helpers ----------
  async requireManage(user: AuthUser, meetingId: string) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    if (meeting.hostId !== user.id && user.role !== 'ADMIN') throw new ForbiddenException('Only the host can do this');
    return meeting;
  }

  private validateTimes(start: Date, end: Date | null) {
    if (Number.isNaN(start.getTime())) throw new BadRequestException('Invalid start time');
    if (end && end <= start) throw new BadRequestException('End time must be after start time');
  }

  // ---------- CRUD ----------
  async create(user: AuthUser, dto: CreateMeetingDto) {
    if (user.role === 'PARTICIPANT') throw new ForbiddenException('Only hosts and administrators can create meetings');
    const start = new Date(dto.scheduledStart);
    const end = dto.scheduledEnd ? new Date(dto.scheduledEnd) : null;
    this.validateTimes(start, end);
    const meeting = await this.prisma.meeting.create({
      data: {
        title: dto.title,
        description: dto.description || null,
        hostId: user.id,
        scheduledStart: start,
        scheduledEnd: end,
        waitingRoomEnabled: dto.waitingRoomEnabled ?? true,
        moderationEnabled: dto.moderationEnabled ?? true,
      },
    });
    await this.audit.log(user.id, 'MEETING_CREATE', 'Meeting', meeting.id, { title: meeting.title });
    if (dto.inviteeIds?.length) await this.invite(user, meeting.id, dto.inviteeIds);
    return meeting;
  }

  async list(user: AuthUser, scope: 'upcoming' | 'past') {
    const statuses: MeetingStatus[] = scope === 'past' ? ['ENDED', 'CANCELLED'] : ACTIVE;
    const meetings = await this.prisma.meeting.findMany({
      where: {
        status: { in: statuses },
        OR: [{ hostId: user.id }, { invitations: { some: { inviteeId: user.id, status: { not: 'DECLINED' } } } }],
      },
      include: {
        host: { select: { id: true, name: true } },
        _count: { select: { invitations: true } },
        invitations: { where: { inviteeId: user.id }, select: { id: true, status: true } },
      },
      orderBy: { scheduledStart: scope === 'past' ? 'desc' : 'asc' },
      take: 100,
    });

    let attendedMs = new Map<string, number>();
    if (scope === 'past' && meetings.length) {
      const rows = await this.prisma.attendance.findMany({
        where: { userId: user.id, meetingId: { in: meetings.map((m) => m.id) } },
      });
      attendedMs = new Map();
      for (const r of rows) {
        const end = r.leftAt ?? new Date();
        attendedMs.set(r.meetingId, (attendedMs.get(r.meetingId) ?? 0) + (end.getTime() - r.joinedAt.getTime()));
      }
    }

    return meetings.map(({ invitations, ...m }) => ({
      ...m,
      isHost: m.hostId === user.id,
      myInvitationStatus: invitations[0]?.status ?? null,
      myAttendedSeconds: scope === 'past' ? Math.round((attendedMs.get(m.id) ?? 0) / 1000) : undefined,
    }));
  }

  async getForUser(user: AuthUser, id: string) {
    const m = await this.prisma.meeting.findUnique({
      where: { id },
      include: { host: userBrief, invitations: { include: { invitee: userBrief }, orderBy: { createdAt: 'asc' } } },
    });
    if (!m) throw new NotFoundException('Meeting not found');
    const isHost = m.hostId === user.id;
    const mine = m.invitations.find((i) => i.inviteeId === user.id);
    const isAdmin = user.role === 'ADMIN';
    if (!isHost && !mine && !isAdmin) throw new ForbiddenException('You do not have access to this meeting');
    const canSeeAll = isHost || isAdmin;
    return {
      ...m,
      access: isHost ? 'HOST' : mine ? 'INVITEE' : 'ADMIN',
      invitations: canSeeAll ? m.invitations : mine ? [mine] : [],
      myInvitationId: mine?.id ?? null,
      myInvitationStatus: mine?.status ?? null,
      canJoin: (isHost || (!!mine && mine.status !== 'DECLINED')) && ACTIVE.includes(m.status),
    };
  }

  async update(user: AuthUser, id: string, dto: UpdateMeetingDto) {
    const meeting = await this.requireManage(user, id);
    if (!ACTIVE.includes(meeting.status)) throw new BadRequestException('This meeting is no longer editable');
    const start = dto.scheduledStart ? new Date(dto.scheduledStart) : meeting.scheduledStart;
    const end = dto.scheduledEnd ? new Date(dto.scheduledEnd) : meeting.scheduledEnd;
    this.validateTimes(start, end);
    const updated = await this.prisma.meeting.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        scheduledStart: dto.scheduledStart ? start : undefined,
        scheduledEnd: dto.scheduledEnd ? end : undefined,
        waitingRoomEnabled: dto.waitingRoomEnabled,
        moderationEnabled: dto.moderationEnabled,
      },
    });
    await this.audit.log(user.id, 'MEETING_UPDATE', 'Meeting', id, { fields: Object.keys(dto) });
    return updated;
  }

  async endMeeting(user: AuthUser, id: string) {
    const meeting = await this.requireManage(user, id);
    if (meeting.status === 'ENDED' || meeting.status === 'CANCELLED') return meeting;
    const status: MeetingStatus = meeting.status === 'SCHEDULED' ? 'CANCELLED' : 'ENDED';
    const updated = await this.prisma.meeting.update({ where: { id }, data: { status, endedAt: new Date() } });
    await this.prisma.attendance.updateMany({ where: { meetingId: id, leftAt: null }, data: { leftAt: new Date() } });
    this.events.emit('meeting.ended', { meetingId: id });
    await this.audit.log(user.id, status === 'ENDED' ? 'MEETING_END' : 'MEETING_CANCEL', 'Meeting', id);
    return updated;
  }

  // ---------- invitations ----------
  async invite(user: AuthUser, meetingId: string, userIds: string[]) {
    const meeting = await this.requireManage(user, meetingId);
    if (!ACTIVE.includes(meeting.status)) throw new BadRequestException('Cannot invite to a finished meeting');
    const ids = [...new Set(userIds)].filter((id) => id !== meeting.hostId);
    const users = await this.prisma.user.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true } });
    let invited = 0;
    for (const u of users) {
      const existing = await this.prisma.invitation.findUnique({
        where: { meetingId_inviteeId: { meetingId, inviteeId: u.id } },
      });
      if (!existing) {
        await this.prisma.invitation.create({ data: { meetingId, inviteeId: u.id } });
      } else if (existing.status === 'DECLINED') {
        await this.prisma.invitation.update({ where: { id: existing.id }, data: { status: 'PENDING' } });
      } else {
        continue;
      }
      invited++;
      this.events.emit('invitation.created', { inviteeId: u.id, meetingId, title: meeting.title });
    }
    await this.audit.log(user.id, 'INVITE_SEND', 'Meeting', meetingId, { requested: ids.length, invited });
    return { invited, skipped: ids.length - invited };
  }

  async removeInvitation(user: AuthUser, meetingId: string, invitationId: string) {
    await this.requireManage(user, meetingId);
    const inv = await this.prisma.invitation.findFirst({ where: { id: invitationId, meetingId } });
    if (!inv) throw new NotFoundException('Invitation not found');
    await this.prisma.invitation.delete({ where: { id: inv.id } });
    await this.audit.log(user.id, 'INVITE_REVOKE', 'Invitation', inv.id, { meetingId });
    return { ok: true };
  }

  async myInvitations(user: AuthUser) {
    return this.prisma.invitation.findMany({
      where: { inviteeId: user.id, meeting: { status: { in: ACTIVE } } },
      include: { meeting: { include: { host: { select: { id: true, name: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async respond(user: AuthUser, invitationId: string, status: 'ACCEPTED' | 'DECLINED') {
    const inv = await this.prisma.invitation.findUnique({ where: { id: invitationId }, include: { meeting: true } });
    if (!inv || inv.inviteeId !== user.id) throw new NotFoundException('Invitation not found');
    if (!ACTIVE.includes(inv.meeting.status)) throw new BadRequestException('This meeting has finished');
    const updated = await this.prisma.invitation.update({ where: { id: inv.id }, data: { status } });
    await this.audit.log(user.id, status === 'ACCEPTED' ? 'INVITE_ACCEPT' : 'INVITE_DECLINE', 'Invitation', inv.id, {
      meetingId: inv.meetingId,
    });
    return updated;
  }

  // ---------- joining (called by the Socket.IO gateway; never trusts a bare meeting id) ----------
  async resolveJoin(user: AuthUser, meetingId: string) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    if (!ACTIVE.includes(meeting.status)) throw new BadRequestException('This meeting has ended');
    const isHost = meeting.hostId === user.id;

    if (!isHost) {
      const inv = await this.prisma.invitation.findUnique({
        where: { meetingId_inviteeId: { meetingId, inviteeId: user.id } },
      });
      if (!inv || inv.status === 'DECLINED') throw new ForbiddenException('You are not invited to this meeting');
      if (meeting.status !== 'LIVE') throw new BadRequestException('The host has not started this meeting yet');
      if (inv.status === 'PENDING') await this.prisma.invitation.update({ where: { id: inv.id }, data: { status: 'ACCEPTED' } });
    } else if (meeting.status === 'SCHEDULED') {
      await this.prisma.meeting.update({ where: { id: meetingId }, data: { status: 'LIVE', startedAt: new Date() } });
      await this.audit.log(user.id, 'MEETING_START', 'Meeting', meetingId);
    }

    const existing = await this.prisma.meetingParticipant.findUnique({
      where: { meetingId_userId: { meetingId, userId: user.id } },
    });
    if (existing && (existing.status === 'DENIED' || existing.status === 'REMOVED')) {
      throw new ForbiddenException('The host did not allow you to join this meeting');
    }

    let state: JoinState = 'WAITING';
    if (isHost || !meeting.waitingRoomEnabled || existing?.status === 'ADMITTED') state = 'ADMITTED';

    await this.prisma.meetingParticipant.upsert({
      where: { meetingId_userId: { meetingId, userId: user.id } },
      create: {
        meetingId,
        userId: user.id,
        status: state,
        admittedAt: state === 'ADMITTED' ? new Date() : null,
      },
      update: state === 'ADMITTED' && existing?.status !== 'ADMITTED' ? { status: 'ADMITTED', admittedAt: new Date() } : {},
    });
    return { meeting, isHost, state };
  }

  async setParticipantStatus(meetingId: string, userId: string, status: ParticipantStatus) {
    await this.prisma.meetingParticipant.update({
      where: { meetingId_userId: { meetingId, userId } },
      data: { status, admittedAt: status === 'ADMITTED' ? new Date() : undefined },
    });
  }

  async startAttendance(meetingId: string, userId: string) {
    const row = await this.prisma.attendance.create({ data: { meetingId, userId } });
    return row.id;
  }

  async endAttendance(attendanceId: string) {
    await this.prisma.attendance.updateMany({ where: { id: attendanceId, leftAt: null }, data: { leftAt: new Date() } });
  }

  // ---------- report ----------
  async report(user: AuthUser, meetingId: string) {
    const meeting = await this.requireManage(user, meetingId);
    const [attendance, messages, votes, pollsTotal] = await Promise.all([
      this.prisma.attendance.findMany({ where: { meetingId }, orderBy: { joinedAt: 'asc' } }),
      this.prisma.chatMessage.groupBy({ by: ['userId'], where: { meetingId }, _count: { _all: true } }),
      this.prisma.vote.groupBy({ by: ['userId'], where: { poll: { meetingId } }, _count: { _all: true } }),
      this.prisma.poll.count({ where: { meetingId } }),
    ]);
    const now = new Date();
    const meetingMs = meeting.startedAt ? Math.max(0, (meeting.endedAt ?? now).getTime() - meeting.startedAt.getTime()) : 0;
    const userIds = [...new Set(attendance.map((a) => a.userId))];
    const users = await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } });

    const rows = users.map((u) => {
      const sessions = attendance.filter((a) => a.userId === u.id);
      const ms = sessions.reduce((s, a) => s + ((a.leftAt ?? now).getTime() - a.joinedAt.getTime()), 0);
      const msgCount = messages.find((m) => m.userId === u.id)?._count._all ?? 0;
      const voteCount = votes.find((v) => v.userId === u.id)?._count._all ?? 0;
      const ratio = meetingMs > 0 ? ms / meetingMs : 0;
      return {
        user: u,
        firstJoinedAt: sessions[0].joinedAt,
        lastLeftAt: sessions.every((s) => s.leftAt) ? sessions[sessions.length - 1].leftAt : null,
        sessions: sessions.length,
        attendedSeconds: Math.round(ms / 1000),
        attendancePercent: Math.min(100, Math.round(ratio * 100)),
        messages: msgCount,
        votes: voteCount,
        engagement: engagementScore({ attendanceRatio: ratio, messages: msgCount, votes: voteCount, pollsTotal }),
      };
    });

    return {
      meeting: {
        id: meeting.id,
        title: meeting.title,
        status: meeting.status,
        startedAt: meeting.startedAt,
        endedAt: meeting.endedAt,
        durationSeconds: Math.round(meetingMs / 1000),
      },
      pollsTotal,
      totalMessages: messages.reduce((s, m) => s + m._count._all, 0),
      participants: rows,
      method:
        'Engagement = weighted participation indicator: 60% attendance time vs meeting duration, 20% chat messages (5 = full marks), 20% poll votes vs polls (only counted when polls exist). It does not measure attention or emotion.',
    };
  }
}
