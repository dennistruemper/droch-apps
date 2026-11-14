# Observo architecture

Shared infrastructure is documented in [the shared architecture](../../../docs/architecture.md).

## Observo

Observo is a public website-monitoring dashboard at `/observo/`, with read-only data
at `/api/observo/sites`. It has no accounts or admin UI. Trusted targets and their
browser workflows live in `apps/observo/src/server/sites.ts`; changing a target or
its success conditions should use a new ID to start fresh history. The first target
is the Rendsburg-Eckernförde TischtennisLive website.

All environments start dormant. The dashboard sends a same-origin POST to
`/api/observo/activate` on its first load; an idempotent singleton in SQLite persists
activation across redeployments, independently of history retention. Reads, health
checks and other apps do not activate monitoring. Once activated, a scheduler runs
immediately and then on five-minute UTC boundaries, independently of visitors. It checks migration readiness,
skips already recorded slots, serializes browser runs, and aborts on shutdown before
database closure. Missed observations are never backfilled. `OBSERVO_CHECKS=false`
disables outbound checks for isolated browser test stacks; ordinary runtime defaults
to first-visit activation (`OBSERVO_CHECKS=auto`; legacy `true` behaves identically). Each run creates and closes a fresh headless Chromium browser/context;
there are no persistent cookies, screenshots, response bodies or traces.

The TischtennisLive workflow submits the current tokenized human-confirmation form
if shown, follows Spielbetrieb and Kreisliga links, then requires the league heading,
Mannschaft/Punkte labels and a visible standings row containing a team link and scores.
It follows current navigation instead of hardcoding a season or league ID. Requests
are restricted to the configured origin, GET/HEAD and the observed confirmation POST;
images, media, fonts, service workers and downloads are disabled. Navigation, element
waits and the whole run have bounded timeouts. Launch/crash failures leave missing
observations; exhausting the overall 60-second deadline records a not-functional
timeout. Shutdown cancellation remains missing even if it coincides with the deadline.
HTTP, network and workflow failures are recorded with safe reason codes.
The pinned Playwright runtime and Chromium headless shell are included in Docker.

`observo.sqlite` owns `migrations/observo/`. Twelve two-bit outcomes fit in one integer
per website/hour: missing, available, unreachable or not functional. Transactional
updates make each slot immutable and prevent old completions replacing the latest
result. At most 720 UTC hourly buckets per configured site are retained, including
the running hour. Cleanup runs on startup/check cycles and reads, removes old latest
results, and deletes deconfigured sites. The latest check alone retains an HTTP code,
duration and safe reason; historical individual diagnostics are discarded.

Complete hours are available when all twelve checks pass, degraded with one to six
failures, and mostly unavailable with seven to twelve failures. Missing coverage is
unknown. The current hour shows the latest result, becoming unknown after ten minutes
without a fresh observation. The dashboard shows a 30-day hourly grid using local
calendar days from midnight to midnight, including 23/25-hour clock-change days.
Only today is shown by default; Show history reveals older recorded dates. Dates
without observations are omitted, and the control is absent when no older data exists.
Future cells are muted; mobile dates expand to reveal hours. Five-minute drill-down
remains available. Data refreshes every two minutes and on returning to the page;
there is no manual refresh button or footer. Product copy shows status and check time;
local time is implicit. Refresh cadence, retention and checker internals stay in
developer documentation. Quiet accents keep all surfaces and text in the app theme;
small green/amber/red status underlines and a current-status dot provide emphasis.
Accents adapt to the native light/dark scheme, including custom themes. Hour cells
and legends retain symbols and labels; slot details retain outcome text, so meaning
survives a theme with a similar accent colour. A feature-local
model/message/update/command flow guards duplicate refreshes and stale results.
