# Architecture

Shared infrastructure and email-code accounts are implemented. App behavior and
verification history live in the app directories:

- [Poker](../apps/poker/AGENTS.md)
- [Vortoj](../apps/vortoj/AGENTS.md)
- [Schlezaz](../apps/schlezaz/AGENTS.md)
- [Observo](../apps/observo/AGENTS.md)
- [Enigmo](../apps/enigmo/AGENTS.md)

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
  <app>/                 # one workspace package per app
    AGENTS.md            # scoped contributor rules and local doc links
    docs/                # app architecture, decisions and implementation status
    src/client/
    src/server/          # optional; browser-only apps omit server/storage
    src/contracts/
    src/domain/
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

New client features with coupled state or asynchronous workflows use feature-local
typed models, discriminated messages and pure updates returning models and explicit
commands. Adapters execute effects and validate responses. Synchronous dispatch,
request IDs and server versions guard ordering, stale completions and disposal.
Simple independent controls and browser layout state can stay local to the view.
See [the contributor rules](../AGENTS.md#client-state-style) for the shared policy
and [Vortoj's examples](../apps/vortoj/docs/architecture.md#client-state-reference-implementations)
when an implementation reference is needed.

## Routing and adding apps

```text
/<app>/          app frontend
/api/auth/       shared account API
/api/<app>/      optional app commands, queries and event stream
```

One domain and one application ingress. A typed registry supplies app IDs, URL
prefixes, and frontend build locations. Explicit server registration lives in one
composition file. Build and static-serving configuration derive from registration
rather than maintaining separate app lists.
Registry entries without server routes still participate in builds and hosting,
but do not provision a database, migrations or accounts. Only persisted apps own
SQLite files. Consult the registry for the current app inventory.

Each frontend configures its router and asset base for its prefix. SPA fallbacks are
scoped to the appropriate app. Unknown app paths, API endpoints, and missing assets
return errors rather than unrelated HTML.

Adding an app changes repository code and registration only, followed by deployment.
No extra DNS, domains, Coolify resources, or per-app ingress rules.

## Live state and persistence

Clients submit commands over HTTP. The server authorizes and validates them, commits
the resulting state, and then notifies connected clients over SSE. Connections carry
authorized snapshots and versioned updates. Reconnection reloads authoritative state.
Periodic snapshots and browser visibility changes reconcile missed updates. Account or room access must be checked on
event streams as well as commands.

One backend process owns `auth.sqlite` and each persisted app's `<app>.sqlite` under
`DATA_DIRECTORY`. Every persisted app and auth owns its table declarations, queries, and
migration history (`migrations/<id>/`). Shared database infrastructure opens files
through better-sqlite3/Drizzle, enables WAL and foreign keys, sets a busy timeout,
and applies migrations. Native-driver binaries are built for the image platform.
Auth owns users, verification codes, and sessions. App-specific table ownership
is documented in each app's architecture.

App code does not open or attach another module's file. The backend resolves
sessions through the public in-process auth API and passes stable user IDs to app
services. Apps check their own room/match permissions. User IDs are never reused;
cross-file references cannot use foreign keys. Account deletion must preserve
coherent game history through an explicit policy. No account-deletion API exists yet.
There are no distributed transactions: each game command commits in its own file.
Cross-file operations require explicit coordination when needed, not a generic
service framework. The database boundaries are ownership conventions, not a sandbox.

SQLite holds durable state. Connections and presence can be transient. Online
notifications are not the durable record of a move. Handle subscription/snapshot
races and missed notifications with version checks and reconciliation.

Private app state is filtered by the server for every HTTP and SSE payload.
Storage readiness blocks app requests during pending migrations. Expected failures
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

Codes have ten-minute expiry, five verification attempts, a one-minute resend interval,
and five requests per address per hour. Thirty active addresses per minute bound mail
requests across addresses. Failed deliveries invalidate the code but retain all resend
and hourly/global throttling records. Consumption and attempt tracking commit synchronously.
The auth cookie is scoped to `/api`; sessions expire after 30 days and logout revokes
the digest. Auth APIs requiring an account check active sessions. Account-based apps also
authorize reads and streams and recheck sessions before sending. Emails never
appear in game snapshots.

## Styles and browser storage

Drochsign is vendored as an unmodified snapshot in `shared/src/styles/drochsign.css`;
its revision and update process are recorded in `UPSTREAM.md`. Integration overrides
are separate in `index.css`. Use its semantic styles and two-color theme variables. Each app has its own
default theme and may add theme definitions and styles for specialized UI.
Saved per-app theme choices take precedence over the app default.

Adapt direct-body layout selectors to the Solid mount structure, scope field-specific
alert visibility rules, and extend reduced-motion handling to all animations. Preserve
the semantic design approach; avoid introducing a CSS framework by default.

Shared storage helpers automatically prefix app keys and implement app-only deletion.
Theme choices are app-specific. Apps host the shared native Settings dialog,
with keyboard focus management and Escape dismissal, in their own navigation.
The browser-safe `@repo/shared/navigation` SidePanel provides a native modal drawer
below 1280px and a nonmodal 240px desktop column. Apps own navigation content.
Desktop collapse is remembered under the app-prefixed `side-panel` preference;
mobile starts closed. Native focus containment, Escape and backdrop dismissal
restore focus to the toggle. Resizing changes modes without persisting mobile state.
The outlined toggle morphs between burger and X, respecting reduced motion;
the separate drawer close button appears only on mobile.
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
or connection pool is needed. Adding a persisted app creates another file within this volume.

Coolify uses the Git repository's Docker Compose build pack with `compose.yaml`.
Its proxy routes one HTTPS domain to `application` on internal port 3000; the
production definition does not publish a host port. The backend uses the runtime
`SERVICE_URL_APPLICATION` supplied by Coolify as its canonical origin; outside
Coolify or when the generated value is empty it uses `APP_ORIGIN`. This avoids an alias resolving to the production URL
in a preview. The selected value must be one HTTP(S) origin matching the browser
exactly; malformed generated URLs fail startup rather than falling back. Request
headers and Coolify's comma-separated domain list do not set the trusted origin.
The development override publishes an allocated loopback port. See the README for the one-time Coolify configuration.

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
- App frontends reload through Vite middleware on the backend port; backend
  imports are watched by tsx. Polling supports Docker bind mounts on macOS.
- Stop commands affect only the current checkout and preserve its database.

Use the same migrations and database conventions locally and in production. The
development Compose override adds source mounts and hot reload.
