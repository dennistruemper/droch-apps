# Decisions

Recorded on 2026-10-02. These capture agreed constraints and implementation choices; milestone status lives
in the implementation plan.

## Agreed choices

| Decision                                      | Rationale / consequence                                                                                          |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| One monorepo, one backend, a frontend per app | Share infrastructure while keeping app features modular.                                                         |
| TypeScript throughout                         | One application language, with type safety and fast feedback as priorities.                                      |
| Solid 2 without SolidStart                    | Interactive apps; Solid 2 prerelease risk is accepted. Landing pages can use another technology later.           |
| Paths on one origin                           | New apps require no additional DNS or Coolify routing configuration.                                             |
| One package per app                           | Earlier contract/domain/server packages per app were excessive. Internal modules are folders with explicit APIs. |
| pnpm and Node 24 LTS                          | Preferred over Bun for package management and runtime.                                                           |
| Drizzle and SQLite                            | Drizzle retained; SQLite files per app and shared auth replace the initial PostgreSQL schema plan.               |
| Custom authentication                         | User prefers a focused implementation over Better Auth. Passwords and password hashes are excluded.              |
| Email code or link through Mailtrap           | Email-based account access; email codes are the current baseline.                                                |
| Docker Compose persists SQLite files          | One deployable stack and a similar local environment.                                                            |
| No Effect library                             | Use pure functions and explicit dependencies with ordinary TypeScript.                                           |
| Drochsign CSS starting point                  | Semantic HTML, minimal classes, two-color themes; themes can differ by app.                                      |
| Independent worktree development              | Multiple apps/branches can be worked on and run concurrently.                                                    |

## Product requirements

### Scrum poker

No accounts. Participants join rooms anonymously. Guest identity and room membership
need server enforcement; no registration should be required.

### Word game

Accounts are required. Matches are turn-based with live updates. Players can be online
together or make moves days apart. There is no time limit per turn. Durable match
state must not depend on a browser or live connection remaining open.

## Tradeoffs accepted

- Paths share one browser origin. Storage keys need app prefixes. An app reset can
  delete only its keys, but browser-level site-data deletion affects all apps.
- Namespaces are not security isolation between same-origin apps.
- One application deployment releases and restarts all apps together. Clients must
  reconnect and recover durable state after a restart.
- Custom auth means this project owns verification, throttling, sessions, and their tests.
- TypeScript and Solid cannot provide Elm's compiler-enforced purity guarantees.

## Proposed implementation defaults

These were recommended during planning and can be refined during setup. They are
not additional fixed product requirements.

- mise manages exact Node and pnpm versions; project commands remain in `package.json`.
- Hono HTTP backend; Zod schemas; HTTP commands with SSE for live updates.
- Custom email-code login, account creation on successful first verification,
  server-side revocable sessions, and HttpOnly cookies.
- Oxc-based Solid compilation, Oxlint, Oxfmt, Vitest, and Playwright.
- One shared workspace package with folder modules for auth, mail, database,
  browser storage, and styles; one server composition package.
- Persist poker rooms across deployments and expire inactive rooms.
- One backend instance, with SQLite as the durable source of truth.

## Foundation implementation choices

- Exact dependencies and lockfile are recorded with Node 24.21.0 and pnpm 11.25.0
  tool pins. Solid 2 RC, the official Vite plugin, and Router 2 are verified together.
- Hono, Zod, strict TypeScript, Oxlint, Oxfmt, Vitest, and Playwright are implemented.
- Drochsign uses a reviewed vendored snapshot with integration overrides in a separate
  file. Updates are explicit; builds never fetch a moving branch.
- `pnpm dev` generates an ignored Compose override and runtime settings per checkout.
  Docker dependencies have their own per-checkout volumes to avoid native-binary
  and dependency-link collisions with host installations.
- Quality checks run on the host/CI before deployment. Docker builds type check and
  compile independently because Oxlint JS plugins currently crash in small Linux
  VMs ([upstream issue](https://github.com/oxc-project/oxc/issues/20331)).

## Persistence revision — 2026-10-03

The user clarified that this is a small hobby project and chose one SQLite file per
app plus one for auth. This supersedes the initial PostgreSQL process/database/schema
choice. Keep one backend process: auth exposes ordinary TypeScript functions without
network calls. Apps receive stable user IDs and own authorization and game state.

- Auth and apps own separate migration histories; shared infrastructure handles files.
- No cross-file foreign keys or atomic cross-file transactions; do not use ATTACH to
  bypass ownership. Coordinate account lifecycle explicitly and never reuse user IDs.
- WAL, short transactions, and a busy timeout fit modest concurrent usage. Do not add
  multi-instance hosting, service discovery, or queues for hypothetical future scale.
- One persistent Docker volume holds all files, so adding an app requires no new
  Coolify storage configuration. Each checkout gets a separate volume.
- Backups cover all files coherently. The old local PostgreSQL volume is retained,
  but the container and PostgreSQL dependencies are removed.

## Poker implementation — 2026-10-03

- The user chose expiry after **30 days of inactivity**. Joining (including rejoining),
  voting/clearing, revealing, and starting a round refresh activity. Viewing a room
  or keeping an SSE connection open does not. Expired rooms are removed on subsequent
  poker requests, including their participant records.
- The deck is `0, 1, 2, 3, 5, 8, 13, 21, ?, ☕`. The user requested the coffee
  symbol for a break vote on 2026-10-04; it follows normal vote privacy and reveal rules. The numeric deck and a 50-participant room limit are implementation defaults.
- The user chose collaborative control: **every room member can reveal or start the
  next round**. Reveal requires at least one vote, without waiting for everyone.
  Revealed votes cannot change. Reset clears all votes and increments the round.
  Creator disconnection cannot block play, so host takeover/heartbeat leases are not needed.
  The creator label is informational and grants no extra permissions.
- Anonymous membership uses a random HttpOnly cookie scoped to `/api/poker`, with
  its digest stored in each membership row. The same browser can belong to multiple
  rooms. There is no guest account recovery in this slice.
- Commands include their round number. Transactions serialize voting and revealing;
  stale votes and repeated resets cannot change the following round.
- SSE sends full, viewer-specific, versioned snapshots immediately on subscription,
  after accepted commands, and every 10 seconds for reconciliation. Queues are
  bounded; skipped updates are recovered from a later snapshot. No event log is needed.
- Unrevealed participant vote fields are null for everyone; the viewer's own vote
  is available only in `you`. The server applies this to both HTTP and SSE.
- User-facing errors explain recovery. Unexpected errors include a reference linked
  to redacted server logs; request bodies and guest credentials are not logged.

## Still to settle

- Word-game dictionary language, licensing, board layout, scoring, and player count.
- Exact code/session lifetimes, account registration/deletion policy, and email-change behavior.
- Backup destination, retention, and operational restore procedure.

## References

- [Solid 2 announcement](https://github.com/solidjs/solid/discussions/2995)
- [Drochsign](https://github.com/dennistruemper/drochsign)
- [Coolify Compose](https://coolify.io/docs/applications/builds/docker-compose)
- [Drizzle migrations](https://orm.drizzle.team/docs/migrations)
- [mise](https://mise.jdx.dev/)
