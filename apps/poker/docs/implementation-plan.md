# Poker implementation status

Historical milestone and verification records moved from the shared plan; test counts
below describe those earlier runs, not checks performed for this documentation change.
Shared deployment work remains in [the shared plan](../../../docs/implementation-plan.md).

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
