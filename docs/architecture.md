# Architecture

The foundation and poker gameplay with SSE are implemented. Auth and the word game
below describe the remaining target behavior.
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
11.25.0 are pinned in mise and Docker; CI reads the Node version from mise.
Solid 2.0.0-rc.13, its official plugin, and Router 2 compile and run together.
Compilation and type checking are separate; deployment verification requires both.

Host/CI `pnpm check` enforces the custom Oxlint boundary rule and its rejection
fixtures. The image build runs type checking and compilation. Oxlint JS plugins
hit [a Linux allocator bug](https://github.com/oxc-project/oxc/issues/20331) on the
small local Docker VM; do not remove boundary enforcement to work around it.

## Layout and dependency direction

```text
apps/
  poker/                 # one workspace package
    src/client/
    src/server/
    src/contracts/
    src/domain/
  words/                 # same internal structure
server/                  # backend entry point, app registration, composition
shared/
  src/auth/              # schema location; API implementation planned
  src/mail/              # planned
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
Expected failures use discriminated unions; runtime schemas validate external data.

## Routing and adding apps

```text
/poker/          poker frontend
/words/          word-game frontend
/api/auth/       shared account API
/api/poker/      poker commands, queries, and event stream
/api/words/      word-game commands, queries, and event stream
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

One backend process owns `auth.sqlite`, `poker.sqlite`, and `words.sqlite` under
`DATA_DIRECTORY`. Every app and auth owns its table declarations, queries, and
migration history (`migrations/<id>/`). Shared database infrastructure opens files
through better-sqlite3/Drizzle, enables WAL and foreign keys, sets a busy timeout,
and applies migrations. Native-driver binaries are built for the image platform.
Poker migrations create rooms and participants. Empty auth/word histories initialize
the files without inventing application tables.

App code does not open or attach another module's file. The backend will resolve
sessions through the public in-process auth API and pass stable user IDs to app
services. Apps check their own room/match permissions. User IDs are never reused;
cross-file references cannot use foreign keys. Account deletion must preserve
coherent game history through an explicit policy, settled before auth implementation.
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
- Runtime-validated configuration; Mailtrap Sandbox in development and sending API in production.

Account creation on first verification is the proposed baseline. Shared identity
does not imply access to every app or match; app authorization remains explicit.
Poker has a separate guest flow with no registration requirement.

## Styles and browser storage

Drochsign is vendored as an unmodified snapshot in `shared/src/styles/drochsign.css`;
its revision and update process are recorded in `UPSTREAM.md`. Integration overrides
are separate in `index.css`. Use its semantic styles and two-color theme variables. Each app has its own
default theme and may add theme definitions and styles for specialized UI.

Adapt direct-body layout selectors to the Solid mount structure, scope field-specific
alert visibility rules, and extend reduced-motion handling to all animations. Preserve
the semantic design approach; avoid introducing a CSS framework by default.

Shared storage helpers automatically prefix app keys and implement app-only deletion.
Theme choices are app-specific. Poker and Words keep their theme pickers in a shared, header-accessible
native Settings dialog, with keyboard focus management and Escape dismissal.
The Custom option edits background/foreground colors and selects a local font stack
(system sans-serif, serif, or monospace). Changes preview immediately and save as
validated preferences under the app storage prefix. Older color-only preferences
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
