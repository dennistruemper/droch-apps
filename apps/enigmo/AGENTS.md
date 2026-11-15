# Enigmo contributor and agent instructions

The [root instructions](../../AGENTS.md) also apply. Read these instructions for
Enigmo changes, including `e2e/enigmo.spec.ts` outside this directory. See the
[authoring guide](README.md) before changing puzzles, including its revision rules.

## Product and implementation rules

- Browser-only at `/enigmo/`, with no account, API or database.
- Start with code entry; direct `?code=` links support QR invitations. Do not list puzzles.
- Questions remain editable, with fixed letter labels and a persistent bottom strip.
  Validate answers and final word only on final submission; no timer or attempt limit.
- Scope local saves by puzzle code and revision; validate saves and keep the puzzle
  playable if storage fails. Bump revision for incompatible content changes.
- Codes are invitations, not authentication. Authored solutions ship to the browser;
  never put secrets in puzzle definitions.

## Local documentation

- Read [architecture](docs/architecture.md) for app behavior and implementation.
- Read [decisions](docs/decisions.md) before changing product or implementation choices.
- Use [implementation status](docs/implementation-plan.md) for scope and historical verification.
- Keep app-specific details here; shared infrastructure and policies remain in the root docs.
