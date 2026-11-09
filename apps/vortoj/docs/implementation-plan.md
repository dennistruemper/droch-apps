# Vortoj implementation status

Historical milestone and verification records moved from the shared plan; test counts
below describe those earlier runs, not checks performed for this documentation change.
Shared deployment work remains in [the shared plan](../../../docs/implementation-plan.md).

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
