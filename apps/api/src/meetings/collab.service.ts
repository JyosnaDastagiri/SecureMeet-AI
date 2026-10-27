import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../core/prisma.service';
import { AuditService } from '../core/audit.service';
import { AuthUser } from '../common/auth.types';

export interface PollView {
  id: string;
  meetingId: string;
  question: string;
  isOpen: boolean;
  createdAt: Date;
  totalVotes: number;
  options: Array<{ id: string; text: string; votes: number }>;
  myVoteOptionId?: string | null;
}

@Injectable()
export class CollabService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** REST read access: host, admin, or someone who has been admitted to this meeting. */
  async assertCanRead(user: AuthUser, meetingId: string) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId }, select: { hostId: true } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    if (meeting.hostId === user.id || user.role === 'ADMIN') return;
    const p = await this.prisma.meetingParticipant.findUnique({ where: { meetingId_userId: { meetingId, userId: user.id } } });
    if (!p || p.status !== 'ADMITTED') throw new ForbiddenException('You were not admitted to this meeting');
  }

  async saveMessage(meetingId: string, userId: string, content: string, flagged: boolean) {
    return this.prisma.chatMessage.create({
      data: { meetingId, userId, content, flagged },
      include: { user: { select: { name: true } } },
    });
  }

  async recentMessages(meetingId: string, take = 100) {
    const rows = await this.prisma.chatMessage.findMany({
      where: { meetingId },
      orderBy: { createdAt: 'desc' },
      take,
      include: { user: { select: { name: true } } },
    });
    return rows.reverse().map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.user.name,
      content: m.content,
      flagged: m.flagged,
      createdAt: m.createdAt,
    }));
  }

  private toView(
    poll: { id: string; meetingId: string; question: string; isOpen: boolean; createdAt: Date; options: Array<{ id: string; text: string; _count: { votes: number } }> },
    myVoteOptionId?: string | null,
  ): PollView {
    const options = poll.options.map((o) => ({ id: o.id, text: o.text, votes: o._count.votes }));
    return {
      id: poll.id,
      meetingId: poll.meetingId,
      question: poll.question,
      isOpen: poll.isOpen,
      createdAt: poll.createdAt,
      totalVotes: options.reduce((s, o) => s + o.votes, 0),
      options,
      myVoteOptionId,
    };
  }

  private readonly pollInclude = {
    options: { orderBy: { order: 'asc' as const }, include: { _count: { select: { votes: true } } } },
  };

  async listPolls(meetingId: string, userId: string): Promise<PollView[]> {
    const polls = await this.prisma.poll.findMany({
      where: { meetingId },
      orderBy: { createdAt: 'asc' },
      include: this.pollInclude,
    });
    const mine = await this.prisma.vote.findMany({ where: { userId, poll: { meetingId } } });
    return polls.map((p) => this.toView(p, mine.find((v) => v.pollId === p.id)?.optionId ?? null));
  }

  async getPollView(pollId: string): Promise<PollView> {
    const poll = await this.prisma.poll.findUnique({ where: { id: pollId }, include: this.pollInclude });
    if (!poll) throw new NotFoundException('Poll not found');
    return this.toView(poll);
  }

  async createPoll(host: AuthUser, meetingId: string, question: string, options: string[]) {
    const poll = await this.prisma.poll.create({
      data: {
        meetingId,
        createdById: host.id,
        question,
        options: { create: options.map((text, order) => ({ text, order })) },
      },
      include: this.pollInclude,
    });
    await this.audit.log(host.id, 'POLL_CREATE', 'Poll', poll.id, { meetingId });
    return this.toView(poll);
  }

  async vote(userId: string, meetingId: string, pollId: string, optionId: string) {
    const poll = await this.prisma.poll.findUnique({ where: { id: pollId }, include: { options: { select: { id: true } } } });
    if (!poll || poll.meetingId !== meetingId) throw new NotFoundException('Poll not found');
    if (!poll.isOpen) throw new BadRequestException('This poll is closed');
    if (!poll.options.some((o) => o.id === optionId)) throw new BadRequestException('Invalid option');
    try {
      await this.prisma.vote.create({ data: { pollId, optionId, userId } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException('You have already voted in this poll');
      }
      throw err;
    }
    return this.getPollView(pollId);
  }

  async closePoll(host: AuthUser, meetingId: string, pollId: string) {
    const poll = await this.prisma.poll.findUnique({ where: { id: pollId } });
    if (!poll || poll.meetingId !== meetingId) throw new NotFoundException('Poll not found');
    await this.prisma.poll.update({ where: { id: pollId }, data: { isOpen: false } });
    await this.audit.log(host.id, 'POLL_CLOSE', 'Poll', pollId, { meetingId });
    return this.getPollView(pollId);
  }
}
