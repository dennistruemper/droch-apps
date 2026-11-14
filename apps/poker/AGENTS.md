# Poker contributor and agent instructions

The [root instructions](../../AGENTS.md) also apply. Read these instructions for
Poker changes, including `migrations/poker/`, `e2e/poker.spec.ts`,
`e2e/attention.spec.ts` and the `experiments/attention-mode/` reference outside
this directory.

## Product rules

- Poker is account-free at `/poker/`; enforce anonymous room membership on the server.
- Keep unrevealed votes private in HTTP and SSE. Only the viewer's own vote is
  available in `you` before reveal.
- Every room member can reveal or start the next round. Creator status gives no
  additional permissions; creator disconnection must not block play.
- Preserve rooms and guest membership across backend restarts. Expire rooms after
  30 days without accepted activity; views and open streams do not refresh expiry.
- Attention mode is optional, local and decorative. Respect reduced motion and
  stop animation work when hidden or disabled.

## Local documentation

- Read [architecture](docs/architecture.md) for membership, streams and Attention mode.
- Read [decisions](docs/decisions.md) before changing product or implementation choices.
- Use [implementation status](docs/implementation-plan.md) for scope and historical verification.
- Keep Poker details here; shared infrastructure and policies remain in the root docs.
