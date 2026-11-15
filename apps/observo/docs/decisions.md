# Observo decisions

Shared choices remain in [the shared decisions](../../../docs/decisions.md).

## Observo — 2026-10-24

The user requested Observo for five-minute website availability/functionality checks
with hourly history, then simplified the original account/quota/admin proposal to a
public dashboard with code-defined websites. There is no Observo login, per-account
limit, domain allowlist or admin page. Start with
`https://rendsburg-eckernfoerde.tischtennislive.de/`.

Keep only 30 days of history and minimize stored data. The implementation uses one
24-bit value for twelve five-minute outcomes per hour, preserving drill-down without
individual check rows. Retain only the latest diagnostic; no bodies, screenshots,
traces or persistent browser sessions. Retain at most 720 hourly buckets including
the running hour, with no longer-term archive.

The user requested browser-based checks because a banner is insufficient. An approved
live browser test submitted the site's tokenized confirmation form, navigated through
Spielbetrieb to populated Kreisliga standings, and retained access after reload. Use
that functional workflow with a pinned Playwright/Chromium runtime. Passing requires
real team/score rows, not merely HTTP 200 or a page title. The live test proves local
browser access; hosted-server access still needs deployment verification.

Implementation defaults: one sequential browser run per target/slot, a fresh context
per run, same-origin requests, bounded waits, no retries within a recorded slot, and
no backfill after outages. Complete-hour thresholds are zero failures for available,
one to six for degraded, seven to twelve for mostly unavailable. Missing data stays
unknown. The current hour uses the latest check, with a ten-minute freshness limit. Use the proposed fixed-color
status panel with labels/symbols, while surrounding UI follows Drochsign themes.

The user chose identical first-visit activation for every environment: initially no
outbound checks, then permanent activation in that environment's SQLite after the
first rendered dashboard visit. Redeployments preserve activation. Preview visits
also activate monitoring; most previews never visit this app. A test-only hard-off
remains available. Activation is separate from the 30-day history cleanup.

The user chose a 30-day grid with hourly cells, each row a local calendar day from
midnight to midnight, rather than clicking through rolling 24-hour slices. Clock
changes preserve repeated/skipped hours; mobile dates expand for usable hour targets.
Remove the manual refresh control and footer. Refresh dashboard data automatically
every two minutes and when the page becomes visible again; checks remain five-minute.

Product copy must stay brief and describe information useful to visitors. The user
explicitly rejected implementation explanations such as refresh cadence, retention
length and real-browser checking. Observo shows site status, check time, timezone
and explorable history; operational details belong in developer documentation.
This guidance is also recorded in `AGENTS.md` for future contributors.

Show only today's recorded history by default. A compact Show history control reveals
older dates on demand, only when older observations exist. Omit any date with no
recorded checks, including dates before monitoring began; do not fill the page with
empty rows during the first month. Preserve expansion across automatic updates.

Use the viewer's local time implicitly. The user requested removal of the standalone
timezone label because local browser time is expected without explanation.

Treat the browser workflow's overall 60-second deadline as a failed check
(not-functional / timeout), not as a missing observation. Genuine browser crashes,
launch failures and shutdown cancellation remain missing. The user accepted the
current calendar behavior for desktop clock-change labels and fractional clock-change
days; no calendar fixes are requested for those review findings.

For concept comparisons, the user prefers faster results over exhaustive preview
quality. Show lightweight representative alternatives and sanity-check their main
interaction. Defer detailed polish, responsive verification and edge cases until
a solution is chosen. This workflow preference is recorded in `AGENTS.md`.

The user selected “Quiet accents” (colour preview option 5), replacing the earlier
fixed light status panel. Keep surfaces and text within Drochsign's two-colour theme.
Use restrained green/amber/red marks rather than status-coloured fills, plus a small
current-status dot. Preserve symbols, labels and counts so meaning remains clear
even on a theme whose background resembles a status accent. Light/dark accent
shades follow the selected theme's native colour scheme, including custom themes.
