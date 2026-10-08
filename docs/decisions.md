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

## Custom themes — 2026-10-04

The shared Settings picker includes a Custom option for Poker and Vortoj. The initial
editor exposes background and foreground colors to match Drochsign's two-color design.
The first Custom selection copies the active preset's colors and font family. Edits preview immediately
and persist per app in browser storage; switching presets keeps the customization saved.
A Use app default button restores each app's default theme. Stored colors must be six-digit
hex values; malformed preferences fall back to white/near-black. Native controls follow
the background's light/dark scheme.

The user requested font customization on 2026-10-04. Custom themes offer system
sans-serif, serif, and monospace using local font stacks, with no font downloads.
Font choice is saved alongside colors and applies to app text and controls. Existing
color-only preferences keep their colors and default to system sans-serif; unknown
stored font values also fall back to this default. Preset selection removes the custom
font override. Spacing, rounding, border, and motion tokens remain developer-controlled; exposing more controls is a future product choice.

## Build and CI efficiency — 2026-10-04

Measurements showed compilation was already fast: 2.6 seconds for the GitHub Docker
build's type check and complete compilation. Dependency installation and recursive
ownership changes dominated local source rebuilds. Fetch dependencies before copying
source, using the lockfile and workspace settings as the cache boundary; install
offline with copy imports from the image-layer store. Create files with their intended
ownership and keep the runtime non-root. Adding an app needs no Dockerfile package list.

Build production once and run browser tests against that artifact with production
migrations and isolated disposable data. Keep development worktree identity tests;
verify actual development startup/hot reload when changing its tooling. Retain the
Playwright-managed browser, sequential quality checks and one CI job. The production
image build and browser/system-dependency installation run in a native parallel step
group, then both must succeed before the test stack starts. This overlaps independent
setup without duplicating runner/tool/dependency setup. The prior hosted run spent
40 seconds building and 26 seconds installing the browser; actual savings depend on
runner contention and must be measured on the next hosted run. Persistent CI Docker
caching remains an option to evaluate.

## Vortoj and accounts — 2026-10-04

User decisions:

- The word game is named **Vortoj**, with `/vortoj/` as its path.
- Two to four logged-in players join a room link. Any logged-in user can create rooms.
- Familiar board, scoring, rack, exchange, and joker rules; no deadline per turn.
- No dictionary service. Opponents vote on words, and at least half must approve.
- German and English tile sets plus an editor for named, per-user reusable custom sets.
  Unicode letters and `*` jokers are supported.
- Local tests always use **9999** without sending mail. Coolify test/preview stages use
  **9999** and send through Mailtrap. Production sends random codes through Mailtrap.

Implementation defaults (adjustable, not additional user decisions):

- Vote on each newly formed word, including cross-words. Round the threshold up,
  resolve early when accepted/impossible, and keep votes immutable. Rejected moves end
  the turn while preserving the player's tiles. Unanswered votes have no deadline.
- Creator starts and takes the first turn. No spectators or late joining after start.
- Fifteen-square board, seven-tile racks, zero-point jokers, 50-point seven-tile bonus.
  Two consecutive scoreless rounds end a match; deduct remaining tiles and award their
  points only to a player who actually emptied their rack with the bag empty.
- Freeze the selected tile set at room creation. Users keep up to 50 custom sets, with
  28–500 total tiles, at most 80 different letters, quantities 1–100 and points 0–20.
- Six-digit random production codes expire after ten minutes, with five attempts,
  one-minute resend throttling, five requests per hour per address and thirty active
  addresses per minute across the service. Sessions expire after 30 days; logout revokes.
- `AUTH_MODE` explicitly distinguishes local (`local`), preview (`test`) and production
  (`production`) builds. Local mode never sends, even if a token is present. A missing token
  on localhost selects no-mail test behavior. Public production without mail credentials
  has account sign-in disabled. Test mode uses isolated data and does not prove email ownership.
- The old empty word-game SQLite scaffold is retained on existing volumes; Vortoj gets
  a new migration history and file. Old frontend links redirect to the renamed app.

## Vortoj board interaction — 2026-10-05

Choose concept A from the mobile exploration: the board stays visible above the rack
and move controls. Begin with the whole board; tap an area or use the zoom controls to
reach 44-pixel squares, then pan and place tiles. Keep the close view throughout a
placement and word approval; return to the overview after an accepted move, rather
than after each tile. Resizing preserves an unfinished placement.

Use the same interaction on desktop. When the board fits at a comfortable size, place
directly and omit zoom controls. Mouse pointers use a 32-pixel minimum; touch uses
44 pixels. Wider desktop and short landscape layouts put the rack beside the board.
Scores, history, passing, exchanges and word voting remain available through dialogs.
The alternative mobile concepts and their standalone exploration files are removed.

## Vortoj bonus labels — 2026-10-08

Use `2×` and `3×` instead of language-specific bonus abbreviations. Word bonuses
fill the square; letter bonus labels are half the size. Preserve the centre marker
and describe the bonus type explicitly for screen readers. Scoring rules stay the same.

## Vortoj default tile distributions — 2026-10-08

The English and German presets are Vortoj defaults with small distribution changes.
English: E 12→11, I 9→8, S 4→5, T 6→7; 100 tiles total. German: E 15→14, N 9→8,
S 7→8, U 6→5; 100 tiles total instead of 102. These changes focus on common letters;
rare letters, all point values, and two zero-point jokers remain unchanged. Users
can save their preferred distributions as named custom sets. Existing rooms retain
the tile set frozen at creation; only new rooms and preset copies get the new defaults.

## Coolify runtime origin — 2026-10-05

Use Coolify's runtime `SERVICE_URL_APPLICATION` as the canonical public origin when
present, otherwise use `APP_ORIGIN`. The preview container had the correct generated
URL while an `APP_ORIGIN=$SERVICE_URL_APPLICATION` alias retained the production URL.
Reading the generated value at startup avoids that expansion dependency and follows
future preview numbers automatically. Validate the selected URL strictly and fail
closed for malformed values; do not infer trusted origins from request headers or
accept every preview subdomain.

## Still to settle

- Account deletion, email-change behavior, and app-data cleanup across independent files.
- Backup destination, retention, and operational restore procedure.

## References

- [Solid 2 announcement](https://github.com/solidjs/solid/discussions/2995)
- [Drochsign](https://github.com/dennistruemper/drochsign)
- [Coolify Compose](https://coolify.io/docs/applications/builds/docker-compose)
- [Drizzle migrations](https://orm.drizzle.team/docs/migrations)
- [mise](https://mise.jdx.dev/)
