# Kunludo architecture

`/kunludo/` is a German, email-authenticated team planner in one workspace
package. It uses the shared Drochsign styles, settings and side panel. The shared
account is the player: a valid code for a new account leads to display-name entry,
and confirmed returning accounts sign in without entering a name again. Legacy accounts
confirm their shared default once on their next sign-in. Kunludo refreshes its cached
roster name from the authenticated account on snapshot delivery, advancing the app
revision only when the name changes. The auth API's optional
name preserves compatibility with Vortoj. New-account naming is requested only after
code verification; it does not expose account existence to unauthenticated probes.

Independent teams may span clubs and adult/youth categories. Creation accepts team
settings only and makes the authenticated account the first admin. Roster entries
come from joined accounts, not editable name lists. Admins promote joined members,
manage games/imports and remove members; the last admin cannot be removed.

A permanent UUID team/group ID plus a reusable six-character A–Z/0–9 PIN authorizes
joining after sign-in and explicit confirmation. Lowercase PIN input is normalized.
Removal rotates only that team's PIN atomically with withdrawing membership, answers
and commitments; ordinary sign-out preserves PINs/memberships. Existing members
retain access. Joining with a subsequently shared current code is allowed even for
a previously removed account. PINs use HMAC verification and AES-256-GCM encryption
with keys derived from AUTH_SECRET. A dedicated admin-only read reveals the current
code for sharing; normal snapshots and logs contain no PINs. Durable throttles bound
join attempts per account/team and globally.

The app owns `kunludo.sqlite` and `migrations/kunludo`. Drizzle owns
teams (metadata plus typed, validated game JSON), cached account display names,
active memberships, commitments, app revision, command receipts and join throttles.
The account cache is populated from authenticated auth ID/name on create/join/commands,
not from caller-selected identities or direct access to auth.sqlite. Game data
includes responses with schedule revisions, exact-time proposals/votes, linked-member
reserve labels, source UIDs and durable change notices. Reserves never double-count
an account or create an independent named player.

HTTP commands carry a UUID, expected app revision and runtime-validated action.
Synchronous SQLite transactions serialize commands, including cross-team commitment
changes. Receipt fingerprints make retries idempotent and reject command-ID reuse
for a different action; receipts are retained seven days. Authorized per-viewer SSE
snapshots subscribe before initial delivery, reconcile every five seconds and recheck
sessions/membership on each delivery. Slow streams close instead of growing queues.
Removal immediately removes the team from that account's next snapshot.

The schedule shows all memberships by default; selecting teams displays their union.
Conflict detection always includes filtered-out memberships. Availability and binding
commitments are distinct: competing yes answers count as pending, and choosing one
game releases overlapping commitments and marks competing availability generically
as committed elsewhere. End/meeting-travel buffers determine overlap; same-day games
are also flagged for review. Multiple non-overlapping commitments are supported.
Time/venue changes invalidate old answers and commitments. Members without access to
another team see a generic competing-status label, never its private schedule.

Calendars are uploaded manually per team, regardless of provider. Bounded iCalendar
parsing supports UTC, TZID and floating times in the team's zone; it rejects recurrence,
all-day and ambiguous DST inputs. Missing end times use a planned 150-minute duration.
The common team name is detected from calendar summaries; admins select games with checkboxes.
A preview labels new/existing/changed entries; stable UIDs deduplicate within the chosen
team. Re-uploading unchanged games preserves answers; reviewed time/venue updates
require reconfirmation. Explicit STATUS:CANCELLED or METHOD:CANCEL entries cancel matches
and revoke commitments, idempotently. Missing events never automatically delete games. No remote
calendar fetch, TT-Live lookup or automatic synchronization runs in the app.

Account and planner workflows own feature-local typed models/messages/pure updates.
Adapters handle HTTP, files, clock, confirmation, clipboard and browser navigation.
Dispatch uses a synchronous current model independently of Solid's rendering flush.
Request IDs, editor generations and snapshot versions reject stale completions and
file reads. Each file selection clears the preceding preview and advances its generation,
including invalid selections. Admin PIN responses carry the app revision and are rejected
when older than the current snapshot. Uncertain network writes retry the same command UUID; request disposal
aborts HTTP and closes SSE. Drafts survive live updates; stale editors require an
explicit review before resubmitting. Settings/theme data stays app-prefixed.

Kunludo roster responses can also be set by a team admin for an existing member;
server authorization and ordinary conflict handling apply. Match headings show
readiness icons based on available players and a fourteen-day threshold, with the
current clock supplied by the planner model. Public date labels show start times;
planned ends remain part of the scheduling window used to detect overlaps.

## Availability email queue

Explicit answer changes, including admin-entered responses and commitments that
change an answer to Ja, enqueue notifications in the same SQLite transaction.
One pending batch per team/admin coalesces all players until five minutes after the
last actual availability change by anyone in that team. Current admins receive summaries except for edits they made themselves.
Game cancellations, rescheduling, reserve flags and poll votes do not enqueue answer
notifications. No email address is exposed through the app API or stored in the queue.

The backend injects the shared mail sender and a server-only auth delivery-address
lookup. The app owns its persistent queue, retry/lease worker and graceful asynchronous
cleanup. Read the [worked example and delivery details](email-notifications.md).

Calendar and snapshot date helpers lazily reuse at most 64 immutable ICU date
formatters across locale/options combinations. FIFO eviction bounds retention of
user-supplied timezone names; formatting and DST validation keep their existing semantics.
