# Poker decisions

App-specific decisions and rationale. Shared choices remain in
[the shared decisions](../../../docs/decisions.md).

## Product requirements

No accounts. Participants join rooms anonymously. Guest identity and room membership
need server enforcement; no registration should be required.

## Poker implementation — 2026-10-03

- The user chose expiry after **30 days of inactivity**. Joining (including rejoining),
  voting/clearing, revealing, and starting a round refresh activity. Viewing a room
  or keeping an SSE connection open does not. Expired rooms are removed on subsequent
  poker requests, including their participant records.
- The deck is `0, 1, 2, 3, 5, 8, 13, 21, ?, ☕`. The user requested the coffee
  symbol for a break vote on 2026-10-04; it follows normal vote privacy and reveal rules. The numeric deck and a 50-participant room limit are implementation defaults.
- The user chose collaborative control: **every room member can reveal or start the
  next round**. Reveal requires at least one vote, without waiting for everyone.
  Revealed votes cannot change. Reset clears all votes and increments the round.
  Creator disconnection cannot block play, so host takeover/heartbeat leases are not needed.
  The creator label is informational and grants no extra permissions.
- Anonymous membership uses a random HttpOnly cookie scoped to `/api/poker`, with
  its digest stored in each membership row. The same browser can belong to multiple
  rooms. There is no guest account recovery in this slice.
- Commands include their round number. Transactions serialize voting and revealing;
  stale votes and repeated resets cannot change the following round.
- SSE sends full, viewer-specific, versioned snapshots immediately on subscription,
  after accepted commands, and every 10 seconds for reconciliation. Queues are
  bounded; skipped updates are recovered from a later snapshot. No event log is needed.
- Unrevealed participant vote fields are null for everyone; the viewer's own vote
  is available only in `you`. The server applies this to both HTTP and SSE.
- User-facing errors explain recovery. Unexpected errors include a reference linked
  to redacted server logs; request bodies and guest credentials are not logged.

## Poker Attention mode — 2026-10-15

The owner requested an ironic “Attention mode” option in Poker Settings, using
locally generated, unrelated animations around the voting elements. All prototype
effects except number 6 (the olive machine) were selected. Each effect may run for
one minute before random rotation; the twelve-second comparison clips do not limit
animation duration. No external videos, assets, or data sources are involved.

The implementation starts disabled, saves the choice under poker browser storage,
and shows two distinct scenes on wide screens and three on mobile. The owner
requested mobile placement above the participants, between the table and estimate
controls, and below round controls. Scene groups rotate each minute. Device reduced-motion preference keeps the artwork static. Animation time
pauses when the page or all visible scenes are out of view, and work stops when disabled.
