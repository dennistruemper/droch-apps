# Vortoj decisions

App-specific decisions and rationale. Shared choices remain in
[the shared decisions](../../../docs/decisions.md).

## Product requirements

Accounts are required. Matches are turn-based with live updates. Players can be online
together or make moves days apart. There is no time limit per turn. Durable match
state must not depend on a browser or live connection remaining open.

## Vortoj — 2026-10-04

User decisions:

- The word game is named **Vortoj**, with `/vortoj/` as its path.
- Two to four logged-in players join a room link. Any logged-in user can create rooms.
- Familiar board, scoring, rack, exchange, and joker rules; no deadline per turn.
- No dictionary service. Opponents vote on words, and at least half must approve.
- German and English tile sets plus an editor for named, per-user reusable custom sets.
  Unicode letters and `*` jokers are supported.

Implementation defaults (adjustable, not additional user decisions):

- Vote on each newly formed word, including cross-words. Round the threshold up,
  resolve early when accepted/impossible, and keep votes immutable. Rejected moves end
  the turn while preserving the player's tiles. Unanswered votes have no deadline.
- Creator starts and takes the first turn. No spectators or late joining after start.
- Fifteen-square board, seven-tile racks, zero-point jokers, 50-point seven-tile bonus.
  Two consecutive scoreless rounds end a match; deduct remaining tiles and award their
  points only to a player who actually emptied their rack with the bag empty.
- Freeze the selected tile set at room creation. Users keep up to 50 custom sets, with
  28–500 total tiles, at most 80 different letters, quantities 1–100 and points 0–20.
- The old empty word-game SQLite scaffold is retained on existing volumes; Vortoj gets
  a new migration history and file. Old frontend links redirect to the renamed app.

## Vortoj board interaction — 2026-10-05

Choose concept A from the mobile exploration: the board stays visible above the rack
and move controls. Begin with the whole board; tap an area or use the zoom controls to
reach 44-pixel squares, then pan and place tiles. Keep the close view throughout a
placement and word approval; return to the overview after an accepted move, rather
than after each tile. Resizing preserves an unfinished placement.

Use the same interaction on desktop. When the board fits at a comfortable size, place
directly and omit zoom controls. Mouse pointers use a 32-pixel minimum; touch uses
44 pixels. Wider desktop and short landscape layouts put the rack beside the board.
Scores, history, passing, exchanges and word voting remain available through dialogs.
The alternative mobile concepts and their standalone exploration files are removed.

## Vortoj bonus labels — 2026-10-08

Use `2×` and `3×` instead of language-specific bonus abbreviations. Word bonuses
fill the square; letter bonus labels are half the size. Preserve the centre marker
and describe the bonus type explicitly for screen readers. Scoring rules stay the same.

## Vortoj default tile distributions — 2026-10-08

The English and German presets are Vortoj defaults with small distribution changes.
English: E 12→11, I 9→8, S 4→5, T 6→7; 100 tiles total. German: E 15→14, N 9→8,
S 7→8, U 6→5; 100 tiles total instead of 102. These changes focus on common letters;
rare letters, all point values, and two zero-point jokers remain unchanged. Users
can save their preferred distributions as named custom sets. Existing rooms retain
the tile set frozen at creation; only new rooms and preset copies get the new defaults.

## Vortoj Antique paper default — 2026-10-08

The user chose Antique paper after comparing three aged-paper palettes. Add it to
the shared theme picker and use it as Vortoj’s default: `#f3e8c8` background with
`#231f18` foreground, using the standard system sans-serif font. Keep existing
per-app saved choices; changing the default does not reset user preferences.
The initial HTML uses the same theme so first paint matches the app default.

## Elm-style account flow trial — 2026-10-08

The user asked to implement the proposed typed model/message/update/command pattern,
starting with the account component, and preserve the old file for comparison.
After comparing the result, the user chose to keep the rewrite and remove the
local backup. Use ordinary TypeScript and one Solid model signal;
no new state-management dependency. Keep I/O separate from pure transitions and
retain feature-local ownership. Evaluate this example before expanding the pattern
to gameplay; small independent UI controls can continue to use signals.

## Follow-up review fixes — 2026-10-09

Lock tile-editor controls while a save is pending so a late response cannot change
another edit's identity or overwrite a different saved set. Distinguish a removed
room from an expired auth session in event streams; clear its game UI, ignore late
snapshots and provide a return to Your rooms. Treat HTTP 404 the same way. Add an
explicit change-email message to the account model, retaining the entered address
for correction without sending another code until the user submits it.

## Vortoj navigation on every page — 2026-10-09

The user requested the side panel across Vortoj, rather than only active rooms.
Use one page shell and a consistent menu: Rules, Your rooms, Settings, authenticated
Sign out, and a separated All apps return link. The login state changes availability
of Sign out, not the page. Keep scores and history as a room-specific control next
to the score. Extract the existing rules into an app-wide dialog so the same Rules
entry works from sign-in, the lobby and games. Retain the shared panel's desktop
preference, mobile modality and outlined burger; remove the old header links and
separate account row.

Show the panel's X close button only in mobile drawer mode. On desktop the burger
is the single collapse/expand control, avoiding two simultaneous close controls.

The outlined menu toggle shows a burger when closed and an X when open, with a
short morph animation. Respect `prefers-reduced-motion` by switching instantly.

## Review fixes — 2026-10-08

Retain up to 100 rooms per owner, checked transactionally. Creating another room
automatically removes the owned room inactive longest, including unfinished games,
and its related data for all players. Sort room lists most recently updated first
to match pruning. Only accepted joins and game actions count as updates, not viewing.
Use a Show finished games checkbox to include finished games in the same sorted
list and display the retention explanation. The
user rejected manual site-owner cleanup and finished-only pruning because abandoned
games may never finish. Keep vote failures visible inside word approval and use roving keyboard focus on
the board rather than 225 tab stops. Removing another saved tile set preserves the
active editor's update target and draft.

## Feature-local Elm-style client models — 2026-10-09

Extend the accepted account pattern to the Vortoj tile editor and room. Each feature
owns a typed model, message union, pure update function and explicit commands.
Editor inputs belong to its model; string number drafts preserve incomplete edits,
and keyed rows preserve focus. Pending saves/deletes freeze editor identity.
Room screens distinguish loading, invitation, active, expired and removed states;
placement and exchange are separate modes. Request IDs and snapshot versions guard
late responses, duplicate submissions and terminal removal. Browser measurements,
scrolling, keyboard focus and native dialogs remain in the view adapter. Keep simple
lobby filters, settings and navigation controls local; do not introduce a global
store or generic state framework. Poker can be evaluated separately later.

The user chose this as the default for new client features with coupled state or
asynchronous workflows, rather than an optional refactor after implementation.
Use the account, editor and room as concrete examples; keep exceptions for simple
independent controls and browser layout state. `AGENTS.md` carries the contributor
instructions so future agents apply the style from the beginning.

The lobby's asynchronous collection loading and room creation also use this pattern.
Keep its finished-game filter and editor visibility as simple local signals. Loading
and empty lists are distinct; preserve prior data on refresh failure and propagate
that failure to callers. Guard pending creation and navigation against duplicate
submissions. Room updates emit explicit show/close/keep approval-dialog commands;
the adapter does not decide game policy.

## Shared side panel — 2026-10-08

The user selected the side-panel navigation design for Vortoj. Keep room name,
player identity, turn status and personal score visible, replacing the repeated
app/account header rows during active games. Use an outlined burger on the left.
Rules belongs in the panel alongside scores, rooms, settings and sign-out; All
apps is a separate return link. The panel is extracted as a browser-safe public
shared module; apps own its navigation content. At 1280px or wider, display it as
an expanded column by default and remember explicit desktop collapse per app.
Below that width, overlay it as a native modal drawer, closed initially, to preserve
board space and keyboard focus behavior. Poker can adopt the component later.
