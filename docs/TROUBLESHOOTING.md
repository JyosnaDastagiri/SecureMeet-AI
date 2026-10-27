# Troubleshooting

## npm / PowerShell
| Symptom | Fix |
|---|---|
| `npm : File ...npm.ps1 cannot be loaded because running scripts is disabled` | Run once: `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`, or use `npm.cmd`, or a Command Prompt tab. |
| `node` / `npm` not recognized | Install Node.js LTS from nodejs.org and **reopen VS Code** (PATH refresh). |
| `npm install` fails with EPERM / EBUSY | Stop all dev servers (Ctrl+C), close other terminals using the folder, pause antivirus scanning of the folder, retry. Avoid placing the project inside OneDrive-synced folders (e.g. `C:\projects\smai` is better than `Documents`). |
| Very long paths error | Keep the project near the drive root, or enable long paths in Windows. |

## Prisma
| Symptom | Fix |
|---|---|
| `EPERM: operation not permitted, rename ...query_engine-windows.dll.node` during `db:generate` | A running API holds the DLL. Stop `npm run dev:api` (and any Prisma Studio), run `npm run db:generate` again, restart. |
| `Environment variable not found: DATABASE_URL` | `apps\api\.env` is missing. Run `Copy-Item apps\api\.env.example apps\api\.env` (or `scripts\setup.ps1`). Run Prisma commands through `npm run db:*` from the root so the right folder is used. |
| `P1001: Can't reach database server at localhost:5433` | PostgreSQL is not running. Docker: start Docker Desktop, `npm run db:up`, `docker ps`. Local PostgreSQL: check the Windows service "postgresql-x64-16" is running and the URL uses port **5432**. |
| `P1000: Authentication failed` | Username/password in `DATABASE_URL` do not match the database. For Docker the defaults are `smai` / `smai_dev_password`. If you changed them after the volume was created, remove the volume (⚠ deletes data): `docker compose -f infra/docker/docker-compose.yml down -v`, then `npm run db:up`. |
| `@prisma/client did not initialize yet` | Run `npm run db:generate`. |
| Table does not exist | Run `npm run db:push`. |
| `db:push` wants to drop data | Read the warning; in development you can accept, but never on data you care about. |

## PostgreSQL / Docker / Redis
- **Docker Desktop will not start**: enable virtualization in BIOS and install WSL 2 (`wsl --install` in an admin PowerShell, then reboot). Or skip Docker and use local PostgreSQL (setup guide step 6B).
- **Port 5433 already in use**: change the left side of `"5433:5432"` in `infra/docker/docker-compose.yml` and the port in `DATABASE_URL`.
- **Redis**: not required. `npm run db:up` does not start it. Optional: `docker compose -f infra/docker/docker-compose.yml --profile redis up -d`. The current code does not use it.

## Ports (API 4000, web 3000)
`netstat -ano | findstr :4000` → note the PID → `taskkill /PID <pid> /F`. Or change `PORT` in `apps\api\.env` and `NEXT_PUBLIC_API_URL` in `apps\web\.env.local`, then restart **both** (Next.js reads env vars at start).

## API start-up
- `Invalid environment configuration ...`: fix the named variable (e.g. `JWT_SECRET` must be ≥ 32 characters).
- `/api/health` shows `degraded`: the API is running but the database is unreachable (see Prisma/PostgreSQL above).
- Browser shows *"Cannot reach the server at http://localhost:4000"*: API not running, wrong port, or CORS (below).

## CORS / Socket.IO
- Console error "blocked by CORS policy": `WEB_ORIGIN` in `apps\api\.env` must contain the exact origin you use in the browser (`http://localhost:3000`, not `http://127.0.0.1:3000`). Multiple origins: comma-separated. Restart the API.
- Socket `connect_error: unauthorized`: your token expired or the account is disabled → log out and in again.
- Socket connects but "You are not in this meeting": you must be admitted (host admits waiting users) — the meeting ID alone is not enough.
- "joined elsewhere" screen: the same account joined the same meeting from another tab; only the newest session is kept. Use different accounts per window.
- Changing the API address: set `NEXT_PUBLIC_API_URL`, restart `npm run dev:web`.

## Camera, microphone, screen share (WebRTC)
- **Permission denied**: click the lock icon in the address bar → allow Camera/Microphone → reload. Windows: Settings → Privacy & security → Camera/Microphone → allow desktop apps.
- **"in use by another application"** (`NotReadableError`): another app/browser has the device (Teams, Zoom, another browser). Close it. Two tabs of the same browser can usually share a camera; two different browsers cannot.
- **Works on localhost but not on another PC / phone**: browsers only allow camera/mic on `https://` or `localhost`. For LAN testing you need HTTPS (e.g. a dev certificate/tunnel), and `WEB_ORIGIN`/`NEXT_PUBLIC_API_URL` must use that address.
- **Remote video never appears (stays on avatar) across different networks**: only STUN is configured, so symmetric NAT / corporate firewalls block the direct path. Fix: add a TURN server (e.g. self-hosted coturn) and extend `ICE_SERVERS` in `apps/web/src/lib/useMeetingRoom.ts` with `{ urls, username, credential }` (credentials must come from your own server, never commit them).
- **No remote audio**: click once anywhere in the page (browser autoplay rules); the *Join meeting* button normally provides this click.
- **Screen share unsupported**: use desktop Chrome/Edge/Firefox; mobile browsers generally cannot share screens.
- **mediasoup**: not part of this build (see ARCHITECTURE.md). If you later add it on Windows you need Python 3 and *Visual Studio Build Tools (C++ workload)*, plus an open UDP port range and the correct `announcedIp`.

## Frontend
- Blank/odd page after changing env: stop `dev:web`, delete `apps\web\.next`, start again.
- `Module not found` after pulling changes: run `npm install` at the root.
