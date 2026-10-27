import { HttpException, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { allowedOrigins } from '../config/env';
import { AuthUser } from '../common/auth.types';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { MeetingEvents } from '../core/meeting-events';
import { MeetingsService } from '../meetings/meetings.service';
import { CollabService } from '../meetings/collab.service';
import { ModerationService } from '../moderation/moderation.service';

// ---------- payload schemas (every client event is validated) ----------
const idSchema = z.string().min(1).max(64);
const joinSchema = z.object({ meetingId: idSchema });
const chatSchema = z.object({ content: z.string().trim().min(1).max(1000) });
const REACTIONS = ['👍', '👏', '❤️', '😂', '🎉', '😮'] as const;
const reactionSchema = z.object({ emoji: z.enum(REACTIONS) });
const pollCreateSchema = z.object({
  question: z.string().trim().min(3).max(200),
  options: z.array(z.string().trim().min(1).max(100)).min(2).max(6),
});
const voteSchema = z.object({ pollId: idSchema, optionId: idSchema });
const pollCloseSchema = z.object({ pollId: idSchema });
const userTargetSchema = z.object({ userId: idSchema });
const mediaSchema = z.object({ audio: z.boolean(), video: z.boolean(), screen: z.boolean() });
const signalSchema = z.object({
  to: idSchema,
  data: z.object({
    type: z.enum(['offer', 'answer', 'candidate']),
    sdp: z.string().max(30000).optional(),
    candidate: z.record(z.unknown()).optional(),
  }),
});

// ---------- in-memory room state (single API instance; see docs/ARCHITECTURE.md) ----------
interface MediaState {
  audio: boolean;
  video: boolean;
  screen: boolean;
}
interface Peer {
  userId: string;
  name: string;
  socketId: string;
  status: 'WAITING' | 'ADMITTED';
  isHost: boolean;
  attendanceId?: string;
  media: MediaState;
}
interface Room {
  meetingId: string;
  hostId: string;
  title: string;
  moderationEnabled: boolean;
  peers: Map<string, Peer>;
}

class WsError extends Error {}

const publicPeer = (p: Peer) => ({ userId: p.userId, name: p.name, isHost: p.isHost, media: p.media });

@WebSocketGateway({
  cors: {
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) =>
      cb(null, !origin || allowedOrigins().includes(origin)),
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly rooms = new Map<string, Room>();
  private readonly rateBuckets = new Map<string, number[]>();

  private readonly onEnded = ({ meetingId }: { meetingId: string }) => this.closeRoom(meetingId);
  private readonly onInvited = (p: { inviteeId: string; meetingId: string; title: string }) =>
    this.server?.to(`u:${p.inviteeId}`).emit('invitation:new', { meetingId: p.meetingId, title: p.title });

  constructor(
    private readonly auth: JwtAuthGuard,
    private readonly meetings: MeetingsService,
    private readonly collab: CollabService,
    private readonly moderation: ModerationService,
    private readonly events: MeetingEvents,
  ) {
    this.events.on('meeting.ended', this.onEnded);
    this.events.on('invitation.created', this.onInvited);
  }

  onModuleDestroy() {
    this.events.off('meeting.ended', this.onEnded);
    this.events.off('invitation.created', this.onInvited);
  }

  // ---------- connection lifecycle ----------
  afterInit(server: Server) {
    // Authenticate BEFORE the connection is established, so no event can arrive unauthenticated.
    server.use(async (socket, next) => {
      const token = socket.handshake.auth?.token;
      if (typeof token !== 'string' || token.length === 0) return next(new Error('unauthorized'));
      try {
        socket.data.user = await this.auth.verifyToken(token);
        next();
      } catch {
        next(new Error('unauthorized'));
      }
    });
  }

  handleConnection(client: Socket) {
    const user = client.data.user as AuthUser;
    client.join(`u:${user.id}`);
    this.logger.log(JSON.stringify({ event: 'socket.connect', user: user.id }));
  }

  async handleDisconnect(client: Socket) {
    const user = client.data.user as AuthUser | undefined;
    const meetingId = client.data.meetingId as string | undefined;
    if (user && meetingId) await this.removePeer(meetingId, user.id, client.id);
    this.logger.log(JSON.stringify({ event: 'socket.disconnect', user: user?.id }));
  }

  // ---------- helpers ----------
  private async run(fn: () => Promise<unknown>): Promise<any> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof z.ZodError) return { ok: false, error: `Invalid request: ${err.issues[0]?.message ?? 'bad payload'}` };
      if (err instanceof WsError) return { ok: false, error: err.message };
      if (err instanceof HttpException) {
        const body: any = err.getResponse();
        const msg = typeof body === 'string' ? body : Array.isArray(body.message) ? body.message[0] : body.message;
        return { ok: false, error: msg ?? err.message };
      }
      this.logger.error((err as Error).stack ?? String(err));
      return { ok: false, error: 'Something went wrong' };
    }
  }

  private rateLimit(userId: string, kind: string, max: number, windowMs: number) {
    const key = `${userId}:${kind}`;
    const now = Date.now();
    const hits = (this.rateBuckets.get(key) ?? []).filter((t) => now - t < windowMs);
    if (hits.length >= max) throw new WsError('You are sending too fast. Please slow down.');
    hits.push(now);
    this.rateBuckets.set(key, hits);
  }

  private context(client: Socket, opts: { host?: boolean } = {}) {
    const user = client.data.user as AuthUser;
    const meetingId = client.data.meetingId as string | undefined;
    const room = meetingId ? this.rooms.get(meetingId) : undefined;
    const peer = room?.peers.get(user.id);
    if (!room || !peer || peer.socketId !== client.id || peer.status !== 'ADMITTED') {
      throw new WsError('You are not in this meeting');
    }
    if (opts.host && !peer.isHost) throw new WsError('Only the host can do this');
    return { user, room, peer };
  }

  private socketOf(peer: Peer) {
    return this.server.sockets.sockets.get(peer.socketId);
  }

  private waitingList(room: Room) {
    return [...room.peers.values()].filter((p) => p.status === 'WAITING').map((p) => ({ userId: p.userId, name: p.name }));
  }

  private emitWaiting(room: Room) {
    this.server.to(`h:${room.meetingId}`).emit('waiting:update', this.waitingList(room));
  }

  private async snapshot(room: Room, userId: string) {
    const [messages, polls] = await Promise.all([
      this.collab.recentMessages(room.meetingId),
      this.collab.listPolls(room.meetingId, userId),
    ]);
    const isHost = room.hostId === userId;
    return {
      meeting: { id: room.meetingId, title: room.title, hostId: room.hostId, moderationEnabled: room.moderationEnabled },
      selfId: userId,
      isHost,
      peers: [...room.peers.values()].filter((p) => p.status === 'ADMITTED' && p.userId !== userId).map(publicPeer),
      messages,
      polls,
      waiting: isHost ? this.waitingList(room) : [],
    };
  }

  private async admit(room: Room, peer: Peer, socket: Socket) {
    peer.status = 'ADMITTED';
    peer.attendanceId = await this.meetings.startAttendance(room.meetingId, peer.userId);
    socket.join(`m:${room.meetingId}`);
    if (peer.isHost) socket.join(`h:${room.meetingId}`);
    socket.to(`m:${room.meetingId}`).emit('peer:joined', publicPeer(peer));
    this.emitWaiting(room);
  }

  private async removePeer(meetingId: string, userId: string, onlyIfSocketId?: string) {
    const room = this.rooms.get(meetingId);
    const peer = room?.peers.get(userId);
    if (!room || !peer) return;
    if (onlyIfSocketId && peer.socketId !== onlyIfSocketId) return;
    room.peers.delete(userId);
    if (peer.attendanceId) {
      await this.meetings.endAttendance(peer.attendanceId).catch((e) => this.logger.error(`endAttendance failed: ${e.message}`));
    }
    const sock = this.socketOf(peer);
    if (sock) {
      sock.leave(`m:${meetingId}`);
      sock.leave(`h:${meetingId}`);
      sock.data.meetingId = undefined;
    }
    if (peer.status === 'ADMITTED') this.server.to(`m:${meetingId}`).emit('peer:left', { userId });
    else this.emitWaiting(room);
    if (room.peers.size === 0) this.rooms.delete(meetingId);
  }

  private closeRoom(meetingId: string) {
    const room = this.rooms.get(meetingId);
    if (!room) return;
    for (const peer of room.peers.values()) {
      const sock = this.socketOf(peer);
      sock?.emit('meeting:ended', { meetingId });
      sock?.leave(`m:${meetingId}`);
      sock?.leave(`h:${meetingId}`);
      if (sock) sock.data.meetingId = undefined;
    }
    this.rooms.delete(meetingId);
  }

  // ---------- events: joining ----------
  @SubscribeMessage('room:join')
  join(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    return this.run(async () => {
      const { meetingId } = joinSchema.parse(body);
      const user = client.data.user as AuthUser;

      if (client.data.meetingId && client.data.meetingId !== meetingId) {
        await this.removePeer(client.data.meetingId, user.id, client.id);
      }

      const { meeting, isHost, state } = await this.meetings.resolveJoin(user, meetingId);
      const getRoom = (): Room => {
        let r = this.rooms.get(meetingId);
        if (!r) {
          r = { meetingId, hostId: meeting.hostId, title: meeting.title, moderationEnabled: meeting.moderationEnabled, peers: new Map() };
          this.rooms.set(meetingId, r);
        }
        r.title = meeting.title;
        r.moderationEnabled = meeting.moderationEnabled;
        return r;
      };

      let room = getRoom();
      const existing = room.peers.get(user.id);
      if (existing && existing.socketId === client.id) {
        // Duplicate join call from the same socket: idempotent, no duplicate peer/attendance.
        return existing.status === 'ADMITTED'
          ? { ok: true, state: 'ADMITTED', snapshot: await this.snapshot(room, user.id) }
          : { ok: true, state: 'WAITING' };
      }
      if (existing) {
        // The same user joined from another tab/device: keep only the newest session.
        this.socketOf(existing)?.emit('session:replaced');
        await this.removePeer(meetingId, user.id);
        room = getRoom();
      }

      const peer: Peer = {
        userId: user.id,
        name: user.name,
        socketId: client.id,
        status: 'WAITING',
        isHost,
        media: { audio: false, video: false, screen: false },
      };
      room.peers.set(user.id, peer);
      client.data.meetingId = meetingId;

      if (state === 'ADMITTED') {
        await this.admit(room, peer, client);
        return { ok: true, state: 'ADMITTED', snapshot: await this.snapshot(room, user.id) };
      }
      this.emitWaiting(room);
      return { ok: true, state: 'WAITING' };
    });
  }

  @SubscribeMessage('room:leave')
  leave(@ConnectedSocket() client: Socket) {
    return this.run(async () => {
      const user = client.data.user as AuthUser;
      const meetingId = client.data.meetingId as string | undefined;
      if (meetingId) await this.removePeer(meetingId, user.id, client.id);
      return { ok: true };
    });
  }

  // ---------- events: chat, reactions ----------
  @SubscribeMessage('chat:send')
  chat(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    return this.run(async () => {
      const { content } = chatSchema.parse(body);
      const { user, room } = this.context(client);
      this.rateLimit(user.id, 'chat', 8, 10_000);

      let flagged = false;
      if (room.moderationEnabled) {
        const result = await this.moderation.evaluate(content);
        if (result.action !== 'NONE') {
          await this.moderation.record(room.meetingId, user.id, result);
          client.emit('moderation:warning', {
            action: result.action,
            categories: result.categories,
            message:
              result.action === 'BLOCK'
                ? 'Your message was blocked because it appears to contain abusive language.'
                : 'Please keep the conversation respectful. Your message was flagged for the host.',
          });
          this.server.to(`h:${room.meetingId}`).emit('moderation:alert', {
            userId: user.id,
            name: user.name,
            action: result.action,
            severity: result.severity,
            categories: result.categories,
            excerpt: result.maskedExcerpt,
            at: new Date().toISOString(),
          });
          if (result.action === 'BLOCK') return { ok: false, error: 'Message blocked by moderation' };
          flagged = true;
        }
      }

      const saved = await this.collab.saveMessage(room.meetingId, user.id, content, flagged);
      this.server.to(`m:${room.meetingId}`).emit('chat:message', {
        id: saved.id,
        userId: user.id,
        name: saved.user.name,
        content: saved.content,
        flagged: saved.flagged,
        createdAt: saved.createdAt,
      });
      return { ok: true };
    });
  }

  @SubscribeMessage('reaction:send')
  reaction(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    return this.run(async () => {
      const { emoji } = reactionSchema.parse(body);
      const { user, room } = this.context(client);
      this.rateLimit(user.id, 'reaction', 10, 10_000);
      this.server.to(`m:${room.meetingId}`).emit('reaction', { userId: user.id, name: user.name, emoji });
      return { ok: true };
    });
  }

  // ---------- events: polls ----------
  @SubscribeMessage('poll:create')
  pollCreate(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    return this.run(async () => {
      const input = pollCreateSchema.parse(body);
      const { user, room } = this.context(client, { host: true });
      const poll = await this.collab.createPoll(user, room.meetingId, input.question, input.options);
      this.server.to(`m:${room.meetingId}`).emit('poll:created', poll);
      return { ok: true };
    });
  }

  @SubscribeMessage('poll:vote')
  pollVote(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    return this.run(async () => {
      const { pollId, optionId } = voteSchema.parse(body);
      const { user, room } = this.context(client);
      const poll = await this.collab.vote(user.id, room.meetingId, pollId, optionId);
      this.server.to(`m:${room.meetingId}`).emit('poll:updated', poll);
      return { ok: true, myVoteOptionId: optionId };
    });
  }

  @SubscribeMessage('poll:close')
  pollClose(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    return this.run(async () => {
      const { pollId } = pollCloseSchema.parse(body);
      const { user, room } = this.context(client, { host: true });
      const poll = await this.collab.closePoll(user, room.meetingId, pollId);
      this.server.to(`m:${room.meetingId}`).emit('poll:updated', poll);
      return { ok: true };
    });
  }

  // ---------- events: host controls ----------
  @SubscribeMessage('host:admit')
  hostAdmit(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    return this.run(async () => {
      const { userId } = userTargetSchema.parse(body);
      const { user, room } = this.context(client, { host: true });
      const target = room.peers.get(userId);
      if (!target || target.status !== 'WAITING') throw new WsError('That person is not in the waiting room');
      const sock = this.socketOf(target);
      if (!sock) {
        await this.removePeer(room.meetingId, userId);
        throw new WsError('That person is no longer connected');
      }
      await this.meetings.setParticipantStatus(room.meetingId, userId, 'ADMITTED');
      await this.admit(room, target, sock);
      sock.emit('admitted', await this.snapshot(room, userId));
      this.logger.log(JSON.stringify({ event: 'host.admit', host: user.id, target: userId }));
      return { ok: true };
    });
  }

  @SubscribeMessage('host:deny')
  hostDeny(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    return this.run(async () => {
      const { userId } = userTargetSchema.parse(body);
      const { room } = this.context(client, { host: true });
      const target = room.peers.get(userId);
      if (!target || target.status !== 'WAITING') throw new WsError('That person is not in the waiting room');
      await this.meetings.setParticipantStatus(room.meetingId, userId, 'DENIED');
      const sock = this.socketOf(target);
      sock?.emit('denied');
      room.peers.delete(userId);
      if (sock) sock.data.meetingId = undefined;
      this.emitWaiting(room);
      return { ok: true };
    });
  }

  @SubscribeMessage('host:remove')
  hostRemove(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    return this.run(async () => {
      const { userId } = userTargetSchema.parse(body);
      const { user, room } = this.context(client, { host: true });
      if (userId === user.id) throw new WsError('You cannot remove yourself');
      const target = room.peers.get(userId);
      if (!target) throw new WsError('That person is not in the meeting');
      await this.meetings.setParticipantStatus(room.meetingId, userId, 'REMOVED');
      this.socketOf(target)?.emit('removed');
      await this.removePeer(room.meetingId, userId);
      return { ok: true };
    });
  }

  @SubscribeMessage('host:mute')
  hostMute(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    return this.run(async () => {
      const { userId } = userTargetSchema.parse(body);
      const { room } = this.context(client, { host: true });
      const target = room.peers.get(userId);
      if (!target || target.status !== 'ADMITTED') throw new WsError('That person is not in the meeting');
      this.socketOf(target)?.emit('host:mute-request');
      return { ok: true };
    });
  }

  @SubscribeMessage('host:mute-all')
  hostMuteAll(@ConnectedSocket() client: Socket) {
    return this.run(async () => {
      const { peer, room } = this.context(client, { host: true });
      client.to(`m:${room.meetingId}`).emit('host:mute-request');
      return { ok: true, host: peer.userId };
    });
  }

  @SubscribeMessage('host:end')
  hostEnd(@ConnectedSocket() client: Socket) {
    return this.run(async () => {
      const { user, room } = this.context(client, { host: true });
      await this.meetings.endMeeting(user, room.meetingId); // emits meeting.ended -> closeRoom
      return { ok: true };
    });
  }

  // ---------- events: media state + WebRTC signalling (mesh) ----------
  @SubscribeMessage('media:state')
  mediaState(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    return this.run(async () => {
      const media = mediaSchema.parse(body);
      const { peer, room } = this.context(client);
      peer.media = media;
      client.to(`m:${room.meetingId}`).emit('media:state', { userId: peer.userId, ...media });
      return { ok: true };
    });
  }

  @SubscribeMessage('rtc:signal')
  signal(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    return this.run(async () => {
      const { to, data } = signalSchema.parse(body);
      const { user, room } = this.context(client);
      this.rateLimit(user.id, 'signal', 400, 10_000);
      const target = room.peers.get(to);
      if (!target || target.status !== 'ADMITTED' || to === user.id) throw new WsError('Peer not available');
      this.socketOf(target)?.emit('rtc:signal', { from: user.id, data });
      return { ok: true };
    });
  }
}
