# Avantaĝo decisions

## Requested scope — 2026-11-26

The user requested a table-tennis Vorgabe tool for two teams of three. They chose
calculation and playing order only, excluding match-result tracking.
They requested fixed Heim/Gast labels and a compact interface that starts with
the inputs, without an introductory hero, slogans or repeated explanations.
They also requested removing the print button; there is no app-specific print UI or layout.
They requested the shared theme picker, with Paper for light system appearance
and Ink for dark. This replaces the initial fixed green palette.

Rules come from the supplied Kreispokal excerpt dated June 2014:

- Order: A:X, B:Y, C:Z, doubles, B:X, A:Z, C:Y, B:Z, C:X, A:Y.
- Singles use the players' current published Live-PZ; doubles use the higher
  Live-PZ of each selected pair. Teams provide ratings before play.
- Absolute rating difference 0–50 → 0 points, 51–150 → 1, 151–250 → 2,
  251–350 → 3, 351–450 → 4, 451–550 → 5, 551–650 → 6, 651–750 → 7,
  over 750 → 8. The weaker side starts with those points in every set.
- Free lineup; doubles may be selected after the first singles round. First
  service is drawn by lot. First to six team wins ends the match; at 5:5 compare
  set ratios, then the doubles winner. The calculator explains these rules
  without collecting results or deciding a winner.

Implementation defaults, adjustable rather than additional user decisions:

- Suggested Esperanto name **Avantaĝo** means “advantage”; the ASCII URL is
  `/avantago/`. German labels suit the supplied rules. This is a descriptive app
  name rather than a claim of an official Esperanto sports term for Vorgabe.
- Empty player names use their position.
- Manual whole-number ratings from 0 to 10000, chosen as a practical input bound.
- Browser-local versioned saves and reset confirmation; no server
  persistence or new infrastructure is needed for a personal calculator.
