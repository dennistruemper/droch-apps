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

App scope, acceptance criteria and historical verification are recorded in
[Poker's implementation status](../apps/poker/docs/implementation-plan.md).

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

App scope, acceptance criteria and historical verification are recorded in
[Vortoj's implementation status](../apps/vortoj/docs/implementation-plan.md).

## 6. Deployment verification and future-app workflow

- Keep extending the implemented scoped CI/browser checks as apps grow.
- Document the one-time Coolify/domain/Mailtrap setup, backups, and restore procedure.
- Add a small app scaffold command using the chosen package layout and registry.
- Verify a temporary third app builds and mounts without Compose, DNS, or Coolify edits.
- Verify streaming and reconnect through the production proxy.
- Preview server startup selects the runtime generated service URL before a stale
  saved production origin; a Compose-only mapping did not fix hosted room creation.
  Configuration tests cover preview, production, local fallback, missing/empty and
  invalid service URLs. The production image passes all nine browser checks; with
  a stale production APP_ORIGIN and a preview SERVICE_URL_APPLICATION, it creates
  rooms and accepts votes for the preview origin while rejecting production and
  foreign origins. Verify room creation on the redeployed hosted preview.

Acceptance: one deployable Compose stack, tested recovery, reproducible tool versions,
and documented app creation requiring only repository changes and deployment.

## Other app implementation status

- [Schlezaz](../apps/schlezaz/docs/implementation-plan.md)
- [Observo](../apps/observo/docs/implementation-plan.md)
- [Enigmo](../apps/enigmo/docs/implementation-plan.md)

- [Kunludo](../apps/kunludo/docs/implementation-plan.md)

## Shared system appearance — implemented

All six app definitions declare light/dark defaults. Shared AppAppearance applies
system appearance on startup and live changes, while preserving explicit stored
choices. Existing Settings pickers offer System to resume automatic selection.
Custom palette/font handling and app-scoped preferences remain central.

## Anti-slop lint adoption — implemented

- Vendored rules are integrated with the existing Oxlint checks.
- After architecture review, nine generic rules remain enabled; see decisions.md.
- Applied readable-spacing autofixes; existing source changed only in whitespace
  during that step. No spacing violations remain after formatting.
- Resolved all 39 assertion diagnostics through runtime narrowing, schema parsing,
  `satisfies`, typed browser hooks, and specific comments for necessary casts.
- `pnpm check` passes type checking, lint, formatting, and all 145 tests. The
  production build passes. All 28 Chromium browser tests pass against a separate
  local server/database (25 initially, then three requiring local auth metadata).
  The attention-mode experiment also passes a separate strict TypeScript check.

The initial full-ruleset scan of committed base `2848478` reported 1,449
diagnostics, including 1,362 spacing findings. That selected anti-slop configuration reported zero diagnostics across 81
scanned files before the additional checks below were enabled. The original checkout's
uncommitted work is outside this scan. Deployment was not performed.

## Additional Oxlint checks — implemented

- Activated all eleven recommended checks and type-aware linting, retaining the
  correctness category and its typed/Vitest defaults.
- Resolved all 36 diagnostics from the initial expansion scan.
- Union switches enumerate every message variant explicitly. Existing tests
  preserve pending-state guards, late-response rejection, and immutable updates.
- DOM adapters launch async operations explicitly; the existing error-handling
  paths remain in their effect functions. Narrow FormData and FileReader values
  before text use, bind browser-stub methods, and type test mocks.
- Test assertions specify errors and sort semantics; delayed mail failures are
  captured immediately and asserted after the race is triggered.
- Full pnpm check passes type checking, lint, formatting, and all 145 tests. The
  production build and a separate strict attention-mode experiment type check
  also pass. All 28 Chromium browser tests pass against fresh isolated local
  databases, including recovery, stale responses, and pending-state guards.

The existing CI pnpm check command includes the new rules automatically.

## PR integration on current main

Rebased the lint changes onto main `678167e`, preserving its shared account naming,
app appearance defaults, half-point Poker option, and added apps. Applied the
same lint policy to that complete tree, including explicit message cases in
Kunludo/Schlezaz and narrow typed browser/store seams in Observo tests.
`pnpm check` passes with zero lint findings and 234 tests across 30 files; the
production build passes for all registered apps. All 47 browser checks were
verified (46 in the full suite, followed by the corrected calendar-race check).

## CI Docker cache experiment — in progress

Evaluate persistent Buildx layer caching in a draft PR with five sequential CI
runs (one cache-populating run and four empty-commit repeats). Record image build,
Buildx setup, E2E, and complete job times, plus cache hits. The reference uncached
run is [43772356956](https://github.com/dennistruemper/droch-apps/actions/runs/43772356956):
81 seconds for the image step and 187 seconds for the job. Keep the Dockerfile,
production test stack, and browser coverage unchanged.
