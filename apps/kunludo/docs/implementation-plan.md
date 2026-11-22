# Kunludo implementation status

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
implementation check. See [source analysis and decisions](plan.md).

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

## Team-wide availability email digests — implemented

All player availability changes in a team coalesce until five minutes after the
last real change by anyone in that team. Each admin receives one combined email,
with entries grouped by player; the recipient's own edits are excluded. Queue
updates commit atomically with availability in `kunludo.sqlite`. Persistent claims,
retry backoff and cancellation preserve pending deliveries across restarts and
concurrent edits. Permissions and match revisions are rechecked at delivery.

Verification: `pnpm check` passes type checking, lint, formatting and 234 tests.
`pnpm build`, `pnpm test:image` and isolated production migration/startup pass.
All ten Kunludo browser flows pass against that image. A real container restart
preserves Anna/Bob's two queued digests, each containing ten Charlie/Dave G1–G5
entries, plus the authenticated session. After making those test batches due, the
startup worker drains them using the local no-op sender. No real email was sent.
The team-wide regression first failed against per-player batching, then passed.

See the [worked example and delivery limitations](email-notifications.md).
Hosted Mailtrap delivery remains a deployment verification task.

## Background revisions during imports — 2026-11-23

Regression tests reproduce private-account revision changes disabling a current
import draft, and an already-reviewed draft becoming stale on a later unchanged
snapshot. The model advances the revision only for a previously current editor
with identical visible teams/games, preserving real-conflict review and removal
guards. A two-account browser regression waits for the real SSE revision from an
unrelated private-team change, then imports the preserved selection and checks
team privacy. It passes locally against the production build. Type checking,
lint, formatting and all 285 unit/integration tests pass; two new model regressions
were demonstrated failing before the fix. Keep the original calendar flow and
concurrent axe against the shared stack for CI validation.
