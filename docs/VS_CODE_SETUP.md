# VS Code setup guide (Windows 11)

Follow the steps **in order**. Every step says where to run it, what it does, the command, and what success looks like.

> **Terminal basics.** In VS Code choose **Terminal → New Terminal** (shortcut ``Ctrl+` ``). It opens at the folder you opened in VS Code. Make sure the profile in the terminal's dropdown says **PowerShell**. To run services side by side use the **`+`** button in the terminal panel to open extra tabs.

---

## 0. What you need installed

| Software | Needed for | Check (any terminal) | Install (graphical) |
|---|---|---|---|
| **Node.js 20 or 22 LTS** (includes npm) | everything | `node -v` → `v20.x` or `v22.x` | Download the **LTS** Windows installer from https://nodejs.org and click through it. Reopen VS Code afterwards. |
| **Docker Desktop** *(recommended)* | runs PostgreSQL with one command | `docker --version` | https://www.docker.com/products/docker-desktop → install → start it and wait until it says "Engine running". Needs WSL 2 (the installer offers it). |
| **PostgreSQL 16** *(only if you skip Docker)* | the database | `psql --version` | https://www.postgresql.org/download/windows/ (EDB installer; remember the `postgres` password you choose). |
| Git *(optional)* | version control | `git --version` | https://git-scm.com/download/win |
| Redis | **not needed** — the current code does not use it | — | — |

Useful VS Code extensions (Extensions icon in the sidebar → search): **Prisma**, **ESLint**, **Tailwind CSS IntelliSense**, **Docker**, **DotENV**.

---

## 1. Open the project

1. Extract the ZIP. You get a folder named `smai`.
2. In VS Code: **File → Open Folder…** → select the `smai` folder (the one containing `package.json` and `apps`).
3. Open a terminal: **Terminal → New Terminal**.

**Working directory for all commands below unless stated: the `smai` project root.** Confirm:

```powershell
Get-Location
```
Expected: a path ending in `\smai`.

---

## 2. Check Node.js

```powershell
node -v
npm -v
```
Expected: `v20.x`/`v22.x` and a number like `10.x`. If you get *"not recognized"*, install Node.js (step 0) and reopen VS Code.

**If PowerShell says "running scripts is disabled on this system"** when you run `npm`, run this once (it only affects your user):
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```
(Alternative: use `npm.cmd` instead of `npm`, or open a *Command Prompt* terminal tab.)

---

## 3. One-command setup (recommended) — or do steps 4–6 manually

**Where:** project root. **What it does:** checks Node, creates `apps\api\.env` (with a random JWT secret) and `apps\web\.env.local` *only if missing*, runs `npm install`, generates the Prisma client, and starts PostgreSQL in Docker if Docker is running. It never overwrites existing files.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
```
Expected: green messages and finally *"Done. Next steps"*. Then jump to **step 7**. (If you use local PostgreSQL instead of Docker, do step 6B first.)

---

## 4. Install dependencies (manual)

**Where:** project root. **What:** downloads all packages for both apps (npm workspaces).
```powershell
npm install
```
Expected: ends with *"added NNN packages"*. Takes a few minutes the first time.

## 5. Environment files (manual)

**Where:** project root. **What:** copies the example files; real `.env` files are git-ignored.
```powershell
Copy-Item apps\api\.env.example apps\api\.env
Copy-Item apps\web\.env.example apps\web\.env.local
```
Create a random JWT secret and put it in the API `.env`:
```powershell
$secret = node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
$p = (Resolve-Path apps\api\.env).Path
[IO.File]::WriteAllText($p, ([IO.File]::ReadAllText($p).Replace('REPLACE_WITH_A_LONG_RANDOM_STRING_AT_LEAST_32_CHARS', $secret)), (New-Object System.Text.UTF8Encoding $false))
```
Expected: no output. Open `apps\api\.env` in VS Code and check that `JWT_SECRET=` is now a long hex string. **Never commit or share this file.**

## 6. Start PostgreSQL

### 6A. With Docker Desktop (recommended)
Start Docker Desktop first. **Where:** project root. **What:** starts a PostgreSQL 16 container on **port 5433** (so it does not clash with a local PostgreSQL on 5432).
```powershell
npm run db:up
```
Check it:
```powershell
docker ps
```
Expected: a container named `smai-postgres` with status `Up … (healthy)`. The default `DATABASE_URL` in `.env.example` already matches this container.
*GUI alternative:* Docker Desktop → Containers shows `smai`; the VS Code **Docker** extension can start/stop it.

### 6B. With a local PostgreSQL (no Docker)
1. Open **pgAdmin** (installed with PostgreSQL) or run `psql -U postgres` and execute:
   ```sql
   CREATE USER smai WITH PASSWORD 'smai_dev_password';
   CREATE DATABASE smai OWNER smai;
   ```
2. Edit `apps\api\.env` and set:
   ```
   DATABASE_URL="postgresql://smai:smai_dev_password@localhost:5432/smai?schema=public"
   ```
   (Use your own password in both places.)

---

## 7. Create the database tables

**Where:** project root. Run in order.

Generate the Prisma client (TypeScript types for the database):
```powershell
npm run db:generate
```
Expected: *"Generated Prisma Client"*.

Create the tables from `apps/api/prisma/schema.prisma`:
```powershell
npm run db:push
```
Expected: *"Your database is now in sync with your Prisma schema."* If you see *P1001 Can't reach database server*, PostgreSQL is not running or the URL/port is wrong → see TROUBLESHOOTING.

Optional demo data (4 accounts + a sample meeting):
```powershell
npm run db:seed
```
Expected: *"Seed complete."*

> This project uses `prisma db push` (schema sync) rather than migration files, which is simplest for a student project. For production you would switch to `prisma migrate`.

---

## 8. Run the backend (terminal tab 1)

**Where:** project root. **What:** starts the NestJS API in watch mode on port **4000**.
```powershell
npm run dev:api
```
Expected: log lines ending with  
`SecureMeet AI API running on http://localhost:4000/api (health: /api/health)`.  
If it prints *Invalid environment configuration*, fix the listed variable in `apps\api\.env`.

## 9. Run the frontend (terminal tab 2)

Click **`+`** in the terminal panel to open a **second** tab (leave tab 1 running), make sure you are in the project root, then:
```powershell
npm run dev:web
```
Expected: `Ready` / `Local: http://localhost:3000`.

## 10. Check that everything is up

In a **third** terminal tab (project root):
```powershell
Invoke-RestMethod http://localhost:4000/api/health
```
Expected: `status : ok` and `database : up`. (`degraded`/`down` means the API runs but cannot reach PostgreSQL.)

Open **http://localhost:3000** in Chrome or Edge.

*GUI alternative for steps 8–9:* Explorer sidebar → **NPM SCRIPTS** panel → run `dev:api` / `dev:web` from the root `package.json`.

---

## 11. Try the application

Log in with the seeded accounts (password = `SEED_PASSWORD`, default `ChangeMe123`), or register new ones.

**Two-user test (needs two separate sessions):** use a normal window for the host and an **Incognito/InPrivate** window (or a second browser) for a participant, because the login token is stored per browser profile.

1. Window A: log in as `host@securemeet.local` → open the seeded **Demo: Project Kickoff** (or create a meeting) → **Start meeting** → **Join meeting**.
2. Window B: log in as `alice@securemeet.local` → **Invitations** → Accept → open the meeting → **Join** (the host must have started it). Alice lands in the **waiting room**.
3. Window A: **People** tab → admit Alice.
4. Try: microphone, camera, screen share, chat, reactions, a poll (host: **Polls → Create a poll**), the host's **End** button.
5. Chat a rude word such as `you idiot` → Alice gets a warning, the host gets an alert (People tab).
6. Log in as `admin@securemeet.local` → **Admin** for users, meetings, moderation settings and the audit log.

Testing both windows on one PC: Windows lets two *tabs/windows of the same browser* share one camera. Two *different browsers* cannot open the same camera at once (error "in use"); use one camera in one window and leave the other camera off.

---

## 12. Tests, lint and build

**Where:** project root.
```powershell
npm test          # 33 automated API tests (no database needed)
npm run typecheck # TypeScript for both apps
npm run lint      # ESLint for both apps
npm run build     # production builds of API and web
```
Expected: all pass without errors. (`npm test` uses an in-memory stub, so it does **not** prove your real PostgreSQL works — steps 7 and 10 do.)

---

## 13. Stopping and cleaning up

- Stop a running server: click its terminal tab and press **Ctrl+C**.
- Stop PostgreSQL (keeps data): `npm run db:down`.
- Delete database data too (⚠ destroys data): `docker compose -f infra/docker/docker-compose.yml down -v`.

## 14. Port problems (4000 / 3000 / 5433)

Find what uses a port (example 4000):
```powershell
netstat -ano | findstr :4000
```
The last column is the PID. Stop it (replace 1234):
```powershell
taskkill /PID 1234 /F
```
To change the API port, edit `PORT` in `apps\api\.env` **and** `NEXT_PUBLIC_API_URL` in `apps\web\.env.local`, then restart both servers. See also [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
