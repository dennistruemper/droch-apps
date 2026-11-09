# Observo implementation status

Historical implementation and verification records moved from the shared plan;
commands and counts below describe those earlier runs, not checks for this
documentation change. Shared deployment work remains in
[the shared plan](../../../docs/implementation-plan.md).

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
