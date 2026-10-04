# Implementation plan

Milestones 1–3 are implemented; verification details are recorded below.
Auth, the word game, and deployment operations remain pending. See [architecture](architecture.md) and
[decisions](decisions.md).

## 1. Foundation — implemented

- Add mise pins for Node and pnpm, workspace manifests, and the lockfile.
- Create one package per app plus server composition and shared modules.
- Configure strict TypeScript, Solid 2 compilation, Oxlint, Oxfmt, and Vitest.
- Add explicit exports and resolved module-boundary enforcement.
- Add root commands for development, checks, tests, builds, and migrations.
- Integrate Drochsign after deciding how to consume and update it.

Acceptance: type checking and builds pass; forbidden import fixtures fail, including
cross-module relative imports and client-to-server imports within an app package.

## 2. Runnable shells and isolated development — implemented

- Build frontend shells at `/poker/` and `/words/` with a shared typed registry.
- Create the Hono composition server, static serving, and scoped SPA fallbacks.
- Add SQLite/Drizzle per app and auth, migration execution, production Compose, and dev overrides.
- Add worktree-specific resource IDs, port allocation, cookies, and startup URLs.
- Match tool versions between development, CI, and Docker.

Acceptance: production image and local hot reload work. Two worktrees run at once
without sharing databases, sessions, ports, outputs, or cleanup scope. Restarting
one leaves the other functional. Failed migrations block startup. API and asset
404s are not converted into SPA HTML.

Verification: strict type checking, Oxlint, formatting, and 35 tests pass, including SQLite file isolation, persistence, foreign keys,
transaction rollback, migration reruns, and readiness. The
forbidden-import tests run the actual Oxlint rule, including type-only imports,
re-exports, dynamic imports, require, relative bypasses, and client/server boundaries.
The production image bundles the backend and includes its platform-specific SQLite native driver. Playwright
checks both development and production shells, app-specific themes, navigation,
and API/asset 404s. Frontend/backend reload and concurrent-checkout isolation are
verified manually. A deliberately failed migration leaves the application unstarted;
reapplying the production migration is safe. CI configuration is added; the hosted run has not happened yet.
Auth/session isolation currently verifies distinct configured cookie names; real
session behavior must be tested when auth is implemented.

## 3. Poker vertical slice — implemented

- Implement room creation, invite links, anonymous membership, voting, reveal, and reset.
- Separate pure rules from server persistence and participant authorization.
- Persist rooms and participant identities; add an agreed inactive-room expiry policy.
- Add SSE, snapshots, versioning, reconnect, and missed-update reconciliation.

Acceptance: two browser contexts complete rounds, recover after restart, and never
receive another player's unrevealed vote. People outside a room cannot reveal or reset a round. Every joined participant
can control rounds even when the creator disconnects.

Verification: 42 unit/integration tests pass across the project. Poker tests use the
actual SQL migration and cover HTTP/SSE vote privacy, membership, collaborative round control,
origin checks, body limits, stale votes, concurrent/repeated resets, empty reveals,
30-day expiry and cascading deletion, repeated joins, useful failures, and reopening
the database after restart. Seven Playwright checks pass in development, including
two independent browser contexts completing rounds, reload, offline reconnect, and
error/retry behavior, shared Settings accessibility, independent custom app colors/fonts, old preference compatibility, preset restoration, and default room names. A real development-container restart preserves guest identity,
private votes, and room controls. Desktop/mobile views are inspected. Production
image build and local browser checks verify the bundled slice; streaming through
Coolify's external proxy remains part of milestone 6.

## 4. Custom email-code accounts

- Implement Mailtrap sending and development Sandbox configuration.
- Add focused auth APIs, verification records, accounts, and server-side sessions.
- Implement code expiry, keyed digests, atomic consumption, throttling, and revocation.
- Keep auth queries in the auth module and use stable user IDs through its public API.
- Settle account deletion and app-data cleanup across independent SQLite files.
- Document environment setup without committing credentials.

Acceptance: login works end to end; expiry, attempt limits, resend behavior,
concurrent verification, code reuse, logout, origin protection, and worktree session
separation are tested. No password functionality exists.

## 5. Word-game slice

- Settle dictionary language/licensing and rules before implementation.
- Implement invitations, membership, racks, board, validation, and scoring.
- Add passing, exchanging, match completion, durable history, and no turn deadline.
- Use transactional command IDs and match versions for duplicate/stale submissions.
- Reuse live-update infrastructure while keeping domain and authorization rules app-specific.

Acceptance: players can play together or resume after days. Concurrent and retried
commands cannot apply duplicate turns. Opponents' private rack data is never sent.
Restart and reconnect preserve the authoritative match.

## 6. Deployment verification and future-app workflow

- Extend foundation CI and browser checks with scoped checks and multiplayer tests.
- Document the one-time Coolify/domain/Mailtrap setup, backups, and restore procedure.
- Add a small app scaffold command using the chosen package layout and registry.
- Verify a temporary third app builds and mounts without Compose, DNS, or Coolify edits.
- Verify streaming and reconnect through the production proxy.

Acceptance: one deployable Compose stack, tested recovery, reproducible tool versions,
and documented app creation requiring only repository changes and deployment.
