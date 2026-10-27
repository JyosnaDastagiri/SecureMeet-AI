# Architecture

## Overview

```
 Browser (Next.js app)                                  NestJS API (port 4000)                PostgreSQL
 ┌───────────────────────────┐   REST /api/*  (JWT)    ┌──────────────────────────┐  Prisma  ┌──────────┐
 │ pages, forms, admin UI    │ ───────────────────────►│ controllers → services   │ ────────►│ users,   │
 │ useMeetingRoom hook       │                         │ guards, DTO validation   │          │ meetings,│
 │  ├ Socket.IO client ──────┼── ws: events + signals ─►│ RealtimeGateway          │          │ ...      │
 │  └ RTCPeerConnection ×N   │                         │  (rooms, moderation)     │          └──────────┘
 └──────────┬────────────────┘                         └──────────────────────────┘
            │   WebRTC media (peer-to-peer, STUN only) between browsers
            └────────────────────────────────────────────────────────►  other participants
```

Monorepo with npm workspaces: `apps/api`, `apps/web`. A `packages/shared` package was **not** created: the API contract is small and keeping two typed copies avoids cross-package build problems on Windows.

## Backend modules (`apps/api/src`)
| Module | Responsibility |
|---|---|
| `core` | Global Prisma, audit logging, JWT module, in-process `MeetingEvents` bus |
| `common` | `JwtAuthGuard` (re-loads the user on every request so deactivation is immediate), `RolesGuard`, exception filter, logging interceptor |
| `auth` | register, login, logout (audit only; JWT is stateless), me |
| `users` | invite-picker search, profile / password change |
| `meetings` | CRUD, invitations, join authorisation (`resolveJoin`), attendance, report; `CollabService` for chat + polls |
| `moderation` | local rule engine + admin-editable settings |
| `realtime` | Socket.IO gateway: rooms, waiting room, chat, reactions, polls, host controls, signalling |
| `admin` | stats, user management, meeting management, audit log, moderation settings/events |
| `health` | `GET /api/health` (checks `SELECT 1`) |

## Data model (`apps/api/prisma/schema.prisma`)
`User` · `Meeting` · `Invitation` (unique per meeting+invitee) · `MeetingParticipant` (WAITING/ADMITTED/DENIED/REMOVED, unique per meeting+user) · `Attendance` (one row per join session with `joinedAt`/`leftAt`) · `ChatMessage` · `Poll` / `PollOption` / `Vote` (unique per poll+user) · `ModerationEvent` · `ModerationSetting` (single row) · `AuditLog`.
Deletion behaviour: meeting-owned rows cascade; a user who hosts meetings cannot be deleted (`Restrict`); audit rows keep existing with `actorId = NULL` if the actor is deleted. Indexes exist on foreign keys and on common filters (status+start, createdAt, action).

## Authorisation rules
- REST: every route except register/login/health uses `JwtAuthGuard`; admin routes add `RolesGuard` with `@Roles('ADMIN')`. Meeting data is returned only to the host, an invitee, or an admin; management actions require host or admin.
- Joining (`room:join`): server checks the meeting is active; non-hosts need an invitation that is not DECLINED and the meeting must be LIVE; DENIED/REMOVED users are refused; with the waiting room on, non-hosts stay WAITING until the host admits them. **The meeting ID alone grants nothing.**
- Socket events other than `room:join` require the socket to be an ADMITTED member of the room; host-only events additionally require the host. Every payload is validated with Zod and rate-limited where relevant.

## Socket.IO protocol
Client → server (acknowledged with `{ ok, error?, ... }`): `room:join`, `room:leave`, `chat:send`, `reaction:send`, `poll:create`, `poll:vote`, `poll:close`, `host:admit`, `host:deny`, `host:remove`, `host:mute`, `host:mute-all`, `host:end`, `media:state`, `rtc:signal`.
Server → client: `admitted`, `denied`, `removed`, `meeting:ended`, `session:replaced`, `peer:joined`, `peer:left`, `media:state`, `rtc:signal`, `chat:message`, `reaction`, `poll:created`, `poll:updated`, `waiting:update`, `moderation:warning` (sender), `moderation:alert` (host), `host:mute-request`, `invitation:new`.
The JWT is sent in the handshake (`auth.token`) and verified in a Socket.IO middleware before the connection is established. Only one session per user per meeting is allowed: a second join replaces the first (`session:replaced`).

## Video: WebRTC mesh (implemented) vs mediasoup (not implemented)
**Implemented:** a peer-to-peer *mesh*. The newest joiner offers to each existing member (so offers never collide). Each connection has three fixed transceivers — microphone, camera, screen — so toggling uses `replaceTrack()` without renegotiation. A device is shown ON only after `getUserMedia`/`getDisplayMedia` succeeds; turning it off stops the track (hardware released). Duplicate clicks are ignored while a request is pending. Cleanup on leave/disconnect closes every peer connection, stops every track and disconnects the socket. STUN servers come from `NEXT_PUBLIC_STUN_URLS`; **there is no TURN server**, so users behind strict NATs/firewalls may not connect. Mesh upload bandwidth grows with participants (roughly N−1 streams per person); it is practical for small demo meetings.

**Why not mediasoup now:** it needs a native build (Python + Visual Studio Build Tools on Windows or a prebuilt worker), a UDP port range, correct announced IPs, and a non-trivial client (`mediasoup-client`) — and a mediasoup deployment that cannot be run and verified here would be a fake claim. **Staged plan:** add a `MediasoupModule` (Worker/Router, one WebRtcTransport per direction per peer, producers/consumers, cleanup on `removePeer`), add `sfu:*` socket events next to `rtc:signal`, and replace the mesh logic in `useMeetingRoom` with `mediasoup-client` while keeping the same UI. The room state, authorisation, chat, polls and attendance code would not change.

## Moderation (local, rule-based — not machine learning)
Chat text is normalised (leetspeak digits/symbols → letters), then matched with word-boundary regexes that tolerate repeated letters (`stuuupid`). Matched terms add weights: profanity 0.4, insult 0.5, threat 1.0, admin-defined custom term 0.6 (each distinct term counts once, total capped at 1). Score ≥ *block threshold* (default 0.8) → message blocked, not stored, sender warned, host alerted. Score ≥ *warn threshold* (default 0.4) → delivered but flagged, sender warned, host alerted. Thresholds, custom terms and an on/off switch are editable by an administrator; each meeting can also disable moderation. Stored per event: categories, severity, score, action and a **masked** excerpt (first letter kept, rest `*`). No external AI provider is called. The filter handles English keywords only and will miss context-dependent abuse and produce false positives/negatives; a `ModerationService.evaluate()` seam exists to plug in an external classifier later.

## Engagement indicator
For each attendee: `attendanceRatio = time in meeting ÷ meeting duration`. Score = weighted average of: attendance (weight 60), chat activity `min(1, messages/5)` (weight 20), and poll participation `votes ÷ polls` (weight 20, **only included when the meeting had polls**), scaled to 0–100. Labels: High ≥ 70, Medium 40–69, Low < 40. This measures *participation*, not attention or emotion. No webcam, audio or emotion analysis is performed.

## Security measures
bcrypt (cost 12) password hashes with a dummy-hash comparison for unknown emails; password rules enforced on server; JWT with expiry; DTO validation with whitelist + `forbidNonWhitelisted` (blocks mass-assignment such as `role: ADMIN` at registration); Helmet headers; CORS limited to `WEB_ORIGIN`; throttling (global 120/min, login 10/min, register 5/min, profile 10/min) plus per-user socket rate limits; environment validation at start-up; centralised error filter that hides internals; audit log of sensitive actions; no secrets in the frontend (`NEXT_PUBLIC_*` holds only the API URL and STUN list).
**Known trade-offs:** the JWT is stored in `localStorage` (readable by injected scripts — an httpOnly-cookie session would be stronger); room state lives in API process memory, so run **one** API instance (scaling out needs the Socket.IO Redis adapter — the reason Redis is provided in Docker Compose as an optional profile); "ask to mute" is enforced by the client, not by a media server.
