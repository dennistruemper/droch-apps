# Observo contributor and agent instructions

The [root instructions](../../AGENTS.md) also apply. Read these instructions for
Observo changes, including `migrations/observo/` and `e2e/observo.spec.ts` outside
this directory.

## Product and implementation rules

- Public dashboard at `/observo/`; code-defined targets, no account or admin UI.
- Check functionality through the bounded Chromium workflow; HTTP 200 alone is insufficient.
- Persist first-dashboard-visit activation in every environment. Reads/health checks
  do not activate monitoring; `OBSERVO_CHECKS=false` remains a test hard-off.
- Keep five-minute slots immutable, serialize runs, do not backfill missed checks,
  and abort on shutdown before closing the database.
- Keep at most 720 hourly buckets and only the latest diagnostic. Do not retain
  response bodies, screenshots, traces or persistent browser sessions.
- Keep missing observations distinct from failures. A workflow deadline is a failure;
  launch/crash failures and shutdown cancellation remain missing.
- Keep visitor copy brief: do not advertise refresh/retention intervals, browser checks,
  HTTP codes, durations, storage, accounts or deployment environments.

## Local documentation

- Read [architecture](docs/architecture.md) for app behavior and implementation.
- Read [decisions](docs/decisions.md) before changing product or implementation choices.
- Use [implementation status](docs/implementation-plan.md) for scope and historical verification.
- Keep app-specific details here; shared infrastructure and policies remain in the root docs.
