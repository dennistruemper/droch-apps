# Poker architecture

App-specific details; shared infrastructure is documented in
[the shared architecture](../../../docs/architecture.md).

## Live snapshots

Poker updates carry full snapshots, so version gaps are safe; older snapshots are ignored.

## Persistence ownership

Poker owns rooms and participants in `poker.sqlite`, with migrations in
`migrations/poker/`.

## Membership, commands and streams

Poker room membership uses anonymous credentials. A worktree-specific,
HttpOnly guest cookie is scoped to `/api/poker`, SameSite Lax, and Secure in production.
POST requests require the configured origin. Room membership authorizes both reads
and SSE, and every member can reveal/reset the round. Invite links permit joining,
not reading existing votes without membership. Guest identity lasts 30 days from its
last accepted command; clearing cookies loses membership; the participant may rejoin.

Room commands include the expected round. Synchronous SQLite transactions apply
votes, reveal, and reset together with monotonically increasing snapshot versions.
Rooms expire after 30 days without joining, voting, revealing, or resetting. Requests
lazily remove expired rooms and their memberships; views/streams do not extend expiry.
The 50-participant limit and 4 KiB request-body limit bound individual room requests.
SSE subscriptions authorize before opening, subscribe before the initial snapshot,
and use bounded queues with 10-second full-snapshot reconciliation. Shutdown closes
streams before database connections. Expired streams notify clients and close.

Storage readiness blocks poker requests during pending migrations. Expected failures
have actionable messages; unexpected failures return a reference and log error names
and codes without SQL parameters, request bodies, or credentials.

## Attention mode

Poker adds app-specific content to the shared Settings dialog through its children
slot. Its optional Attention mode stores a validated boolean under
`droch:poker:attention-mode` and mounts decorative Canvas scenes around the
voting area. Wide screens use full-width side panels around a compact voting
column; narrower screens show three full-width scenes: above the participants,
between the participant table and estimate controls, and below round controls. Settings shows only
the Attention mode switch. Nine procedural scenes live in the poker
client; the standalone experiment and recorded media are not bundled. A new group
is chosen after 60 visible seconds, excluding all three outgoing effects. Scene rendering
accepts time explicitly and is independent of votes, room snapshots, and network
requests. The client owns a capped 30 fps loop and cleans it up on unmount; hidden
tabs and offscreen scenes suspend animation, and reduced motion renders static art.
