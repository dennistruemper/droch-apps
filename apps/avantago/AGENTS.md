# Avantaĝo contributor and agent instructions

The [root instructions](../../AGENTS.md) also apply, including to `e2e/avantago.spec.ts`.

- Browser-only calculator at `/avantago/`; no accounts, API, database or result tracking.
- Two teams of three, labelled A/B/C and X/Y/Z, with manually entered Live-PZ.
- Heim/Gast are fixed labels. Begin with the six inputs; no hero, slogan, format
  badge, editable team names or repeated instructions. Put explanations under rules.
- Do not add a print button or app-specific print layout.
- Use the supplied June 2014 table, including both ends of every band. The weaker
  side receives the starting points in every set; cap the Vorgabe at eight.
- Doubles use each selected pair's highest Live-PZ. Do not average ratings or use
  an unselected player's rating. Doubles may remain unselected after singles are calculated.
- Preserve the supplied ten-game order. Do not imply every scheduled game must be
  played: stop at six team wins; at 5:5 compare sets, then the doubles winner.
- Keep input rows stable, transitions pure and synchronous, and storage/confirmation
  in the command adapter. Validate versioned saves and retain usable calculations
  when storage is unavailable. Reset only this app's calculator data.

See [architecture](docs/architecture.md), [decisions](docs/decisions.md) and
[implementation status](docs/implementation-plan.md).
