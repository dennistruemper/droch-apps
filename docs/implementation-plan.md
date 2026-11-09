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
