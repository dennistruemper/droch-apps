# Schlezaz decisions

Shared choices remain in [the shared decisions](../../../docs/decisions.md).

## Schlezaz port — 2026-10-24

The user requested Schlezaz in this project with no Lamdera and chose to follow
the source PLAN.md while preserving its intentionally bad modes. SchleZaZ repeats
each draw twice, then makes a fresh draw; XKCD always chooses the fourth option,
wrapping around short lists. Standard mode is random, shuffle exhausts its choices,
and Random-Random executes one randomly selected concrete mode per draw. All modes
keep the theatrical 2–10 second wait and German presentation.

The source backend has no behavior, so the port stays browser-only. Registry entries
without server routes are included in builds and hosting but have no SQLite file,
migrations or account requirement. No DNS or Coolify changes are needed.

Implementation defaults: shuffle treats distinct trimmed values as choices; option
and mode edits reset sequence memory. Controls freeze while drawing. Native controls
and reduced-motion support replace perpetual flashing; Drochsign and an app theme
replace external Tailwind/font CDNs. Optional features from the source plan, such as
saved generators, sharing, statistics and sound, are outside this port.
