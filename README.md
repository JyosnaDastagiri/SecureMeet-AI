# SecureMeet AI — Intelligent and Secure Virtual Meeting Platform

A final-year B.Tech project: a private video-meeting platform with in-app invitations, a waiting room, real-time chat / reactions / polls, rule-based chat moderation, attendance and engagement reports, and an administrator dashboard.

| Layer | Technology |
|---|---|
| Frontend (`apps/web`) | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS |
| Backend (`apps/api`) | NestJS 10, TypeScript, REST + Socket.IO |
| Database | PostgreSQL 16 + Prisma 5 |
| Auth | JWT (HS256), bcrypt password hashing, role-based access (PARTICIPANT / HOST / ADMIN) |
| Video | Browser WebRTC (peer-to-peer mesh, signalled through Socket.IO) |
| Infra | Docker Compose for PostgreSQL (Redis profile optional, unused by current code) |

## Quick start (Windows 11 + VS Code)

Full, beginner-friendly instructions: **[docs/VS_CODE_SETUP.md](docs/VS_CODE_SETUP.md)**.

Short version, from the project root in the VS Code terminal:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1   # installs, creates .env files, starts PostgreSQL (Docker)
npm run db:push                                              # create tables
npm run db:seed                                              # optional demo accounts
npm run dev:api                                              # terminal 1 -> http://localhost:4000/api/health
npm run dev:web                                              # terminal 2 -> http://localhost:3000
```

Demo accounts after seeding (password = `SEED_PASSWORD` in `apps/api/.env`, default `ChangeMe123`):
`admin@securemeet.local`, `host@securemeet.local`, `alice@securemeet.local`, `bob@securemeet.local`.

## Documentation
- [docs/VS_CODE_SETUP.md](docs/VS_CODE_SETUP.md) — ordered setup & run commands
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — design, data model, socket protocol, security, moderation & engagement formulas
- [docs/TESTING.md](docs/TESTING.md) — automated tests, manual verification checklist, **honest verification status**
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) — Windows, Prisma, PostgreSQL, ports, Socket.IO, WebRTC problems

## Feature status (honest summary)

| Feature | Status |
|---|---|
| Register / login / logout / protected routes / profile / roles | Implemented. API behaviour covered by automated tests with a stubbed database. |
| Create, edit, end/cancel meetings, in-app invitations (accept / decline / revoke) | Implemented. Needs verification against real PostgreSQL on your machine. |
| Waiting room, host admit / deny / remove, attendance records | Implemented. Server logic covered by Socket.IO integration tests (in-memory DB). |
| Chat, emoji reactions, polls & voting, host mute request, end meeting | Implemented. Same test coverage as above. |
| Moderation (abusive-language detection) | Implemented as **local rule-based keyword filter** — *not* machine learning, no external AI. Unit-tested. |
| Engagement indicator, attendance report, admin dashboard, audit log | Implemented. Formula documented; DB queries need your verification. |
| Video / audio / screen share | Implemented with **WebRTC mesh** (works well for ~2–6 people on a LAN/same machine). Compiles and builds, but **real camera/microphone behaviour has not been tested** — follow docs/TESTING.md. No TURN server, so some networks will not connect. |
| mediasoup SFU | **Not implemented** (staged plan in docs/ARCHITECTURE.md). Requires native build tools and UDP port configuration. |
| Redis | Container provided (optional profile); **not used** by current code (single API instance). |
| Webcam emotion/boredom detection | **Deliberately not included.** |

## Privacy
Meetings are never recorded or transcribed. The moderation filter only examines chat text, stores a *masked* excerpt, categories, score and action. The meeting ID is not a credential: every join is authorised by the server against invitations and host admission.
