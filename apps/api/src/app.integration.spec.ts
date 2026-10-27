/**
 * Boots the full Nest application (all modules, guards, pipes, gateway) with the database replaced by
 * an in-memory stub. It verifies wiring, validation, authentication and role checks WITHOUT PostgreSQL.
 * It does NOT test real SQL/Prisma behaviour - that must be verified against a real database (see docs).
 */
import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://stub:stub@localhost:5432/stub';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.WEB_ORIGIN = 'http://localhost:3000';

type StubUser = { id: string; email: string; name: string; role: string; passwordHash: string; isActive: boolean; createdAt: Date };

describe('API wiring (stubbed database)', () => {
  let app: INestApplication;
  let base: string;
  const users: StubUser[] = [];

  beforeAll(async () => {
    const { AppModule } = await import('./app.module');
    const { PrismaService } = await import('./core/prisma.service');
    const { AllExceptionsFilter } = await import('./common/http-exception.filter');

    const stub = {
      onModuleInit: async () => undefined,
      onModuleDestroy: async () => undefined,
      $queryRaw: async () => [{ '?column?': 1 }],
      attendance: { updateMany: async () => ({ count: 0 }) },
      auditLog: { create: async () => ({}) },
      user: {
        findUnique: async ({ where }: any) => users.find((u) => u.id === where.id || u.email === where.email) ?? null,
        findUniqueOrThrow: async ({ where }: any) => users.find((u) => u.id === where.id)!,
        create: async ({ data }: any) => {
          const u = { id: `u${users.length + 1}`, isActive: true, createdAt: new Date(), ...data } as StubUser;
          users.push(u);
          return u;
        },
      },
    };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(stub)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0);
    base = (await app.getUrl()).replace('[::1]', 'localhost');
  });

  afterAll(async () => {
    await app?.close();
  });

  const call = async (path: string, init?: RequestInit): Promise<{ status: number; body: any }> => {
    const res = await fetch(`${base}/api${path}`, init);
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  const json = (method: string, body: unknown, token?: string): RequestInit => ({
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

  it('health endpoint reports database up', async () => {
    const r = await call('/health');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('ok');
  });

  it('protected routes reject missing tokens', async () => {
    expect((await call('/meetings')).status).toBe(401);
    expect((await call('/admin/stats')).status).toBe(401);
  });

  it('rejects invalid registration input', async () => {
    const r = await call('/auth/register', json('POST', { email: 'nope', name: 'A', password: 'short' }));
    expect(r.status).toBe(400);
  });

  it('rejects unknown fields (mass assignment such as role=ADMIN)', async () => {
    const r = await call('/auth/register', json('POST', { email: 'x@example.com', name: 'Xavier', password: 'Passw0rdOK', role: 'ADMIN' }));
    expect(r.status).toBe(400);
  });

  it('registers, hashes the password, issues a JWT and authorises /auth/me', async () => {
    const reg = await call('/auth/register', json('POST', { email: 'Alice@Example.com', name: 'Alice', password: 'Passw0rdOK' }));
    expect(reg.status).toBe(201);
    expect(reg.body.token).toBeTruthy();
    expect(reg.body.user.email).toBe('alice@example.com');
    expect(reg.body.user.passwordHash).toBeUndefined();
    expect(users[0].passwordHash).not.toContain('Passw0rdOK');
    expect(users[0].passwordHash.startsWith('$2')).toBe(true);

    const me = await call('/auth/me', { headers: { Authorization: `Bearer ${reg.body.token}` } });
    expect(me.status).toBe(200);
    expect(me.body.name).toBe('Alice');

    const login = await call('/auth/login', json('POST', { email: 'alice@example.com', password: 'Passw0rdOK' }));
    expect(login.status).toBe(200);
    const bad = await call('/auth/login', json('POST', { email: 'alice@example.com', password: 'WrongPass1' }));
    expect(bad.status).toBe(401);
  });

  it('enforces role-based access: a participant cannot use admin routes or create meetings', async () => {
    const login = await call('/auth/login', json('POST', { email: 'alice@example.com', password: 'Passw0rdOK' }));
    const token = login.body.token;
    expect((await call('/admin/stats', { headers: { Authorization: `Bearer ${token}` } })).status).toBe(403);
    const create = await call('/meetings', json('POST', { title: 'My meeting', scheduledStart: new Date().toISOString() }, token));
    expect(create.status).toBe(403);
  });
});
