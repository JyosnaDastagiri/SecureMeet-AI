import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 8) throw new Error('Set SEED_PASSWORD (min 8 chars) in apps/api/.env before seeding.');
  const passwordHash = await bcrypt.hash(password, 12);

  const users = [
    { email: 'admin@securemeet.local', name: 'Demo Admin', role: 'ADMIN' as const },
    { email: 'host@securemeet.local', name: 'Demo Host', role: 'HOST' as const },
    { email: 'alice@securemeet.local', name: 'Alice Participant', role: 'PARTICIPANT' as const },
    { email: 'bob@securemeet.local', name: 'Bob Participant', role: 'PARTICIPANT' as const },
  ];
  for (const u of users) {
    await prisma.user.upsert({ where: { email: u.email }, create: { ...u, passwordHash }, update: { name: u.name, role: u.role } });
  }
  await prisma.moderationSetting.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });

  const host = await prisma.user.findUniqueOrThrow({ where: { email: 'host@securemeet.local' } });
  const alice = await prisma.user.findUniqueOrThrow({ where: { email: 'alice@securemeet.local' } });
  const bob = await prisma.user.findUniqueOrThrow({ where: { email: 'bob@securemeet.local' } });

  const existing = await prisma.meeting.findFirst({ where: { hostId: host.id, title: 'Demo: Project Kickoff' } });
  if (!existing) {
    const m = await prisma.meeting.create({
      data: {
        title: 'Demo: Project Kickoff',
        description: 'Sample meeting created by the seed script.',
        hostId: host.id,
        scheduledStart: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    await prisma.invitation.createMany({ data: [{ meetingId: m.id, inviteeId: alice.id }, { meetingId: m.id, inviteeId: bob.id }] });
  }
  // eslint-disable-next-line no-console
  console.log('Seed complete. Accounts: admin@/host@/alice@/bob@securemeet.local (password = SEED_PASSWORD).');
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
