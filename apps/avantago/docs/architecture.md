# Avantaĝo architecture

Avantaĝo is a German browser-only calculator registered at `/avantago/`, using
Solid 2 and Drochsign with an independent dark green theme. It joins the shared
landing page, frontend build and static hosting through the existing registry.
It has no server routes, authentication, database or migrations.

`src/domain/index.ts` owns the fixed schedule, runtime save schema, Live-PZ parsing,
player names and per-set starting points. Each pairing calculates independently:
missing/invalid ratings leave only affected games pending. Missing names fall back
to the fixed position letters. Doubles remain pending until both pairs are chosen
and all four selected ratings are valid. Ratings are manually entered, not fetched.

The feature-local model owns an editable draft and describes storage/confirmation
commands. The adapter validates `version: 1` saves under
`droch:avantago:calculator`; failed loads start an empty draft with a warning,
failed saves retain current calculations. The component dispatches against a
synchronous current model and guards disposal. Fixed row identities preserve focus.
Native print renders the schedule with team order and per-set handicaps.

The supplied rules are recorded in [decisions](decisions.md).
Shared infrastructure remains in the [root architecture](../../../docs/architecture.md).
