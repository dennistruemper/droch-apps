# Architecture

The foundation, poker, email-code accounts, and Vortoj gameplay with SSE are implemented.
See [decisions](decisions.md) for fixed choices versus proposed defaults.

## Stack

| Area         | Target                                                     |
| ------------ | ---------------------------------------------------------- |
| Tools        | mise, Node 24 LTS, pnpm workspaces                         |
| Frontend     | Solid 2, Vite, official Solid 2 plugin, Solid Router 2     |
| Styling      | Drochsign plus app themes and small app-specific CSS       |
| Backend      | Hono on Node, one modular server                           |
| Contracts    | Zod schemas and inferred TypeScript types                  |
| Persistence  | SQLite per app/auth, Drizzle, per-file SQL migrations      |
| Accounts     | Custom email-code auth, Mailtrap, database-backed sessions |
| Live updates | HTTP commands and SSE                                      |
| Quality      | Strict TypeScript, Oxlint, Oxfmt, Vitest, Playwright       |
| Deployment   | Docker Compose in Coolify                                  |

Exact versions are pinned in manifests and the lockfile. Node 24.21.0 and pnpm
11.25.0 are pinned in mise and Docker. CI uses `jdx/mise-action` to install both
tools from `mise.toml` and add them to PATH.
Solid 2.0.0-rc.13, its official plugin, and Router 2 compile and run together.
Compilation and type checking are separate; deployment verification requires both.

Host/CI `pnpm check` enforces the custom Oxlint boundary rule and its rejection
fixtures. The image build runs type checking and compilation. Oxlint JS plugins
hit [a Linux allocator bug](https://github.com/oxc-project/oxc/issues/20331) on the
small local Docker VM; do not remove boundary enforcement to work around it.

Docker fetches dependencies in a lockfile/workspace-configuration layer before copying
source files, then installs offline. Files are created as the non-root user instead
of recursively changing ownership after installation. The fetched store stays in
build/development layers and is excluded from the production image.

CI builds the production image and installs the Playwright browser in a native
parallel step group within one job. The group waits for both steps and propagates
failures before starting the test stack. Browser checks run against the built image
and the production Compose migration gate. `pnpm test:stack` publishes an allocated loopback port with a distinct
per-checkout project, cookie and disposable SQLite volume; cleanup does not affect
development stacks. Worktree identity coverage remains in the ordinary unit tests.

## Layout and dependency direction

```text
apps/
  poker/                 # one workspace package
    src/client/
    src/server/
    src/contracts/
    src/domain/
  vortoj/                # same internal structure
server/                  # backend entry point, app registration, composition
shared/
  src/auth/              # server-only account API and schema
  src/mail/              # Mailtrap and no-op test implementations
  src/contracts/auth/    # browser-safe account contracts
  src/database/
  src/storage/
  src/styles/
  src/settings/          # shared browser-only Settings component
tooling/
migrations/
```

App server modules own app-specific tables and queries. Shared database infrastructure
provides the connection and migration machinery, not unrestricted cross-app access.
The server composes app modules; apps do not import each other's internals.

Each package exposes intentional public entry points. Inside packages, folder modules
have explicit `index.ts` APIs. Oxlint must enforce access through those APIs, reject
relative-path bypasses, and prevent client code importing server modules. Do not
mix server exports into a browser-safe barrel file.

Pure domain functions handle rules and transitions. Services wrap those functions
with explicit persistence, clock, randomness, and external service dependencies.
Expected rule failures are handled at the HTTP boundary; runtime schemas validate external data.

## Routing and adding apps

```text
/poker/          poker frontend
/vortoj/          word-game frontend
/api/auth/       shared account API
/api/poker/      poker commands, queries, and event stream
/api/vortoj/      word-game commands, queries, and event stream
```

One domain and one application ingress. A typed registry supplies app IDs, URL
prefixes, and frontend build locations. Explicit server registration lives in one
composition file. Build and static-serving configuration derive from registration
rather than maintaining separate app lists.

Each frontend configures its router and asset base for its prefix. SPA fallbacks are
scoped to the appropriate app. Unknown app paths, API endpoints, and missing assets
return errors rather than unrelated HTML.

Adding an app changes repository code and registration only, followed by deployment.
No extra DNS, domains, Coolify resources, or per-app ingress rules.

## Live state and persistence

Clients submit commands over HTTP. The server authorizes and validates them, commits
the resulting state, and then notifies connected clients over SSE. Connections carry
authorized snapshots and versioned updates. Reconnection reloads authoritative state;
Poker updates carry full snapshots, so version gaps are safe; older snapshots are ignored.
Periodic snapshots and browser visibility changes reconcile missed updates. Account or room access must be checked on
event streams as well as commands.

One backend process owns `auth.sqlite`, `poker.sqlite`, and `vortoj.sqlite` under
`DATA_DIRECTORY`. Every app and auth owns its table declarations, queries, and
migration history (`migrations/<id>/`). Shared database infrastructure opens files
through better-sqlite3/Drizzle, enables WAL and foreign keys, sets a busy timeout,
and applies migrations. Native-driver binaries are built for the image platform.
Poker owns rooms and participants. Auth owns users, verification codes, and sessions.
Vortoj owns rooms, members, saved tile sets, and command receipts. Its room record holds
an immutable tile-set copy and durable game state; private JSON is never sent directly.

App code does not open or attach another module's file. The backend resolves
sessions through the public in-process auth API and pass stable user IDs to app
services. Apps check their own room/match permissions. User IDs are never reused;
cross-file references cannot use foreign keys. Account deletion must preserve
coherent game history through an explicit policy. No account-deletion API exists yet.
There are no distributed transactions: each game command commits in its own file.
Cross-file operations require explicit coordination when needed, not a generic
service framework. The database boundaries are ownership conventions, not a sandbox.

SQLite holds durable state. Connections and presence can be transient. Online
notifications are not the durable record of a move. Handle subscription/snapshot
races and missed notifications with version checks and reconciliation.

Word-game moves include a unique command ID and expected match version. Acceptance
is atomic so simultaneous submissions, retries, and stale clients cannot duplicate
a move or overwrite another turn. A move history and current match state are stored;
this does not require a general event-sourcing framework.

Unrevealed votes and opponents' tile racks are filtered by the server, not merely
hidden by UI. Poker room membership uses anonymous credentials. A worktree-specific,
HttpOnly guest cookie is scoped to `/api/poker`, SameSite Lax, and Secure in production.
POST requests require the configured origin. Room membership authorizes both reads
and SSE, and every member can reveal/reset the round. Invite links permit joining,
not reading existing votes without membership. Guest identity lasts 30 days from its
last accepted command; clearing cookies loses membership; the participant may rejoin.

Room commands include the expected round. Synchronous SQLite transactions apply
votes, reveal, and reset together with monotonically increasing snapshot versions.
Rooms expire after 30 days without joining, voting, revealing, or resetting. Requests
lazily remove expired rooms and their memberships; views/streams do not extend expiry.
The 50-participant limit and 4 KiB request-body limit bound individual room requests.
SSE subscriptions authorize before opening, subscribe before the initial snapshot,
and use bounded queues with 10-second full-snapshot reconciliation. Shutdown closes
streams before database connections. Expired streams notify clients and close.

Storage readiness blocks poker requests during pending migrations. Expected failures
have actionable messages; unexpected failures return a reference and log error names
and codes without SQL parameters, request bodies, or credentials.

## Custom auth and mail

The auth module owns requesting a code, verifying it, session lookup, and logout.
The mail module owns Mailtrap integration. Apps consume these APIs without handling
verification internals.

- No passwords or password hashes.
- Store a keyed digest of codes; keep the key outside the database.
- Expiring, single-use codes with atomic consumption, attempt limits, and resend throttling.
- Secure random session tokens, protected token storage, expiry, and revocation.
- HttpOnly cookies, Secure in production, SameSite policy, and request-origin protection.
- Never log codes, session credentials, or API secrets.
- Runtime-validated configuration; `AUTH_MODE=local` uses a separate no-op mail implementation
  even if a token is present. Development and disposable test stacks select this mode.
- `AUTH_MODE=test` uses `9999`; a configured token enables Mailtrap delivery even in test mode.
- Public production mode sends random six-digit codes and requires Mailtrap credentials.
- Missing tokens on localhost select test mode without sending. Sandbox delivery is optional
  using a numeric inbox ID. `NODE_ENV` controls runtime/cookie behavior, not auth mode.

Account creation happens on first verification. Shared identity
does not imply access to every app or match; app authorization remains explicit.
Poker has a separate guest flow with no registration requirement.

Codes have ten-minute expiry, five verification attempts, a one-minute resend interval,
and five requests per address per hour. Thirty active addresses per minute bound mail
requests across addresses. Consumption and attempt tracking commit synchronously.
The auth cookie is scoped to `/api`; sessions expire after 30 days and logout revokes
the digest. Auth APIs, game reads and game streams require active sessions; streams
recheck them before sending. Emails never appear in game snapshots.

## Vortoj rules and data

Two to four players join through a room link after sign-in. Membership closes when the
creator starts the game. The creator plays first. Seven tiles are dealt per player on
an empty 15×15 board. Moves must form a connected line, cover the centre on the first
turn, and create words of at least two tiles. New tiles activate letter/word premiums;
playing seven tiles adds 50 points. `*` is a zero-point joker assigned to a letter in
the selected set, fixed when accepted.

All words formed by a move, including cross-words, receive independent opponent votes.
The author cannot vote. Each word needs `ceil(opponents / 2)` approvals: one approval
with two or three players, two with four. A move commits when every word meets its
threshold; it is rejected as soon as any word can no longer meet its threshold.
Rejected moves leave the rack and board unchanged and end the turn. There is no
external word validation, vote timeout, or turn deadline.

Exchanges require seven tiles left in the bag, draw before returned tiles re-enter,
and end the turn. Games end when the bag is empty and a player empties their rack,
or after twice the player count in consecutive scoreless turns. Remaining tile points
are deducted; a player who goes out receives opponents' remaining points.

English/German presets and per-user named custom sets define letters, quantities, and
points. Unicode letters (with combining marks) are normalised to NFC uppercase; `ß`
becomes `ẞ`. Symbols, digits, duplicate letters, and multi-letter tiles are rejected,
except `*` for jokers. Custom sets contain 28–500 tiles, at most 80 different letters,
1–100 copies per letter and 0–20 points per tile; jokers score zero. Users can keep
50 saved sets. Editing/deleting a saved set leaves existing rooms' copies intact.

Synchronous SQLite transactions apply commands with a request ID and expected version.
Repeated IDs with the same body return the current snapshot without applying the action
again. Changed bodies or stale versions are rejected. HTTP/SSE project a viewer's own
rack and opponents' counts; the bag and internal state are private. Game history retains
the latest 100 entries. Streams reconcile every five seconds; client queries/visibility
changes recover missed updates. Pending votes and state persist across backend restarts.

The active room uses a viewport-sized board workspace with a persistent private rack
and move controls. Small screens begin in overview, then zoom to 44-pixel squares for
panning and placement. Accepted moves restore overview. A `ResizeObserver` sizes the
board from the available space; sufficiently large screens support direct placement
without zoom controls. Wider screens place the rack beside the board. Camera changes
are client-only and preserve draft placements. Scores/history, extra actions, joker
letters and word approval use native dialogs; opponents can dismiss approval to
inspect the board and reopen it from the rack area.

## Styles and browser storage

Drochsign is vendored as an unmodified snapshot in `shared/src/styles/drochsign.css`;
its revision and update process are recorded in `UPSTREAM.md`. Integration overrides
are separate in `index.css`. Use its semantic styles and two-color theme variables. Each app has its own
default theme and may add theme definitions and styles for specialized UI.

Adapt direct-body layout selectors to the Solid mount structure, scope field-specific
alert visibility rules, and extend reduced-motion handling to all animations. Preserve
the semantic design approach; avoid introducing a CSS framework by default.

Shared storage helpers automatically prefix app keys and implement app-only deletion.
Theme choices are app-specific. Poker and Vortoj keep their theme pickers in a shared, header-accessible
native Settings dialog, with keyboard focus management and Escape dismissal.
The Custom option edits background/foreground colors and selects a local font stack
(system sans-serif, serif, or monospace). Changes preview immediately and save as
validated preferences under the app storage prefix. Preset hex shorthand from production
CSS minification is expanded to six digits when initializing the color inputs. Older color-only preferences
keep their colors and use system sans-serif. Foreground covers text,
borders, and button fills; button text uses the background color. Native controls get
a light/dark color scheme derived from the custom background. Preset selection removes
custom color/font inline overrides; saved customization remains available for later use. Direct `localStorage.clear()` is forbidden in app code.
Prefixes prevent collisions but do not isolate same-origin apps from each other.

## Compose, production, and migrations

One Compose stack has a migration step and one application container, sharing a
persistent `sqlite-data` volume at `/data`. The image includes the shared backend,
all compiled frontends, and its native SQLite driver. No database service, password,
or connection pool is needed. Adding an app creates another file within this volume.

Coolify uses the Git repository's Docker Compose build pack with `compose.yaml`.
Its proxy routes one HTTPS domain to `application` on internal port 3000; the
production definition does not publish a host port. The public `APP_ORIGIN` must
match the browser origin exactly. The development override publishes an allocated
loopback port. See the README for the one-time Coolify configuration.

Successful migration completion gates startup. The server opens only existing
files, and readiness checks every file against its own migration history. Failed
migrations block startup; each file's SQL migrations are transactional. Commit and
review SQL migrations; never use automatic schema push in production. Compatible
migration sequencing still matters; rolling back an image does not roll back data.

Run one backend instance with local persistent storage. Keep transactions short;
SQLite serializes writers per file while WAL lets reads proceed alongside writes.
The application database folder is owned by the same non-root user in development
and production. Development startup repairs ownership on container volumes only.

Backup/restore must cover auth and all app files coherently. Stop the stack for an
offline backup of the whole volume; copying a live main file alone can omit WAL data.
A documented and tested automated backup/restore procedure remains a later milestone.

## Worktree development

Each checkout runs an independent full stack. The development entry point derives
a stable ID from the canonical checkout path, allocates available host ports, and
prints its URL. Local runtime settings are ignored, never committed.

- Unique Compose project ID, network, volumes, and database per worktree.
- No fixed container names or globally named volumes.
- Isolated node_modules links, build outputs, caches, test state, and configuration.
- The package manager's immutable dependency store may be shared.
- SQLite files stay on a per-checkout Docker volume, separate from source bind mounts.
- Different host ports isolate browser storage; cookies need distinct worktree names
  because cookies are not port-scoped.
- Pass the runtime origin into auth and development proxy/HMR configuration.
- Both app frontends reload through Vite middleware on the backend port; backend
  imports are watched by tsx. Polling supports Docker bind mounts on macOS.
- Stop commands affect only the current checkout and preserve its database.

Use the same migrations and database conventions locally and in production. The
development Compose override adds source mounts and hot reload.
