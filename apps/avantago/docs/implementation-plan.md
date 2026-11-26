# Avantaĝo implementation status

Implemented: six editable names/Live-PZ values, fixed Heim/Gast labels, all ten
pairings, independent per-set handicap calculations, selectable doubles, source
table and rules, browser-local recovery and confirmed reset.
Result tracking is outside the requested scope.

Verification covers every handicap band edge in both directions, doubles maxima,
missing/invalid values, saved-data validation and model recovery. Browser tests
exercise the playing order, calculation direction, doubles, keyboard focus,
reload, reset cancellation, storage failure and 320/375/1280px layouts.

Verified locally on current main: `pnpm check` passes type checking, lint,
formatting and all 303 unit/integration tests. The instrumented production image
builds and its isolated Compose stack passes both calculator browser flows and
nine axe checks covering the landing page and calculator entry/populated/error
states across desktop light/dark and mobile. The required changed-line gate
passes at 99.51% with fresh unit/browser reports. The compact first viewport and
populated schedule are inspected in the browser; desktop/mobile screenshots are saved.

Print-button removal: `pnpm check` still passes with 303 tests; the rebuilt
container passes both affected browser flows and the fresh changed-line gate at 99.59%.

Remaining: review the draft PR and verify the deployed preview. No deployment
or hosted verification is claimed by local checks.
