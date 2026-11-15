# Kunludo contributor and agent instructions

The [root instructions](../../AGENTS.md) also apply, including changes to
`migrations/kunludo/`, `e2e/kunludo.spec.ts` and the calendar fixtures.
Read [architecture](docs/architecture.md), [decisions](docs/decisions.md) and
[implementation status](docs/implementation-plan.md) before changing app behavior.
The original source analysis is in [the plan](docs/plan.md).

## Product and implementation rules

- Email-code accounts at `/kunludo/`; one display name and unlimited team memberships
  across clubs. Team creation never adds named placeholder players.
- Team joining uses a stable group ID plus six alphanumeric characters. Admin removal
  rotates the PIN atomically; normal sign-out preserves it. Protect the last admin.
- Empty team selection means all teams; selecting multiple teams shows their union.
- Manual per-team iCalendar import only. Detect the common team, show checkboxes,
  deduplicate UIDs and honor explicit cancellations. Missing entries do not delete games.
- Keep ordinary availability simple. Binding commitment decisions appear for actual
  conflicts; keep other teams' private schedules out of unauthorized payloads.
- Admins can set member availability. Reserve is a label, not an extra player or vote.
- Show start times only; retain planned ends and buffers for conflict detection.
- Success toasts last five seconds with a countdown that remains visible under reduced
  motion. Restart the countdown for new confirmations; stale timers cannot dismiss them.
- Keep product copy compact. Team create/join actions belong in Teams and empty accounts.
