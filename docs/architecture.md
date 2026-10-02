# Architecture

Target architecture; nothing described here has been implemented yet.
See [decisions](decisions.md) for fixed choices versus proposed defaults.

## Stack

| Area | Target |
| --- | --- |
| Tools | mise, Node 24 LTS, pnpm workspaces |
| Frontend | Solid 2, Vite, official Solid 2 plugin, Solid Router 2 |
| Styling | Drochsign plus app themes and small app-specific CSS |
| Backend | Hono on Node, one modular server |
| Contracts | Zod schemas and inferred TypeScript types |
| Persistence | PostgreSQL, Drizzle, committed SQL migrations |
| Accounts | Custom email-code auth, Mailtrap, database-backed sessions |
| Live updates | HTTP commands and SSE |
| Quality | Strict TypeScript, Oxlint, Oxfmt, Vitest, Playwright |
| Deployment | Docker Compose in Coolify |

Pin exact compatible versions during setup. Compilation and type checking are
separate; deployment verification requires both.

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
  src/auth/
  src/mail/
  src/database/
  src/storage/
  src/styles/
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
version gaps trigger resynchronization. Account or room access must be checked on
event streams as well as commands.

PostgreSQL holds durable state. Connections and presence can be transient. Online
notifications are not the durable record of a move. Handle subscription/snapshot
races and missed notifications with version checks and reconciliation.

Word-game moves include a unique command ID and expected match version. Acceptance
is atomic so simultaneous submissions, retries, and stale clients cannot duplicate
a move or overwrite another turn. A move history and current match state are stored;
this does not require a general event-sourcing framework.

Unrevealed votes and opponents' tile racks are filtered by the server, not merely
hidden by UI. Poker room membership and host control use anonymous credentials.

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

Use Drochsign's semantic styles and two-color theme variables. Each app has its own
default theme and may add theme definitions and styles for specialized UI.

Adapt direct-body layout selectors to the Solid mount structure, scope field-specific
alert visibility rules, and extend reduced-motion handling to all animations. Preserve
the semantic design approach; avoid introducing a CSS framework by default.

Shared storage helpers automatically prefix app keys and implement app-only deletion.
Theme choices are app-specific. Direct `localStorage.clear()` is forbidden in app code.
Prefixes prevent collisions but do not isolate same-origin apps from each other.

## Compose, production, and migrations

One Compose stack has PostgreSQL, a migration step, and one application container.
The application image includes the shared backend and all compiled frontends.
Only the application ingress is public; PostgreSQL communicates on the stack network.

Use a persistent database volume, health checks, graceful shutdown, and migration
completion before readiness. Failed migrations must prevent application startup.
Commit and review SQL migrations; do not use automatic schema push in production.
Prefer compatible migration sequencing; rolling back an image does not roll back data.
Backups require a documented and tested restore process.

## Worktree development

Each checkout runs an independent full stack. The development entry point derives
a stable ID from the canonical checkout path, allocates available host ports, and
prints its URL. Local runtime settings are ignored, never committed.

- Unique Compose project ID, network, volumes, and database per worktree.
- No fixed container names or globally named volumes.
- Isolated node_modules links, build outputs, caches, test state, and configuration.
- The package manager's immutable dependency store may be shared.
- PostgreSQL stays internal; containers can use identical internal ports.
- Different host ports isolate browser storage; cookies need distinct worktree names
  because cookies are not port-scoped.
- Pass the runtime origin into auth and development proxy/HMR configuration.
- Support focusing frontend hot reload on a selected app while running the shared backend.
- Stop commands affect only the current checkout and preserve its database.

Use the same migrations and database conventions locally and in production. The
development Compose override adds source mounts and hot reload.
