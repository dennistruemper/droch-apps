# Vortoj architecture

App-specific details; shared infrastructure is documented in
[the shared architecture](../../../docs/architecture.md).

Vortoj uses `vortoj.sqlite` and `migrations/vortoj/`.

## Client state reference implementations

New client features with coupled state or asynchronous workflows use feature-local
typed models and messages from the beginning. The Vortoj account, lobby, tile editor and
room provide the reference implementations. They use typed models and message
unions. Pure update functions return models and commands; explicit adapters execute
HTTP, confirmation, randomness and browser operations. A synchronous current model
orders transitions independently of Solid's deferred rendering. Request IDs reject
stale completions; room snapshot versions protect drafts from outdated updates.
Removed/expired room states cannot be revived by in-flight responses. Editor rows
have stable keys to preserve focus while model-owned inputs change. Board geometry
and focus stay browser-local, and simple independent UI controls retain signals.
The lobby model handles atomic collection loads and pending room creation; its
checkbox and editor visibility remain local controls. Failed collection refreshes
retain previous data and propagate to the tile editor. Creation ignores repeated
submissions while pending or navigating. Approval commands explicitly describe
show, close or keep, leaving the room adapter to execute dialog operations.

## Persistence ownership

Vortoj owns rooms, members, saved tile sets, and command receipts. Its room record holds
an immutable tile-set copy and durable game state; private JSON is never sent directly.

## Command acceptance

Word-game moves include a unique command ID and expected match version. Acceptance
is atomic so simultaneous submissions, retries, and stale clients cannot duplicate
a move or overwrite another turn. A move history and current match state are stored;
this does not require a general event-sourcing framework.

## Vortoj rules and data

English and German presets each contain 100 tiles, including two zero-point jokers.
They use Vortoj's adjusted common-letter distributions; the exact changes are recorded
in [decisions](decisions.md). Users can copy or replace them with saved custom sets.
Room creation freezes the distribution, so preset changes do not alter existing games.

Each account retains up to 100 rooms it created. Creation at the limit deletes the
least recently updated owned room, finished or unfinished, including memberships
and command receipts. Deletion and creation share one transaction, so failures
roll back pruning. Successful new joins and game commands update a durable timestamp;
reads, streams, duplicate joins, retries and rejected commands do not. Lists sort
by updated time descending, with creation time and ID as stable tie-breakers;
pruning uses the reverse order. A Show finished games checkbox filters a single activity-ordered list;
checking it includes finished games and shows the retention explanation. Removal applies to all players. Existing rooms'
timestamps are backfilled from their latest game history or creation time.

Two to four players join through a room link after sign-in. Membership closes when the
creator starts the game. The creator plays first. Seven tiles are dealt per player on
an empty 15×15 board. Moves must form a connected line, cover the centre on the first
turn, and create words of at least two tiles. New tiles activate letter/word premiums;
playing seven tiles adds 50 points. `*` is a zero-point joker assigned to a letter in
the selected set, fixed when accepted.

All words formed by a move, including cross-words, receive independent opponent votes.
The author cannot vote. Each word needs `ceil(opponents / 2)` approvals: one approval
with two or three players, two with four. A move commits when every word meets its
threshold; it is rejected as soon as any word can no longer meet its threshold.
Rejected moves leave the rack and board unchanged and end the turn. There is no
external word validation, vote timeout, or turn deadline.

Exchanges require seven tiles left in the bag, draw before returned tiles re-enter,
and end the turn. Games end when the bag is empty and a player empties their rack,
or after twice the player count in consecutive scoreless turns. Remaining tile points
are deducted; a player who goes out receives opponents' remaining points.

English/German presets and per-user named custom sets define letters, quantities, and
points. Unicode letters (with combining marks) are normalised to NFC uppercase; `ß`
becomes `ẞ`. Symbols, digits, duplicate letters, and multi-letter tiles are rejected,
except `*` for jokers. Custom sets contain 28–500 tiles, at most 80 different letters,
1–100 copies per letter and 0–20 points per tile; jokers score zero. Users can keep
50 saved sets. Editing/deleting a saved set leaves existing rooms' copies intact.

Synchronous SQLite transactions apply commands with a request ID and expected version.
Repeated IDs with the same body return the current snapshot without applying the action
again. Changed bodies or stale versions are rejected. HTTP/SSE project a viewer's own
rack and opponents' counts; the bag and internal state are private. Game history retains
the latest 100 entries. Streams reconcile every five seconds; client queries/visibility
changes recover missed updates. Pending votes and state persist across backend restarts.

The active room uses a viewport-sized board workspace with a persistent private rack
and move controls. Small screens begin in overview, then zoom to 44-pixel squares for
panning and placement. Accepted moves restore overview. A `ResizeObserver` sizes the
board from the available space; sufficiently large screens support direct placement
without zoom controls. Wider screens place the rack beside the board. Camera changes
are client-only and preserve draft placements. The board uses one roving tab stop;
arrow keys navigate squares, Home/End navigate a row, and Ctrl+Home/End navigate
the board corners. Enter/Space activate the focused square. The header shows the current player's score explicitly.
Scores/history, rules, extra actions, joker letters and word approval use native dialogs;
Rules is available in the side panel and includes a visual bonus legend. History list
padding keeps three-digit numbering and wrapped text inside its accordion. Opponents can dismiss approval to
inspect the board and reopen it from the rack area. Bonus squares display `2×` or `3×`,
with word labels filling the square and letter labels at half that size. The centre
also keeps a small starting-square star. Screen-reader labels name the multiplier
and whether it applies to a letter or word.

## Theme and navigation

Antique paper is available in the shared picker and is Vortoj’s default: warm
aged-paper background `#f3e8c8`, near-black ink `#231f18`, and system sans-serif.
Saved per-app theme choices take precedence over the default.

Every Vortoj page uses the app-owned Shell around the shared
`@repo/shared/navigation` SidePanel, including sign-in, lobby, invitations, active
rooms and missing pages. The single outlined burger appears in a compact page
header; active rooms retain their room name, player identity, turn status and
personal score while sharing the same burger. The old app links and account row
are removed. The native panel is a modal left drawer below 1280px and a nonmodal
240px column at wider widths. The drawer has an X close button on mobile; desktop uses only the menu toggle to
collapse or expand the column. Its icon morphs from a burger when closed to an X
when open; reduced-motion preferences disable the transition. The desktop column starts expanded unless the
app-prefixed `side-panel` preference records collapse; mobile always starts closed.
Rules, Your rooms and Settings are consistent on every page; authenticated users
also get Sign out. All apps remains a separated return link at the bottom.
Game-specific scores and history stay behind the room score button. Rules is one
app-wide dialog, available without a game or account. Shell owns one Settings
dialog. Native modal focus containment, Escape and backdrop dismissal restore focus
to the burger. Resizing switches modes without saving a mobile open state.

## Account UI state

Vortoj's account flow uses a local typed model (`account-model.ts`), messages and
pure `init`/`update` functions that return the next model and explicit commands.
The component holds one model signal; synchronous dispatch keeps transitions ordered
independently of Solid's deferred rendering. `account-commands.ts` executes HTTP
commands and validates responses. Requests carry IDs, duplicate submissions are
ignored while pending, and component cleanup aborts requests and ignores late results.
Email entry, code entry and signed-in screens are discriminated states. Resending
keeps code entry available if delivery fails. This is a reference implementation of the default client style for coupled state
and asynchronous workflows. Simple independent controls retain local signals;
models remain feature-local rather than becoming one global store.

## Legacy scaffold

The former `/words/` frontend redirects to `/vortoj/`. The previous `words.sqlite` file
was an empty scaffold: it is left on existing volumes, while migrations create
`vortoj.sqlite`. There is no gameplay data to convert.
