# Implementation plan

Milestones 1–5 have implemented gameplay/account slices; verification details are recorded below.
Account lifecycle operations and deployment recovery work remain pending. See [architecture](architecture.md) and
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

- Build frontend shells at `/poker/` and `/vortoj/` with a shared typed registry.
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
Auth/session isolation is covered with real server-side sessions and independently named cookies.

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

## 4. Custom email-code accounts — implemented

- Shared in-process auth API: request, verify, session lookup, and logout.
- Keyed code digests, atomic one-use consumption, expiry, attempt/resend limits;
  hashed random session credentials and origin-protected HttpOnly cookies.
- Separate no-op local mail implementation; local/test code `9999`. Preview Mailtrap
  delivery still uses `9999`; production delivers random six-digit codes.
- Explicit runtime auth mode, sender/token configuration and optional Mailtrap Sandbox.
- Accounts are created on first successful verification. No password functionality.

Remaining: account deletion/email-change policy and coordinated app-data cleanup.
Real Mailtrap delivery needs credentials and sender verification in Coolify.

## 5. Vortoj gameplay — implemented

- Two to four authenticated players, room links, durable membership and private racks.
- Fifteen-square board, bonuses, scoring, jokers, passing, exchanges and game completion.
- Every formed word receives opponent votes; no dictionary dependency or turn deadline.
- German/English presets and per-user saved custom tile sets, copied into each room.
- Atomic command IDs and expected versions; viewer-specific HTTP/SSE snapshots,
  periodic reconciliation, restart persistence and game history.
- Browser account flow, room lobby, tile editor, interactive board, rack, word approval,
  final scores, reconnect messages and shared theme Settings.
- Feature-local typed model/message/update/command flows for accounts, tile editing
  and room/lobby interaction; transition and browser tests cover stale responses, pending
  editor identity, removal, mutually exclusive move modes and input focus. Use this
  style from the start for future features with coupled or asynchronous state.

Verification: unit/integration coverage exercises scoring and premiums, connected
placements, cross-words, Unicode sets and joker restrictions, approval thresholds for
all player counts, rejection/turn changes, stale and duplicate commands, rollback,
set ownership/copying, session expiry/revocation and HTTP/SSE rack privacy. Tests use
real SQLite migrations and reopening durable files.

Verification completed: `pnpm check` passes strict type checking, import-boundary lint,
formatting and **92 tests** across 12 files. All **nine Playwright checks** pass against
both the development stack and the production Docker image. The new two-context flow
covers local `9999` sign-in, saving/using a custom set, room invitations, private racks,
accepted/rejected words, reload recovery and logout. A scoped production-container
restart also preserves both sessions, private racks and pending word votes; repeated
command IDs remain safe after recovery. The desktop browser's full game view is inspected.
The chosen mobile board design keeps the rack visible, supports overview/zoom/panning,
returns to overview after accepted words, and places directly when the whole board
fits. A phone regression covers 375×667, 320×568 and 667×375 layouts, joker selection,
private racks, approval, exchange/pass dialogs, final scores and preserving drafts across desktop
resizing. That flow also passes with WebKit against the development stack.
Local production testing uses HTTP; WebKit does not accept its Secure session cookie,
so the production WebKit account flow requires an HTTPS test origin. The standalone explorations are removed.
Real Mailtrap delivery and streaming through Coolify still need deployment verification.

## 6. Deployment verification and future-app workflow

- Keep extending the implemented scoped CI/browser checks as apps grow.
- Document the one-time Coolify/domain/Mailtrap setup, backups, and restore procedure.
- Add a small app scaffold command using the chosen package layout and registry.
- Verify a temporary third app builds and mounts without Compose, DNS, or Coolify edits.
- Verify streaming and reconnect through the production proxy.

Acceptance: one deployable Compose stack, tested recovery, reproducible tool versions,
and documented app creation requiring only repository changes and deployment.
