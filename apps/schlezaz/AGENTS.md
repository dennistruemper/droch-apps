# Schlezaz contributor and agent instructions

The [root instructions](../../AGENTS.md) also apply. Read these instructions for
Schlezaz changes, including `e2e/schlezaz.spec.ts` outside this directory.

## Product and implementation rules

- Browser-only at `/schlezaz/`, with no account, API or database.
- Preserve all five selection modes, German copy and the theatrical 2–10 second wait.
- SchleZaZ repeats each draw twice; XKCD selects the fourth option, wrapping short lists.
  Shuffle exhausts distinct trimmed values; Random-Random selects a concrete mode per draw.
- Option/mode edits reset sequence memory. Freeze controls while drawing; guard stale
  timers and disposal. Inject randomness and timers outside pure transitions.

## Local documentation

- Read [architecture](docs/architecture.md) for app behavior and implementation.
- Read [decisions](docs/decisions.md) before changing product or implementation choices.
- Use [implementation status](docs/implementation-plan.md) for scope and historical verification.
- Keep app-specific details here; shared infrastructure and policies remain in the root docs.
