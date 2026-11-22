# Kunludo decisions

## Kunludo rewrite requirements — 2026-11-09

The user requested analysis and a plan to rewrite the Lamdera Kunludo app
(`lamdera-playground/menschaft`) in this repository's current style, with existing
email authentication and invitation-based team membership. A user may belong to any
number of teams and plan in one combined schedule, including the 3rd and 4th teams.
Show a team multi-select when there is more than one membership. Its default is no
selection, meaning all teams; selecting teams shows their union.

The [rewrite plan](kunludo-plan.md) records source behavior and proposed
same-day conflict handling. Separate availability/commitments, role permissions,
the commitment policy and delivery phases are proposals, not settled user choices.
The account/join-code and admin rules below supersede earlier invitation proposals.
Implementation is recorded below; the source analysis remains in the rewrite plan.

## Manual calendars and teams across clubs — 2026-11-14

After reviewing the possible TT-Live ID-based integration, the user rejected it as
too brittle. Keep manual iCalendar file import per team. Do not implement club/team
discovery, remote calendar fetching or automatic synchronization. Use validated
uploads, a preview, duplicate detection and reviewed updates on re-import.

One email-authenticated player may have any number of invited team memberships,
including teams in different clubs and adult/youth categories. The user's example
is a young player in the adult team of one club and the boys team of another.
Teams are independent; a club is not a required ownership or authorization boundary.
Any club/category label is descriptive, and sporting eligibility is outside scope.
Unified scheduling, empty-selection-means-all filtering and conflict handling apply
across all memberships. Team permissions and privacy remain enforced separately.
See the [updated rewrite plan](kunludo-plan.md) and implementation record below.

## One player identity and group join codes — 2026-11-14

The user clarified that the signed-in account is the player. Collect one display
name on first login and use it for every team; no choosing roster names or adding
independent named players. The roster consists of joined accounts.

Invitations use a shared two-part code: a permanent group/team ID and a changeable
PIN of exactly six alphanumeric characters. Any authenticated account knowing the
current code may join; this replaces email-addressed, single-use invitations.
The creator is admin and can promote connected members to admin and remove users
from that group. Permissions are local to each group, across any clubs/categories.

The user clarified that admin removal of a member rotates that group's PIN; normal
account sign-out does not. The group ID stays fixed and other members retain access.
Removal and rotation must be atomic and safe to retry without rotating again.
Proposed last-admin protection, PIN alphabet/digest storage and throttling are
implementation defaults in the rewrite plan, accepted when implementation was requested.

Team creation must not accept creator/player names or an initial named roster. Use
the authenticated account's ID and display name, making that account the first admin.
Other members join as their own accounts through the shared code.

## Kunludo implementation — 2026-11-14

The user approved implementation of the clarified requirements and remaining
defaults: preserve the last admin, normalize lowercase PINs to uppercase, and allow
any authenticated holder of a current code to join, including a previously removed
member. Use availability plus separate commitments for conflicts.

Use a single app database/transaction boundary for all teams so overlapping
commitments and member-removal/PIN rotation cannot race across app files. Game
collections are typed JSON inside their owning team row; membership/commitment and
retry/throttle data are separate tables. This fits the single-instance hobby scope
without adding a store framework or service. Active membership authorizes reads
and writes; source calendar ownership and club/category labels grant no access.

Keep PINs encrypted as well as HMAC-protected so admins can share the same current
code without invalidating invitations every time they view it. Expose decrypted
PINs only on the explicit admin code endpoint. Removal rotates the PIN exactly once
per command ID, keeps the group UUID stable and preserves all other memberships.

Manual imports detect the common source-team name, with UID deduplication, preview and
reviewed updates. The user requested the real third/fourth-team calendars as test
fixtures; downloaded 20 games from each, excluding irrelevant contact properties.
These files are tests only, not a live provider integration.

The shared auth verify API accepts an optional display name. A valid unused code
for a new address requests a name without consuming the code; an existing account
needs no new name. This avoids a separate public account-existence check and leaves
Vortoj's existing named-verification calls compatible.

## Kunludo heading copy — 2026-11-14

The user rejected redundant heading copy. Keep one page heading (Deine Teams /
Alles im Blick), without the Gemeinsam spielen/planen eyebrow or a repeated
team-count/account/name line. Account identity already appears in the header.

## Kunludo copy and timezone selection — 2026-11-14

Apply the product-copy rules as acceptance criteria across all apps. Avoid duplicate
headings, repeated account identity and narration of routine actions; review visible
copy before completion. Concrete rejected examples are recorded in AGENTS.md.

Team creation and settings use a native timezone dropdown with Europe/Berlin as the
creation default. Offer the browser's supported IANA zones plus UTC and preserve an
existing team's stored zone even when the browser lists a different canonical alias.

## Kunludo calendar selection — 2026-11-14

Detect the calendar team as the unique name present in every match, considering
both home and away sides. If ambiguous, an exact match with the current team's
name may resolve it; otherwise show an error rather than guessing. Remove the
team dropdown. Import rows have visible checkboxes and a marker for selected rows.

## Kunludo name — 2026-11-14

The user chose Kunludo in place of Zusammenspiel. Use Kunludo in the interface,
`/kunludo/` and `/api/kunludo/` for routes, and `@repo/kunludo` for the package.
The app has never been deployed, so there are no legacy routes, storage aliases or
backward-compatibility code. Its database is `kunludo.sqlite`. Existing local preview
data was migrated once outside application code.

## Kunludo response groups — 2026-11-14

Group the expanded match roster by effective response, with a heading and member
count for each non-empty group. Keep unanswered players in their own section.
Sort names alphabetically within groups, keep reserve controls beside the player,
and avoid repeating the section's response label on every row. Commitment and
conflict states remain distinct from ordinary availability responses.

## Kunludo ordinary availability — 2026-11-14

The regular match card offers Ja / Vielleicht / Nein. Explicit commitment and
release controls belong only inside an actual overlap's conflict panel. A
same-day notice without overlapping time windows has no commitment controls.
A normal Ja already counts as available when there is no unresolved overlap.

## Kunludo save feedback — 2026-11-14

Show successful action confirmations as a fixed toast, visible at any scroll
position, rather than inserting a banner into page content. Use the current theme,
a polite live status, manual dismissal and automatic dismissal after five seconds.
Tie dismissal to the completed request ID so an older timeout cannot clear a newer
confirmation. Keep actionable errors and retry controls persistent.

## Kunludo roster readiness and admin responses — 2026-11-14

Prefix upcoming match headings with ✅ when the available count meets the required
team size. If players are missing, use ⚠️ at least fourteen days before the start
and ❗ inside fourteen days. Include accessible descriptions and keep the numeric
count. Do not add readiness warnings to past or cancelled matches.

Admins can set a joined player's Ja / Vielleicht / Nein response for a match.
Authorization is enforced on the server; the normal conflict rules still apply,
and admins cannot force a commitment or release a commitment in another match.
Players may subsequently change their own response. Reserve marking remains only
a per-match label and does not change the availability count.

Show match dates and start times without an end time. Table-tennis match duration
varies. Retain the planned end for overlap calculations and scheduling edits.

## Kunludo compact planning view — 2026-11-14

The user selected team creation and joining only in the Teams view, with both
buttons also visible for accounts that have no teams yet. Remove the large
planner page headings; Spiele / Teams tabs already identify the view. The games
view starts with navigation, filters and the match list.

## Kunludo review corrections — 2026-11-15

Explicit iCalendar cancellations must not appear as active games. Import STATUS:CANCELLED
and calendar METHOD:CANCEL through the same cancellation operation as manual actions,
revoking commitments and clearing reserves/proposals. Repeated cancellation is idempotent;
missing entries alone do not cancel matches.

Every file selection invalidates the previous import preview before reading or validating
it. Selection generations reject late successes and failures. Admin code responses carry
the app revision so a delayed response cannot restore a PIN invalidated by a newer snapshot.

## Debounced admin email — 2026-11-15

The user requested admin notifications for availability changes, delayed until five
minutes after the last change to avoid one email per match during initial entry.
Persist the mail queue in SQLite so pending summaries survive backend restarts.
Batch across all players per team with separate recipient deliveries. Every actual
availability change restarts the team-wide quiet period. Include final changes and
exclude edits made by the recipient; retry failed recipients independently.

Use one app-owned table and a bounded worker in the existing backend. Claims have
recoverable leases; later changes survive in-flight delivery. Retried summaries merge
with newer pending edits and wait for their quiet period. Recheck permissions and
current match data at delivery. Keep shared auth/mail boundaries and local no-op
mail behavior. No additional queue service, dependency or infrastructure is needed.

## Accessible page structure — 2026-11-22

The request to resolve the axe findings supersedes the compact planning view's
omission of page headings. Keep one concise, visible h1 (Spiele or Teams) in the
planner's main content on every viewport; do not add a repeated account name or
introductory copy. The standalone sign-in screen uses main instead of section,
with its existing layout preserved. Shared menu headings are neutral containers,
not additional page banners.
