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

### Attention mode — implemented

Poker Settings includes an optional, per-browser Attention mode. Nine locally
rendered Canvas scenes from `experiments/attention-mode/` are included; the owner
excluded the olive machine. Two scenes surround voting on wide screens. On narrower screens, three distinct
scenes appear above the participants, between the table and estimate controls, and
below round controls. A new group is chosen after 60 visible seconds without
immediately repeating an outgoing scene. Reduced-motion preference
keeps the scenes static, hidden/offscreen scenes pause, and disabling the setting
cleans up animation work. The isolated ten-effect experiment and its twelve-second
comparison videos remain a reference, separate from the production bundle.

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
- Preview server startup selects the runtime generated service URL before a stale
  saved production origin; a Compose-only mapping did not fix hosted room creation.
  Configuration tests cover preview, production, local fallback, missing/empty and
  invalid service URLs. The production image passes all nine browser checks; with
  a stale production APP_ORIGIN and a preview SERVICE_URL_APPLICATION, it creates
  rooms and accepts votes for the preview origin while rejecting production and
  foreign origins. Verify room creation on the redeployed hosted preview.

Acceptance: one deployable Compose stack, tested recovery, reproducible tool versions,
and documented app creation requiring only repository changes and deployment.

## Schlezaz port — implemented

- TypeScript/Solid frontend at `/schlezaz/` with German copy and five generator modes.
- Follow the source PLAN.md: repeat pairs, standard random, wrapping fourth choice,
  shuffle cycles and one randomly selected concrete mode per Random-Random draw.
- Pure rules and feature-local model/message/command transitions; explicit browser
  randomness and timers, stable input rows and disposal-safe callbacks.
- Common registry hosting/builds without unused backend storage or account setup.
- Cover sequence rules, stale callbacks, option edits and desktop/mobile browser flows.

Saved/shared generators, usage statistics, sound and export remain optional future
ideas from the source plan; the original app did not implement them.

Verification: `pnpm check` passes type checking, boundary lint, formatting and 153
unit/integration tests. The production image builds and starts through the isolated
Compose migration gate on Colima. Its Schlezaz desktop/mobile browser flow passes.
The full production browser suite passed 28 checks; one Vortoj phone-board check
encountered a socket disconnect and passed when rerun alone. Container logs show
normal startup with no application error. Desktop/mobile Schlezaz views were
inspected, with no browser errors. Hosted preview verification remains to be done.

## Observo website monitoring

- Public dashboard and read-only API, code-defined targets, no account/admin workflow.
- First target: Rendsburg-Eckernförde TischtennisLive. Check real league navigation
  and populated standings using Chromium, including the current confirmation form.
- Five-minute scheduler in the existing backend; durable immutable slots, migration
  readiness, restart recovery, bounded sequential work and cancellation on shutdown.
- Dedicated SQLite file/migrations, one compact row per hour, latest diagnostics only,
  automatic 30-day retention, and cleanup for deconfigured sites.
- Theme-following hourly grid with quiet status accents, five-minute drill-down,
  local calendar days, mobile date expansion and feature-local client transitions.
- Persistent first-visit activation in every environment, latest-check current status,
  two-minute automatic data refresh and no footer or manual refresh control.
- Verify aggregation thresholds, privacy/public reads, duplicate/late results, pruning,
  scheduler recovery, a realistic local browser fixture, mobile layout and themes.

Implemented and verified locally: `pnpm check` passes type checking, boundaries,
formatting and 178 tests in the isolated Observo worktree. Targeted Playwright checks
cover the 30-day grid, two-minute automatic recovery, fresh/current/stale states,
mobile layout, light/dark/custom-red themes, app shells, and a realistic browser-check
fixture. Seven targeted browser checks pass for Observo, themes and existing shells. Calendar
tests cover Berlin clock changes and UTC bucket reassembly in fractional timezones.
Activation tests prove reads remain dormant, concurrent visits start one check,
activation survives database reopening and retention, and the test hard-off stays off.
Checker deadline tests distinguish failed timeouts from crashes, launch failures and
shutdown cancellation (including cancellation racing with the deadline).
All four apps build. Hosted checker access was previously verified successfully;
verify the updated dashboard after deployment.

## Enigmo

- Browser-only app with a minimal code-entry page and direct `?code=` QR targets.
- Repository-authored typed puzzles, with the first nine-question `YMIR` puzzle.
- Letter-labelled choices contribute an anagram of GARNERING; final task and an
  indirect offline treasure-master clue follow the user's Magic/yarn wordplay.
- Freely editable questions, fixed bottom letter strip with underscores, local
  versioned saves and final-only validation without attempt limits or deadlines.
- Verify content invariants, recovery from invalid/unavailable storage, correction
  after failed validation, URL entry, reload and narrow-screen browser flow.

Implemented and verified on current main: `pnpm check` passes type checking,
boundaries, formatting and all 184 tests; `pnpm build` builds all five apps and
the server. Both Enigmo Playwright checks and both foundation checks pass against
the bundled production server with installed Chrome. The local runtime uses the
same Playwright package layout as the production image. Coverage includes code
entry, answer correction, reload, final validation, corrupt/blocked storage,
320/375/1280px layouts, existing app themes and API/asset 404s. Desktop/mobile
screenshots were inspected during implementation. Deployment is not performed.

## Kunludo — implemented

- `/kunludo/`: German responsive planner, existing styles/settings/side panel,
  shared email-code auth and first-login-only display name reused in every team.
- Create teams without personal-name fields; creator is the authenticated first
  admin. Independent teams and unlimited memberships across clubs/categories.
- Shared permanent group ID plus six-character alphanumeric PIN; explicit joining,
  admin promotion/removal and last-admin protection. Removal atomically rotates the
  PIN and revokes only that team's access; logout preserves PINs/memberships.
- Combined chronological schedule with no selected teams meaning all; one/many
  team filters, own availability, response lists/readiness and past games.
- Buffer-aware same-day/overlap warnings, separate binding commitments, choices
  across filtered-out teams, generic private-team status and transactional conflict
  handling. Rescheduling/cancellation/removal release invalid commitments and require
  reconfirmation; exact-time polls and linked-account reserves are included.
- Manual per-team iCalendar file import with source-name confirmation, selection,
  new/existing/changed preview, UID deduplication and reviewed re-import updates.
  No TT-Live discovery, remote fetching or automatic synchronization. Real third/
  fourth Rendsburger TSV calendars (20 games each) are scheduling-only test fixtures.
- Dedicated Drizzle/SQLite migration history, runtime validation, scoped admin code
  disclosure, encrypted/HMAC PIN storage, durable joining throttles, versioned SSE,
  idempotent commands, safe uncertain-write retries and stale-result/editor guards.

Verification: `pnpm check` passes type checking, boundaries, formatting and 200
unit/integration tests. `pnpm build` and the production Docker image build pass.
All 33 existing browser regression checks passed against the production stack.
All four planner checks pass against the corrected production image, including
invitation sign-in context, real imports/filtering, cross-club joining and admin
removal/PIN rotation, mobile conflict/poll/reschedule flow, uncertain-write retry,
320px layout and theme persistence. Desktop/mobile captures are inspected.
Production-container restart preserves sessions, membership, committed responses
and the same join code; migrations rerun safely on the isolated persistent volume.

The recorded standard workflows are in `e2e/kunludo.spec.ts`; videos and
screenshots are generated under ignored `test-results/`. Delivery copies are kept
in `.local/demos/`. Local preview/test infrastructure uses this checkout's own
ports, cookies, databases, dependency installation and Docker project/volume.
The original checkout is untouched. No deployment or real invitation email was sent.
Hosted email delivery/proxy verification remains a deployment task, not a local
implementation check. See [source analysis and decisions](kunludo-plan.md).

## Shared system appearance — implemented

All six app definitions declare light/dark defaults. Shared AppAppearance applies
system appearance on startup and live changes, while preserving explicit stored
choices. Existing Settings pickers offer System to resume automatic selection.
Custom palette/font handling and app-scoped preferences remain central.

## Kunludo review regressions — fixed

Tests first reproduced explicit calendar cancellations becoming active games,
invalid/out-of-order file selections retaining an older import, and delayed PIN
responses surviving rotation (three unit/service failures and two browser failures).
The fixes apply cancellations idempotently, clear previews on every selection and
reject stale file/PIN completions. Unit/service regressions now pass within the
208-test suite; type, lint, format and production build checks pass.

Success toasts show a shrinking five-second countdown bar in the active theme;
each new confirmation restarts both the bar and dismissal timer. The countdown remains
visible with reduced motion enabled because it communicates remaining time.
All nine Kunludo browser checks pass on an isolated test database, including both
previously failing file-selection regressions.

The countdown browser checks pass under both normal and reduced-motion preferences;
the reduced-motion test first failed against the shared animation reset, then passed
with the countdown-only exception.
