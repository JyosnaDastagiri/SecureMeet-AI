# Testing & verification

## Automated tests (`npm test`, project root)
| Suite | Tests | What it proves | What it does NOT prove |
|---|---|---|---|
| `moderation.rules.spec.ts` | 12 | rule engine, thresholds, masking, engagement-score formula | accuracy on real-world text |
| `app.integration.spec.ts` | 6 | full Nest app wiring, validation (incl. mass-assignment block), hashing, JWT, role checks | real SQL |
| `realtime.integration.spec.ts` | 15 | real Socket.IO clients: auth, invitation check, waiting room, admit/remove, chat + moderation, polls (one vote), signalling relay, media-state, host end & attendance closing | real SQL, browser media |

Both integration suites replace the database with an in-memory stub. Your PostgreSQL behaviour must be verified manually (below).

## Static checks
`npm run typecheck` · `npm run lint` · `npm run build`

## Manual verification checklist (do these on your machine)
Mark each as you go.

**Install & database**
- [ ] `npm install` succeeds; `npm run db:generate`, `npm run db:push`, `npm run db:seed` succeed
- [ ] `Invoke-RestMethod http://localhost:4000/api/health` → `status: ok`, `database: up`
- [ ] http://localhost:3000 loads the landing page

**Auth**
- [ ] Register a new account; refresh the page (still logged in); log out; protected URL (e.g. /dashboard) redirects to /login
- [ ] Wrong password shows an error; 11+ rapid bad logins get rate-limited (HTTP 429)
- [ ] A participant account cannot see "Schedule" and cannot open /admin

**Meetings & invitations**
- [ ] Host creates a meeting and invites Alice; Alice sees the invitation (live toast not required; refresh works) and accepts/declines
- [ ] Eve (not invited) opening the meeting URL gets a "no access" error, and cannot join via the room URL
- [ ] Host edits title/time; revoking an invitation removes access
- [ ] Alice cannot join before the host starts; after the host starts she waits; host admits her
- [ ] Host denies/removes a user → that user cannot rejoin
- [ ] After "End for everyone": status ENDED, History shows attended time, host sees the attendance & engagement table

**Collaboration**
- [ ] Chat between two windows; reload mid-meeting shows recent history
- [ ] Reactions float up for everyone; poll created, voted once only, counts update, closed by host
- [ ] A rude message (`you stupid idiot`) is blocked; `that was stupid` is delivered with a flag; host sees alerts; Admin → Moderation shows masked events
- [ ] Admin changes a threshold / adds a custom term and the behaviour changes (allow ~30 s cache)

**Audio / video (NOT verified by the author — needs real devices)**
- [ ] Mic button: permission prompt → ON only after allow; deny → stays OFF and shows an error
- [ ] Camera ON shows your tile; OFF turns the camera light off
- [ ] Second participant sees your video and hears audio
- [ ] Screen share appears as a separate tile and stops when you click the browser's "Stop sharing"
- [ ] Leaving closes devices (camera light off) and the other side shows "left"
- [ ] Opening the same meeting in a second tab with the same account closes the first ("joined elsewhere")
- [ ] Three or more participants (mesh) — note CPU/bandwidth

**Admin**
- [ ] Users tab: change role / deactivate (cannot change yourself); a deactivated user is logged out on the next request
- [ ] Meetings tab: end a live meeting; Audit log shows these actions

## Verification status recorded when this package was produced
Executed in the build environment: API TypeScript check, ESLint, Nest build, all 33 automated tests (pass); web TypeScript check, `next lint`, `next build` (pass); Prisma client generation from the schema (pass).
**Not executed / unverified:** any query against a real PostgreSQL (including `db push` and the seed script), Docker Compose, the PowerShell script and Windows-specific commands, any browser UI session (no visual QA), real camera/microphone/screen-share/WebRTC connections, cross-network connectivity.
