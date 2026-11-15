# Vortoj contributor and agent instructions

The [root instructions](../../AGENTS.md) also apply. Read these instructions for
Vortoj changes, including `migrations/vortoj/`, `e2e/vortoj.spec.ts`,
`e2e/vortoj-review.spec.ts` and `e2e/account.spec.ts` outside this directory.

## Product rules

- Vortoj is the word app at `/vortoj/`, with two to four authenticated room members.
- Keep racks private in HTTP and event-stream payloads; filter on the server.
- No external dictionary: opponents approve every newly formed word. At least half
  the opponents, rounded up, must approve. Turns and votes have no deadline.
- Include English/German presets and per-user named reusable custom tile sets.
- Use the shared auth API and modes; do not introduce app-specific authentication.

## Local documentation

- Read [architecture](docs/architecture.md) for gameplay, persistence, UI and client behavior.
- Read [decisions](docs/decisions.md) before changing product or implementation choices.
- Use [implementation status](docs/implementation-plan.md) for scope and historical verification.
- Keep Vortoj details here; shared infrastructure and policies remain in the root docs.

## Client reference implementations

Use `src/client/account-model.ts`, `tiles-model.ts`, `room-model.ts`, `lobby-model.ts`,
their command adapters and transition tests as references for the shared client-state
style. Preserve request/version guards, removal states, stable editor row keys and
adapter-owned browser operations. See the local architecture for detailed behavior.
