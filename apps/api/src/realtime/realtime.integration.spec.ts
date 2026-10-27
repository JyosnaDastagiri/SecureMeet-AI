/**
 * End-to-end test of the Socket.IO gateway using REAL socket.io clients and an in-memory database stub.
 * Covers: authentication, invitation checks, waiting room + admission, chat + moderation, polls,
 * WebRTC signalling relay, host controls and meeting end. It does not exercise real SQL (Prisma + PostgreSQL),
 * and it does not test browser media; see docs/TESTING.md for the manual checks.
 */
import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { io, Socket } from 'socket.io-client';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://stub:stub@localhost:5432/stub';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.WEB_ORIGIN = 'http://localhost:3000';

jest.setTimeout(30_000);

let n = 0;
const nid = () => `id${++n}`;

function buildStub() {
  const db = {
    users: [
      { id: 'host', email: 'h@x.io', name: 'Host', role: 'HOST', isActive: true },
      { id: 'alice', email: 'a@x.io', name: 'Alice', role: 'PARTICIPANT', isActive: true },
      { id: 'eve', email: 'e@x.io', name: 'Eve', role: 'PARTICIPANT', isActive: true },
    ] as any[],
    meetings: [
      { id: 'm1', title: 'Standup', hostId: 'host', status: 'SCHEDULED', waitingRoomEnabled: true, moderationEnabled: true, startedAt: null, endedAt: null },
    ] as any[],
    invitations: [{ id: 'inv1', meetingId: 'm1', inviteeId: 'alice', status: 'PENDING' }] as any[],
    participants: [] as any[],
    attendances: [] as any[],
    messages: [] as any[],
    polls: [] as any[],
    votes: [] as any[],
    modEvents: [] as any[],
  };
  const userName = (id: string) => ({ name: db.users.find((u) => u.id === id)?.name });
  const pollView = (p: any) => ({ ...p, options: p.options.map((o: any) => ({ ...o, _count: { votes: db.votes.filter((v) => v.optionId === o.id).length } })) });
  const key = (w: any) => w.meetingId_userId ?? w.meetingId_inviteeId;

  const stub = {
    onModuleInit: async () => undefined,
    onModuleDestroy: async () => undefined,
    $queryRaw: async () => [1],
    auditLog: { create: async () => ({}) },
    user: { findUnique: async ({ where }: any) => db.users.find((u) => u.id === where.id || u.email === where.email) ?? null },
    meeting: {
      findUnique: async ({ where }: any) => db.meetings.find((m) => m.id === where.id) ?? null,
      update: async ({ where, data }: any) => Object.assign(db.meetings.find((m) => m.id === where.id), data),
    },
    invitation: {
      findUnique: async ({ where }: any) => db.invitations.find((i) => i.meetingId === key(where).meetingId && i.inviteeId === key(where).inviteeId) ?? null,
      update: async ({ where, data }: any) => Object.assign(db.invitations.find((i) => i.id === where.id), data),
    },
    meetingParticipant: {
      findUnique: async ({ where }: any) => db.participants.find((p) => p.meetingId === key(where).meetingId && p.userId === key(where).userId) ?? null,
      upsert: async ({ where, create, update }: any) => {
        const found = db.participants.find((p) => p.meetingId === key(where).meetingId && p.userId === key(where).userId);
        if (found) return Object.assign(found, update);
        const row = { id: nid(), ...create };
        db.participants.push(row);
        return row;
      },
      update: async ({ where, data }: any) => Object.assign(db.participants.find((p) => p.meetingId === key(where).meetingId && p.userId === key(where).userId), data),
    },
    attendance: {
      create: async ({ data }: any) => {
        const row = { id: nid(), joinedAt: new Date(), leftAt: null, ...data };
        db.attendances.push(row);
        return row;
      },
      updateMany: async ({ where, data }: any) => {
        const rows = db.attendances.filter((a) => (!where.id || a.id === where.id) && (!where.meetingId || a.meetingId === where.meetingId) && a.leftAt === null);
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      },
    },
    chatMessage: {
      create: async ({ data }: any) => {
        const row = { id: nid(), createdAt: new Date(), ...data };
        db.messages.push(row);
        return { ...row, user: userName(row.userId) };
      },
      findMany: async ({ where }: any) => db.messages.filter((m) => m.meetingId === where.meetingId).reverse().map((m) => ({ ...m, user: userName(m.userId) })),
    },
    poll: {
      create: async ({ data }: any) => {
        const poll = { id: nid(), isOpen: true, createdAt: new Date(), meetingId: data.meetingId, createdById: data.createdById, question: data.question, options: data.options.create.map((o: any) => ({ id: nid(), ...o })) };
        db.polls.push(poll);
        return pollView(poll);
      },
      findMany: async ({ where }: any) => db.polls.filter((p) => p.meetingId === where.meetingId).map(pollView),
      findUnique: async ({ where }: any) => {
        const p = db.polls.find((x) => x.id === where.id);
        return p ? pollView(p) : null;
      },
      update: async ({ where, data }: any) => Object.assign(db.polls.find((p) => p.id === where.id), data),
    },
    vote: {
      findMany: async ({ where }: any) => db.votes.filter((v) => v.userId === where.userId && db.polls.find((p) => p.id === v.pollId)?.meetingId === where.poll.meetingId),
      create: async ({ data }: any) => {
        if (db.votes.some((v) => v.pollId === data.pollId && v.userId === data.userId)) {
          throw new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' });
        }
        db.votes.push({ id: nid(), ...data });
        return data;
      },
    },
    moderationSetting: { upsert: async () => ({ id: 1, enabled: true, warnThreshold: 0.4, blockThreshold: 0.8, customTerms: [] }) },
    moderationEvent: {
      create: async ({ data }: any) => {
        db.modEvents.push(data);
        return data;
      },
    },
  };
  return { db, stub };
}

describe('Socket.IO gateway (in-memory database)', () => {
  let app: INestApplication;
  let url: string;
  let jwt: JwtService;
  const { db, stub } = buildStub();
  const sockets: Socket[] = [];

  beforeAll(async () => {
    const { AppModule } = await import('./../app.module');
    const { PrismaService } = await import('./../core/prisma.service');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(stub).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    url = (await app.getUrl()).replace('[::1]', 'localhost');
    jwt = app.get(JwtService);
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await app.close();
  });

  const connect = (userId: string) =>
    new Promise<Socket>((resolve, reject) => {
      const s = io(url, { auth: { token: jwt.sign({ sub: userId, role: 'x' }) }, transports: ['websocket'], reconnection: false });
      sockets.push(s);
      s.on('connect', () => resolve(s));
      s.on('connect_error', reject);
    });
  const ask = (s: Socket, event: string, payload?: unknown): Promise<any> =>
    new Promise((resolve) => (payload === undefined ? s.emit(event, (r: any) => resolve(r)) : s.emit(event, payload, (r: any) => resolve(r))));
  const once = <T = any>(s: Socket, event: string, ms = 4000) =>
    new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
      s.once(event, (d: T) => {
        clearTimeout(t);
        resolve(d);
      });
    });

  let host: Socket;
  let alice: Socket;
  let eve: Socket;

  it('rejects connections without a valid token', async () => {
    await expect(
      new Promise((resolve, reject) => {
        const s = io(url, { auth: { token: 'garbage' }, transports: ['websocket'], reconnection: false });
        sockets.push(s);
        s.on('connect', () => resolve('connected'));
        s.on('connect_error', (e) => reject(e));
      }),
    ).rejects.toThrow('unauthorized');
  });

  it('a non-invited user cannot join, even knowing the meeting id', async () => {
    eve = await connect('eve');
    const res = await ask(eve, 'room:join', { meetingId: 'm1' });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not invited/i);
  });

  it('an invitee cannot join before the host has started the meeting', async () => {
    alice = await connect('alice');
    const res = await ask(alice, 'room:join', { meetingId: 'm1' });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not started/i);
  });

  it('the host joins, the meeting goes LIVE and attendance starts', async () => {
    host = await connect('host');
    const res = await ask(host, 'room:join', { meetingId: 'm1' });
    expect(res.ok).toBe(true);
    expect(res.state).toBe('ADMITTED');
    expect(res.snapshot.isHost).toBe(true);
    expect(db.meetings[0].status).toBe('LIVE');
    expect(db.attendances.filter((a) => a.userId === 'host' && a.leftAt === null)).toHaveLength(1);
  });

  it('a duplicate join from the same socket does not create duplicate attendance', async () => {
    await ask(host, 'room:join', { meetingId: 'm1' });
    expect(db.attendances.filter((a) => a.userId === 'host')).toHaveLength(1);
  });

  it('the invitee waits in the waiting room until the host admits them', async () => {
    const waitingSeen = once<any[]>(host, 'waiting:update');
    const res = await ask(alice, 'room:join', { meetingId: 'm1' });
    expect(res.ok).toBe(true);
    expect(res.state).toBe('WAITING');
    expect(await waitingSeen).toEqual([{ userId: 'alice', name: 'Alice' }]);

    // waiting users cannot chat
    const early = await ask(alice, 'chat:send', { content: 'hi' });
    expect(early.ok).toBe(false);

    // non-host cannot admit
    const sneaky = await ask(alice, 'host:admit', { userId: 'alice' });
    expect(sneaky.ok).toBe(false);

    const admitted = once<any>(alice, 'admitted');
    const joined = once<any>(host, 'peer:joined');
    expect((await ask(host, 'host:admit', { userId: 'alice' })).ok).toBe(true);
    const snap = await admitted;
    expect(snap.peers.map((p: any) => p.userId)).toEqual(['host']);
    expect((await joined).userId).toBe('alice');
    expect(db.participants.find((p) => p.userId === 'alice').status).toBe('ADMITTED');
    expect(db.invitations[0].status).toBe('ACCEPTED');
  });

  it('delivers clean chat messages to everyone and persists them', async () => {
    const got = once<any>(host, 'chat:message');
    expect((await ask(alice, 'chat:send', { content: 'Good morning team' })).ok).toBe(true);
    expect((await got).content).toBe('Good morning team');
    expect(db.messages).toHaveLength(1);
  });

  it('validates chat payloads', async () => {
    expect((await ask(alice, 'chat:send', { content: '' })).ok).toBe(false);
    expect((await ask(alice, 'chat:send', { content: 'x'.repeat(1001) })).ok).toBe(false);
    expect((await ask(alice, 'chat:send', { nope: true })).ok).toBe(false);
  });

  it('moderation: abusive messages are blocked, the sender is warned and the host is alerted', async () => {
    const warning = once<any>(alice, 'moderation:warning');
    const alert = once<any>(host, 'moderation:alert');
    const res = await ask(alice, 'chat:send', { content: 'you stupid idiot, shit' });
    expect(res.ok).toBe(false);
    expect((await warning).action).toBe('BLOCK');
    const a = await alert;
    expect(a.name).toBe('Alice');
    expect(a.excerpt).not.toMatch(/idiot/);
    expect(db.messages).toHaveLength(1); // blocked message was NOT stored
    expect(db.modEvents).toHaveLength(1);
    expect(db.modEvents[0].excerpt).not.toMatch(/stupid|idiot|shit/);
  });

  it('moderation: a mild message is delivered but flagged', async () => {
    const got = once<any>(host, 'chat:message');
    const res = await ask(alice, 'chat:send', { content: 'that was stupid' });
    expect(res.ok).toBe(true);
    expect((await got).flagged).toBe(true);
  });

  it('polls: only the host creates; one vote per person; counts update live', async () => {
    expect((await ask(alice, 'poll:create', { question: 'Lunch?', options: ['Pizza', 'Salad'] })).ok).toBe(false);
    const created = once<any>(alice, 'poll:created');
    expect((await ask(host, 'poll:create', { question: 'Lunch?', options: ['Pizza', 'Salad'] })).ok).toBe(true);
    const poll = await created;
    expect(poll.options).toHaveLength(2);

    const updated = once<any>(host, 'poll:updated');
    const v1 = await ask(alice, 'poll:vote', { pollId: poll.id, optionId: poll.options[0].id });
    expect(v1.ok).toBe(true);
    expect((await updated).totalVotes).toBe(1);

    const v2 = await ask(alice, 'poll:vote', { pollId: poll.id, optionId: poll.options[1].id });
    expect(v2.ok).toBe(false);
    expect(v2.error).toMatch(/already voted/i);

    expect((await ask(host, 'poll:close', { pollId: poll.id })).ok).toBe(true);
    const v3 = await ask(host, 'poll:vote', { pollId: poll.id, optionId: poll.options[0].id });
    expect(v3.ok).toBe(false);
  });

  it('relays WebRTC signalling only between admitted members', async () => {
    const got = once<any>(host, 'rtc:signal');
    expect((await ask(alice, 'rtc:signal', { to: 'host', data: { type: 'offer', sdp: 'v=0...' } })).ok).toBe(true);
    const msg = await got;
    expect(msg.from).toBe('alice');
    expect(msg.data.type).toBe('offer');
    expect((await ask(alice, 'rtc:signal', { to: 'eve', data: { type: 'offer', sdp: 'x' } })).ok).toBe(false);
    expect((await ask(eve, 'rtc:signal', { to: 'host', data: { type: 'offer', sdp: 'x' } })).ok).toBe(false);
  });

  it('broadcasts media state changes', async () => {
    const got = once<any>(host, 'media:state');
    await ask(alice, 'media:state', { audio: true, video: false, screen: false });
    expect(await got).toMatchObject({ userId: 'alice', audio: true });
  });

  it('host can ask a participant to mute, remove them, and removed users cannot rejoin', async () => {
    const mute = once(alice, 'host:mute-request');
    expect((await ask(host, 'host:mute', { userId: 'alice' })).ok).toBe(true);
    await mute;
    expect((await ask(alice, 'host:remove', { userId: 'host' })).ok).toBe(false);

    const removed = once(alice, 'removed');
    const left = once<any>(host, 'peer:left');
    expect((await ask(host, 'host:remove', { userId: 'alice' })).ok).toBe(true);
    await removed;
    expect((await left).userId).toBe('alice');
    expect(db.attendances.filter((a) => a.userId === 'alice' && a.leftAt === null)).toHaveLength(0);

    const retry = await ask(alice, 'room:join', { meetingId: 'm1' });
    expect(retry.ok).toBe(false);
  });

  it('the host ends the meeting: attendance is closed and the status becomes ENDED', async () => {
    const ended = once(host, 'meeting:ended');
    expect((await ask(host, 'host:end')).ok).toBe(true);
    await ended;
    expect(db.meetings[0].status).toBe('ENDED');
    expect(db.attendances.every((a) => a.leftAt !== null)).toBe(true);
    const late = await ask(host, 'room:join', { meetingId: 'm1' });
    expect(late.ok).toBe(false);
  });
});
