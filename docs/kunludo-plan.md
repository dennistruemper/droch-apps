# Kunludo rewrite: analysis and implementation plan

Status: implemented locally on 2026-11-14. Source analysis prepared 2026-11-09;
confirmed requirements and implementation notes have been kept current. See
[architecture](architecture.md#kunludo) for the shipped design and
[verification](implementation-plan.md#kunludo--implemented) for checks.

## Baseline and evidence

The user requested a new worktree from current remote master. The remote has no
`master`; its default branch is `main`. After fetching, this worktree was created
from `origin/main` at `59732a4477b8253f5b05616594f19233ec7040f0`, on branch
`codex/kunludo-plan`. The original checkout and its uncommitted work are untouched.

Source reviewed: `/Users/dennis/git/lamdera-playground/menschaft`, source HEAD
`e4ccfef7bffa606dea8d59a0634a94df5c7f332e`. The UI calls it **Kunludo**.
This is a static source review, not a runtime verification or production-data audit.
The feature document contains aspirations; the inventory below follows current code.

Source references (relative to that source repository):

- `src/Types.elm`: records, messages and supported operations.
- `src/Backend.elm`: access-code checks, mutation rules and team broadcasts.
- `src/Frontend.elm`: UI, schedule, date polls, readiness, import and sharing.
- `src/IcsParser.elm`: supported ICS parsing and team inference.
- `src/Utils.elm`, `src/LocalStorage.elm`: identifiers, dates, links and storage ports.
- `FEATURES.md`: intended scope, not proof of implementation.

## Existing features

| Feature                 | Implemented behavior                                                                                                                                                                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Team creation           | Name, creator name, additional roster names, required player count; generated team identifier, slug and access code. The form has an access-code field, but the backend generates the actual code.                                                                           |
| Team access and sharing | Team URL and shared access code; share dialog with link copying and QR code; remembered access codes in browser storage.                                                                                                                                                     |
| Player identity         | Select an existing roster name or add one, remember the active member locally, clear that local selection on logout. No verified personal account.                                                                                                                           |
| Roster                  | Create initial members and add further names; display roster. No implemented member removal or role enforcement.                                                                                                                                                             |
| Manual games            | Opponent, local date/time, home/away and venue. Stored UTC start, season, Hinrunde/Rückrunde and matchday fields.                                                                                                                                                            |
| Schedule                | Chronological upcoming games, expandable match details, collapsed past-games section with load-more. Stored season halves do not constitute a separate season-management UI.                                                                                                 |
| Availability            | Yes / no / maybe per game; unanswered is distinct. Personal controls, counts and lists of responders.                                                                                                                                                                        |
| Readiness               | Required-player threshold, available/maybe totals and named reserves; ready / possible / insufficient / past indicators. Open date proposals also flag attention.                                                                                                            |
| Rescheduling            | Direct start-date/time changes clear existing game responses. Alternative dates can be proposed and receive yes/no/maybe responses. Choosing one copies that date's poll responses to the game and clears its polls. Original start is retained when proposals first appear. |
| Reserves                | Add/remove free-text substitute names per game; names count toward availability without linked accounts.                                                                                                                                                                     |
| TT-Live ICS import      | Local file selection, parsed-game preview, per-row selection and future games preselected, followed by game creation. Opponent, home/away, start and location are extracted.                                                                                                 |
| Live updates and UX     | Lamdera broadcasts to sessions registered for a team, German copy, responsive controls, dialogs, UTC-to-local display and local-to-UTC entry conversion.                                                                                                                     |

Not implemented despite being mentioned in `FEATURES.md`: email authentication,
real user invitations, roles, enforced admin-only editing, multiple-team account
membership, unified planning, conflict resolution, general match editing/deletion,
bulk availability, email notifications, calendar export, team analytics and settings
such as sport/access-code rotation. ICS import is file-based, not a live subscription.

Important limitations to avoid carrying forward:

- The shared code authorizes operations, not the selected person's identity; callers
  can submit another member ID. It is not an account or role system.
- Team identifiers/codes use a deterministic random seed. Rewrite tokens must use
  injected cryptographic randomness, with protected storage for bearer tokens.
- Reserve mutations can locate a different team by match ID after checking the
  supplied team's code. Always authorize the actual target match and its team.
- Session broadcasts have no account-revocation model. Authorize every read/write
  and stream, including membership changes while a connection is open.
- Import infers the home team by frequency rather than reliably using the selected
  team. It discards ICS UID, so repeat import can duplicate games.
- Readiness uses an approximate date heuristic, not a real fourteen-day interval.
  Use explicit dates and honest counts rather than porting this heuristic.
- Date-only poll responses do not prove availability for a changed time. Reserve
  names also remain through direct rescheduling in the source; reconfirm them.

## Confirmed requirements

- A similar app in this repository, following its current visual style.
- Email authentication through the existing shared account system. On first login,
  enter one account display name used in every team. No selecting a roster identity
  or adding independent player names after login.
- Each team/group has a permanent ID and a shared six-character alphanumeric join
  PIN. Any authenticated account with the current code can join; no recipient-email
  restriction or individual invitation record. The creator is an admin and can
  promote connected members to admin and remove users from the group. Removing
  a member automatically rotates that group's PIN; ordinary sign-out does not.
- Team creation has no creator-name or player-name fields and cannot prepopulate
  named roster entries. The signed-in account becomes the first member/admin;
  its display name comes from account information, not the creation request.
- Users join teams through shared codes; one account may belong to any number of teams.
  Do not introduce a product limit or a single `teamId` on an account. Memberships
  may span any clubs and adult/youth categories; no club, region or age-category
  restriction on joining teams. For example, one player can join an adult team in
  one club and a boys team in another. Invitations and team permissions still apply.
- Import schedules manually from an uploaded iCalendar file per team. No TT-Live
  club/team-ID lookup, remote calendar fetching or automatic synchronization.
- One combined planning list, including the user's 3rd and 4th teams.
- Show team filtering only when there is more than one membership. Initially no
  teams are selected, which means all teams. One or more selections narrow the list
  to the union of those teams, never to an intersection.
- Provide a strategy for games on the same date and a clear user workflow.

The clarified requirements and defaults were accepted when the user requested
implementation. The sections below retain the design rationale; current technical
details are recorded in architecture.md.

## Proposed experience and visual direction

Use **Kunludo**, proposed prefix `/kunludo/`, with German interface copy.
Reuse vendored Drochsign, semantic controls, theme variables, shared `AppSettings`
and `SidePanel`. Use the repository's existing default theme initially; exact app
palette remains optional. Keep the two-colour surfaces, typography, borders and
spacing; status uses text/symbols plus restrained accents, following Observo.
Team names must remain readable without colour. Do not copy Tailwind or edit Drochsign.

Navigation: Spiele, Teams, Einstellungen, Abmelden and the separated Alle Apps link.
The home screen is a date-grouped chronological list with team badge, opponent,
home/away, start, venue, personal answer and team readiness. Expand for roster and
poll details. Put Vergangene Spiele behind a disclosure, newest first.
Keep mobile answers reachable without opening a wide roster matrix.

For two teams, show simple toggle chips/checkboxes labelled `3. Mannschaft` and
`4. Mannschaft`; for many, use a compact searchable multi-select. Show `Alle Teams`
when none are selected and provide a clear-filter action. Do not persist a hidden
last-used filter as the default. An optional URL query makes explicit filtered views
linkable; an ordinary visit with no query always starts with all teams. Reject or
remove inaccessible team IDs. Removing the last selected membership returns to all.
Zero teams shows join-code/create-team actions; one team needs no filter UI.

All teams in a filter are ones the viewer can access; the server enforces this.
Filtering changes presentation only. It must not narrow conflict detection.

## Same-day games: recommended policy

**Availability is not a commitment to two teams.** Keep a player's yes/no/maybe
answer separate from their explicit choice of game when schedules compete.
Do not automatically prefer the higher-ranked team, earliest game or first reply.

1. Flag two games on the same team-local calendar day as a planning warning.
   Same-day alone does not prove overlap. Use team timezone (initially Europe/Berlin),
   not the viewer's timezone, for this comparison; display the timezone if it differs
   from the viewer's so dates remain understandable.
2. Store expected start/end and optional meeting/travel buffers. Distinguish known
   overlapping windows from possible conflicts where duration/transfer is unknown.
   Treat windows as half-open; an exact boundary is feasible only with adequate buffers.
   A simple team duration/buffer default can be copied into each game and labelled
   estimated. Never claim travel feasibility based only on equal/different venues.
3. The player may answer yes to both while deciding. Both rows then show a pending
   choice; count this person separately from safely available players. Maybe and
   unanswered stay uncertain; no does not compete for commitment. Proposed dates
   are tentative and do not themselves reserve the player.
4. Open a small comparison dialog: both games, times, venues, required player count
   and confirmed/pending availability where the viewer has access. Actions:
   commit to this game or the competing team; leave the choice open or release a
   commitment. Non-overlapping same-day games can each be committed separately.
   Display the competing games and their status before submitting. Choosing one records that commitment;
   the other team's effective status becomes `Anderweitig zugesagt` while retaining
   the underlying availability answer. Reopening the choice restores uncertainty.
5. Permit `Beide möglich` only for non-overlapping windows with enough buffer;
   record acknowledgement of a same-day warning. For unknown windows, require
   completion/correction of times first. Known overlaps cannot be overridden by
   a casual acknowledgement; correct the schedule or choose one game.
6. If both teams need the same person, admins coordinate reserves or propose
   another date, then the player chooses. The app highlights shortages and supports
   date polling; it does not decide sporting eligibility or negotiate automatically.
   A personal preferred-team order could preselect a suggestion later, never save it.

Example: Saturday, 3rd team at 14:00–17:00 and 4th at 15:00–18:00. Both initially
show a conflict for you. Choosing the 3rd makes you committed there and unavailable
through commitment in the 4th; the 4th's readiness is recalculated. A 10:00–12:00
and 16:00–19:00 pair may both be feasible once meeting/travel buffers are known.
Choosing the 3rd does not change unrelated non-conflicting games on the same day.

Readiness should expose `sicher verfügbar`, `noch offen` and `fehlen`. A yes with
unresolved competition is pending; a player committed elsewhere is not safely
available. Distinguish safely available from an optional future selected lineup.
Do not claim a team is ready by counting the same account twice or treating maybe
as confirmed. Reserves use joined accounts, not independent roster identities.

The server computes conflict/commitment effects across all active memberships,
including filtered-out teams, in one app database. Commands use expected schedule
and availability versions; choosing a game updates all affected state atomically.
Serialize competing confirmations for the same user. Two tabs cannot independently
confirm overlapping commitments. Refresh and ask the user to review after a stale
write; never silently overwrite their more recent choice.

A schedule edit invalidates affected answers/commitments through a schedule revision,
requires reconfirmation and recalculates related games, even with a hidden team.
Cancellation/removal releases a commitment and recalculates alternatives. Past
commitments remain history; they do not block future games. Model connected conflicts
with all affected games, not one stored pair: choosing A must still respect a third
existing commitment C that overlaps A.

Privacy: players see their own cross-team details. Team members/admins see their
team's statuses and a generic competing-commitment label for a teammate. Do not leak
another team's identity, opponent, venue, roster or time unless the viewer also has
membership there. Hidden-team warnings link to a generic review action. Derived
counts and SSE updates follow the same server-side filtering rules.

## Account identity, join codes and group admins — confirmed 2026-11-14

A player is the signed-in account, not a separately selectable roster record. Ask
for a display name once on first login and use that account name in every team.
Existing users keep their account name; returning sign-in must not ask them to
choose a player or invent another name. A team roster is a list of its joined user
accounts. Duplicate display names are allowed and never merge identities; stable
user IDs identify responses and membership. Do not use email as a public identifier.

Team creation accepts team settings only, with no creator-name, player-name list
or caller-selected creator identity. The server derives creator ID and display name
from the authenticated account and atomically creates the team plus its first admin
membership. Other people appear only after joining with their own accounts. Reject
legacy name-list/creator-identity fields rather than creating placeholder players.

Use existing shared auth ID/name through its public API. Its verify implementation
already stores the name when creating the account and preserves it for existing
users, but its HTTP contract currently requires a name for every verification.
Adjust the auth/account flow as needed to collect a name only for first-time users,
without publicly revealing whether an email has an account. Cover existing Vortoj
consumers. If a profile name change is offered later, it applies across all teams;
do not add team-specific editable aliases or independent name-only player entities.
Linked reserves are joined accounts; defer unregistered named substitutes rather
than reintroducing the ambiguous identity flow.

A team and a group refer to the same entity here. Its creator receives the admin
role. Admins manage games/imports/settings, promote already joined members to admin,
and remove users from that group. Ordinary members edit their own responses/votes
and may suggest dates; admins cannot commit for another player in competing teams.
Use only admin/member roles, not a separate owner/captain hierarchy. Proposed safety
rule: do not remove or demote the last admin without appointing another joined user.

The join code has two parts: the permanent group ID and a PIN of exactly six
alphanumeric characters. Group IDs never change on PIN rotation and are not secrets.
Proposed alphabet: uppercase A–Z and digits 0–9, generated uniformly with injected
cryptographic randomness; normalize typed lowercase to uppercase. The PIN is a team
joining credential, distinct from the shared email sign-in code. It is reusable by
multiple people until rotated, not a single-use or email-addressed invitation.

The user clarified the automatic rotation trigger: when an admin removes a member
from that group, generate a new six-character PIN while keeping its group ID fixed.
Ordinary sign-out does not rotate any PIN or remove any membership. Other joined
users retain access and need not rejoin after rotation.

Join UI: enter group ID and PIN (or open a shared code link), sign in if needed,
then explicitly confirm joining. Merely opening a link never grants membership.
Preserve pending join context through sign-in without leaking the PIN into logs,
referrers or long-lived browser storage. Any signed-in account knowing a valid
current code can join, regardless of club, category or email address. There is no
individual invite recipient to check, expiry requirement, or invitation email system.
A removed person with a subsequently shared valid code can join again under this
rule; do not invent a permanent ban policy.

Authorize joins and check the PIN version transactionally with creating the unique
`(groupId,userId)` membership. Repeated joins do not duplicate members or change roles.
A rotation racing a join either completes before the join (old PIN rejected), or
authorizes that join before rotation. Once membership exists, authorize all normal
requests through that membership, never by repeatedly submitting the join PIN.
PIN rotation revokes old joining credentials, not every existing member's access.
Admin removal revokes only that group's membership/streams and future commitments;
it never deletes the account or removes membership in another team.

Store a keyed PIN digest and an AES-256-GCM encrypted copy in the app database;
inject the key and randomness. Because six characters have limited entropy, throttle attempts
per account, group and source with an overall bound and generic invalid-code errors.
Do not log PINs or include them in ordinary roster/game/SSE payloads. Sharing UI is admin-only: decrypt the current PIN on the explicit code endpoint
for copying/sharing; never store plaintext. An admin can also rotate it explicitly.
Admin removal and PIN replacement must commit atomically, retaining other members
and delivering no new PIN to the removed user. A retried removal command must not
rotate the PIN again: deduplicate it and return the already completed result.
No access to auth.sqlite or new auth-email lookup capability is needed for joining.

Reuse local/test/production email-auth/mail policies: local no-op mail with code
9999, isolated preview/test accounts and random production codes. The group PIN
format does not change these sign-in codes. App permissions remain in Kunludo.

## Proposed technical shape

One workspace package `apps/kunludo` with `src/client`, `src/contracts`,
`src/domain` and `src/server`; explicit public `contracts` and `server` exports.
Use TypeScript, Solid 2/Vite, Hono, Zod, Drizzle and dedicated
`kunludo.sqlite` / `migrations/kunludo`. Reuse shared infrastructure.
No extra service, global client store or cross-app internal imports.

Proposed durable entities:

| Entity                   | Essential responsibility                                                                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Team                     | ID, name, optional descriptive club/category labels, timezone, required players, copied scheduling defaults, version. No required club parent or external provider ID. |
| Membership               | Team + stable auth user ID, admin/member role, active/left/removed state; roster names come from the account, with historical attribution retained.                    |
| Join credential          | Team/group ID, keyed six-character PIN digest, generation/version; no recipient address or individual invitation row.                                                  |
| Match                    | Team, opponent, UTC start/end, meeting/travel buffers, venue, home/away, season/half, cancelled state, schedule revision, version.                                     |
| Availability             | Match + member/user, yes/no/maybe, answered schedule revision, version. No row means unanswered.                                                                       |
| Commitment               | User + match + current schedule revision; preserve/revoke history as needed. Effective competing statuses are derived.                                                 |
| Date proposal / vote     | Exact proposed time window and revision, proposing member; one personal vote per proposal.                                                                             |
| Reserve                  | Match, linked joined account, confirmation revision; avoid counting an account twice. Unregistered named substitutes are deferred.                                     |
| Change / command receipt | Small durable reschedule notices and retry deduplication, not a general event-sourcing framework.                                                                      |

Use app-local foreign keys/composite constraints to prevent cross-team membership or
match mismatches. Auth IDs are cross-file references, never foreign keys into auth.
Index membership by user and group, matches by team/start,
availability by match/member and commitments by user. Query visible matches through
active membership and stable chronological pagination; no N+1 fetches per row.
Membership removal withdraws future answers/commitments and immediately revokes
team reads/streams. Leaving retains coherent historical attribution.

HTTP commands + authorized, versioned SSE snapshots/events. Reuse the repository's
subscribe-before-snapshot/reconciliation approach, checking session and membership
on delivery. Conflict effects can update two teams: persist first, then notify both
with independently authorized projections. Reconnect reloads authoritative state.
No tokens, emails or inaccessible-team details in list/error/event payloads.

Feature-local typed Model/Message/update/commands for account/group-join, schedule,
match editing, polls and conflict resolution. Guard duplicate submits, stale requests,
SSE versions, removal and disposal. Read installed Solid 2 CHEATSHEET before reactive
implementation. Keep dates/randomness/mail/HTTP/storage/DOM effects in adapters.
Pure conflict rules accept explicit time inputs and interval data.

Register the app in `server/src/registry/index.ts`, compose auth dependencies in
`server/src/main.ts`, and add intentional workspace dependencies/exports. Inspect
Docker's explicit manifest-copy/install steps and update where required. Build and
migration discovery already derive from the registry. Extend boundary fixtures and
root navigation coverage; no DNS or Coolify routing changes. Preserve worktree-local
ports/cookies/config/volumes and install separate dependencies if implementation starts.

## Source feature treatment

Retain core schedule, roster, answers, past games, readiness, reserves and date polls.
Use actual instants and timezone-aware conversion, including ambiguous/missing DST
times. Direct rescheduling marks answers stale rather than silently treating old yes
as current. Keep a durable change notice for absent users; SSE is not the notice store.
Prefer reconfirmation after adopting a poll result, since a date-only yes is unsafe.
An exact-window vote could be carried forward only under a later explicit policy.

Retain manual ICS file import, with server validation, bounded files/event counts,
preview and explicit target-team mapping. Use UID plus recurrence identity when
supported for idempotency per team/source; show changed events as reviewed updates
using normal rescheduling policy. Files lacking stable IDs need duplicate warnings,
not automatic merging by opponent name. Explicitly reject unsupported recurrence,
all-day or timezone formats with useful errors. Import is scoped to the team chosen
by an admin, with preview before applying. A fresh upload to that team
previews additions and updates; unchanged games preserve answers, changed starts
require reconfirmation, and missing events never cause automatic deletion.
Do not fetch remote calendars, discover TT-Live teams, or add provider-specific
club/region restrictions. Accept supported iCalendar content regardless of provider.

Existing Lamdera data is a separate migration question. There is no verified export
or account ownership mapping. Do not import shared codes or automatically merge names
into accounts. Start with newly created teams and reviewed ICS imports unless a real
export is supplied; any future migration needs admin-reviewed account attribution
and users joining with their own accounts, never importing name-only identities.

## Manual import and independent teams — confirmed 2026-11-14

The user rejected the explored TT-Live integration as too brittle. The earlier live
endpoint investigation does not define implementation scope. Keep manual `.ics`
upload per team, with validation, preview, duplicate detection and reviewed updates.
No club lookup, team-ID entry, calendar URL fetching or automatic provider sync.

A team is an independent app entity. Club and category, if displayed, are optional
descriptive labels; they do not authorize access or limit memberships. Do not require
all of a player's teams to share a club, association, region or adult/youth category.
Sporting eligibility is outside this planner's rules. Code-based memberships remain
unique per account/team and use team-local roles.

Acceptance scenario: a young player joins an adult team in club A and a boys team
in club B through their shared join codes, then sees both schedules in one list. Each team has
its own manual calendar import. Either/both team filters work, and competing games
are detected across both clubs, including when one team is filtered out. Admins
see only authorized team information, with generic other-team conflict indicators.
Re-importing the same file into one team creates no duplicates and cannot modify
another team's schedule or membership, even when event UIDs match across files.

## Delivery order and acceptance

1. **Shell, accounts and memberships.** Add package/registry, migrations, themed shell,
   email sign-in with first-login display name, create team, shared-code join/PIN
   rotation, admin promotion/removal and team list.
   Acceptance: one account joins both 3rd and 4th teams and adult/youth teams across
   different clubs using the same display name; invalid or rotated PINs cannot grant
   membership; a member cannot perform admin actions. Team creation has no personal
   name fields and uses the authenticated creator. Admin removal rotates only that
   group's PIN once, ordinary logout preserves it, and other members retain access.
2. **Unified schedule and responses.** Manual games, union filtering with empty=all,
   own answers, roster counts, past games, persistence and authorized live updates.
   Acceptance: both teams appear in time order by default; either/both filters work;
   responses survive reload/restart and cross-team reads/writes are denied.
3. **Conflict-safe planning before real rollout.** Time windows/buffers, same-day
   warnings, separate commitments, comparison dialog, effective readiness, privacy,
   rescheduling/cancellation/membership-loss invalidation and durable change notices.
   Acceptance: overlapping yes answers never make both teams look safely staffed;
   filtered-out games still warn; simultaneous confirmations cannot double-book.
4. **Source parity and manual import.** Per-team ICS upload, preview/deduplication,
   reviewed re-import updates, exact-time date polling,
   required-player settings, linked-account reserves and reviewed rescheduling.
   Acceptance: repeat import adds no duplicates, changed starts require reconfirmation,
   reserves do not duplicate accounts, and polling never silently reserves a player.
5. **Verification and rollout.** Use pinned pnpm/mise scripts, meaningful unit/integration
   checks, production build and affected Playwright flows. Inspect mobile and theme
   variants. Verify isolated restart/migrations and hosted proxy SSE when deployed.

Prioritize pure interval/readiness invariants, three-or-more-game conflict chains,
DST/day boundaries, unknown durations, buffer boundaries, schedule edits, stale
completions, simultaneous tabs, transactional joins/PIN rotation, last-admin rules,
revoked-session/membership streams, auth/target-team checks and payload privacy.
Use separate browser contexts for member/admin/removed-member scenarios, real local
9999 auth and no-op mail. Exercise hidden-team conflict warnings, zero/one/many-team
filters, reconnect and response recovery. Avoid tests that merely mirror switch cases.
Verification uses `pnpm check`, `pnpm build`, production image/Compose checks and
Playwright recordings. Current results are in docs/implementation-plan.md.

Deferred: calendar subscriptions/export, automated reminders, team analytics, chat,
league eligibility rules, automatic lineup optimization and legacy-data migration.
Review the proposed commitment UX with a concrete implementation. Verify first-login
naming, cross-team name consistency, name-free team creation with server-derived
creator identity, promoting joined admins, removal/PIN-rotation atomicity and retry
safety, ordinary sign-out preserving PINs, removal isolation, code reuse, stale PIN
rejection and concurrent joins.
