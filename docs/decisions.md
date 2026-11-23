# Decisions

## Visible CI jobs — 2026-11-23

The owner requested a workflow graph that shows running and failed layers directly.
Split quality checks, unit/integration tests and the production image build into
independent jobs. Disable matrix fail-fast so one failure does not cancel sibling
checks. Build the instrumented image once, transfer it as a one-day artifact, and
run functional browser coverage and axe concurrently on separate runners with their
own disposable production Compose stacks. Retag the image using each checkout's
existing worktree identity; do not transfer databases or generated runtime secrets.
This supersedes the single-job/shared-stack CI arrangement below. Local commands
and the no-retry policy remain unchanged.

Download both coverage reports into a separate PR-only changed-line gate. Attempt
that gate even after suite failures so available reports still provide diagnostics;
missing artifacts or reports fail it. Preserve coverage summaries, PR comments,
failure artifacts and cleanup. Keep `foundation` as an always-running final gate
requiring every job to succeed; only the PR-only coverage job may skip on main
pushes. This preserves the active required-check name without changing GitHub rules.
The graph and final result table expose failures without opening combined logs.
Artifact transfer and repeated runner setup add overhead; measure hosted timings
before claiming a speed improvement.

## No Playwright retry masking — 2026-11-23

The owner requested disabling test reruns so intermittent failures remain visible.
The pinned Playwright version already defaults to zero retries. Make `retries: 0`
and `failOnFlakyTests: true` explicit in the shared base config inherited by both
functional and axe suites. Keep project/CLI/CI overrides from weakening this policy;
reproduce and fix the underlying problem rather than relying on reruns.

## Parallel browser and accessibility checks — 2026-11-23

The owner requested overlapping functional browser coverage (H) and accessibility
(L) and measuring the result in CI. Use a native parallel step group after stack
startup, retaining both blocking outcomes and waiting for both before cleanup.
Reuse the same isolated production stack; tests create independent accounts and
rooms. Put Playwright outputs in sibling directories so either suite can clear its
own output without removing the other's artifacts. Axe has its own reporter and
does not enable the functional suite's coverage hooks. Preserve failure reporting,
the changed-line gate and artifact uploads. Compare real workflow/step durations
with the preceding successful sequential run; account for overlap and runner noise
rather than summing parallel durations. The initial shared-stack run exposed a real
Kunludo bug: unrelated private-account revisions disabled an open calendar import.
Fix the production editor's revision handling and retain the shared stack; see
[Kunludo's decision](../apps/kunludo/docs/decisions.md#unrelated-revisions-during-editing--2026-11-23).
A timed-out failing run is not a valid performance comparison.

## Changed-line coverage gate — 2026-11-22

The owner requested the proposed 90% gate and instructions for agents. Require 90%
of added/modified executable lines in each PR, using pinned, hash-verified diff-cover
against the target merge base. Run within required `foundation` so failures block
merging without adding a new branch-rule check name. Combine Vitest and browser
LCOV by source path/line with covered-in-either semantics; do not average totals or
merge incompatible statement/function/branch identities. Full Git history and the
PR target SHA avoid dependence on checkout depth or a hardcoded main branch.

Keep overall coverage informational. This supersedes the initial no-gate policy;
it is a changed-line minimum, not a historical no-regression comparison or Teamscale
test-gap history. Missing reports/tool errors fail; no executable diff passes.
Require meaningful tests for failures, with no threshold reduction or source ignores
without explicit owner agreement. Document agent duties in `AGENTS.md` and local
commands/report locations in README. Python is isolated development tooling, not an
application or production-image dependency.

## Coverage in PR comments — 2026-11-22

The owner requested readable coverage results without downloading archives. Use the
pinned `davelosert/vitest-coverage-report-action` for both existing report formats,
with separately named, updating Vitest/browser comments and totals for all four metrics.
The owner also requested `all` and `changes` views for each suite: keep the all-files
table collapsed and expand changed files by default, sorting both by branch coverage.
Reuse the same coverage data; the views filter file tables and do not change totals. Omit long uncovered-line
link lists from comments to keep their size manageable. Publish Actions job summaries
on every run and update the PR comment when the token permits it. Keep HTML artifacts
for detailed inspection; do not add a hosted coverage service. The initial
no-percentage-gate policy is superseded by the changed-line decision below.

## Browser coverage — 2026-11-22

The owner requested coverage for the existing browser suite. Instrument frontend
modules with Istanbul only in a coverage-enabled test build, then collect counters
through a shared Playwright fixture, including independent player contexts and
document lifecycle transitions. Remap through source maps to TS/TSX and publish
lines, statements, functions and branches as a separate CI artifact. Avoid relying
on Chromium's coverage retention across document navigation. Keep the ordinary
production build uninstrumented. Coverage reports describe execution, not assertion
quality; no new percentage gate is introduced.

## Vitest coverage — 2026-11-22

The owner requested Vitest coverage and asked about coverage for the current code
delta. Use Vitest's matching V8 provider and native changed-file reporting, with
HTML for inspection and LCOV/JSON for further analysis. Run coverage once within
the existing quality checks and publish the report in the same CI job. Include
unimported source files to avoid overstating coverage. Establish a visible baseline
without an arbitrary percentage gate. Exact changed-line or historical test-gap
analysis would need additional tooling; it is not provided by this setup.

Recorded on 2026-10-02. These capture agreed constraints and implementation choices; milestone status lives
in the implementation plan.

## Agreed choices

| Decision                                      | Rationale / consequence                                                                                          |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| One monorepo, one backend, a frontend per app | Share infrastructure while keeping app features modular.                                                         |
| TypeScript throughout                         | One application language, with type safety and fast feedback as priorities.                                      |
| Solid 2 without SolidStart                    | Interactive apps; Solid 2 prerelease risk is accepted. Landing pages can use another technology later.           |
| Paths on one origin                           | New apps require no additional DNS or Coolify routing configuration.                                             |
| One package per app                           | Earlier contract/domain/server packages per app were excessive. Internal modules are folders with explicit APIs. |
| pnpm and Node 24 LTS                          | Preferred over Bun for package management and runtime.                                                           |
| Drizzle and SQLite                            | Drizzle retained; SQLite files per app and shared auth replace the initial PostgreSQL schema plan.               |
| Custom authentication                         | User prefers a focused implementation over Better Auth. Passwords and password hashes are excluded.              |
| Email code or link through Mailtrap           | Email-based account access; email codes are the current baseline.                                                |
| Docker Compose persists SQLite files          | One deployable stack and a similar local environment.                                                            |
| No Effect library                             | Use pure functions and explicit dependencies with ordinary TypeScript.                                           |
| Drochsign CSS starting point                  | Semantic HTML, minimal classes, two-color themes; themes can differ by app.                                      |
| Independent worktree development              | Multiple apps/branches can be worked on and run concurrently.                                                    |

## App-specific documentation

Read only the app documentation relevant to the task:

- [Poker](../apps/poker/AGENTS.md)
- [Vortoj](../apps/vortoj/AGENTS.md)
- [Schlezaz](../apps/schlezaz/AGENTS.md)
- [Enigmo](../apps/enigmo/AGENTS.md)
- [Kunludo](../apps/kunludo/AGENTS.md)

## Tradeoffs accepted

- Paths share one browser origin. Storage keys need app prefixes. An app reset can
  delete only its keys, but browser-level site-data deletion affects all apps.
- Namespaces are not security isolation between same-origin apps.
- One application deployment releases and restarts all apps together. Clients must
  reconnect and recover durable state after a restart.
- Custom auth means this project owns verification, throttling, sessions, and their tests.
- TypeScript and Solid cannot provide Elm's compiler-enforced purity guarantees.

## Proposed implementation defaults

These were recommended during planning and can be refined during setup. They are
not additional fixed product requirements.

- mise manages exact Node and pnpm versions; project commands remain in `package.json`.
- Hono HTTP backend; Zod schemas; HTTP commands with SSE for live updates.
- Custom email-code login, account creation on successful first verification,
  server-side revocable sessions, and HttpOnly cookies.
- Oxc-based Solid compilation, Oxlint, Oxfmt, Vitest, and Playwright.
- One shared workspace package with folder modules for auth, mail, database,
  browser storage, and styles; one server composition package.
- One backend instance, with SQLite as the durable source of truth.

## Foundation implementation choices

- Exact dependencies and lockfile are recorded with Node 24.21.0 and pnpm 11.25.0
  tool pins. Solid 2 RC, the official Vite plugin, and Router 2 are verified together.
- Hono, Zod, strict TypeScript, Oxlint, Oxfmt, Vitest, and Playwright are implemented.
- Drochsign uses a reviewed vendored snapshot with integration overrides in a separate
  file. Updates are explicit; builds never fetch a moving branch.
- `pnpm dev` generates an ignored Compose override and runtime settings per checkout.
  Docker dependencies have their own per-checkout volumes to avoid native-binary
  and dependency-link collisions with host installations.
- Quality checks run on the host/CI before deployment. Docker builds type check and
  compile independently because Oxlint JS plugins currently crash in small Linux
  VMs ([upstream issue](https://github.com/oxc-project/oxc/issues/20331)).

## Persistence revision — 2026-10-03

The user clarified that this is a small hobby project and chose one SQLite file per
app plus one for auth. This supersedes the initial PostgreSQL process/database/schema
choice. Keep one backend process: auth exposes ordinary TypeScript functions without
network calls. Apps receive stable user IDs and own authorization and game state.

- Auth and apps own separate migration histories; shared infrastructure handles files.
- No cross-file foreign keys or atomic cross-file transactions; do not use ATTACH to
  bypass ownership. Coordinate account lifecycle explicitly and never reuse user IDs.
- WAL, short transactions, and a busy timeout fit modest concurrent usage. Do not add
  multi-instance hosting, service discovery, or queues for hypothetical future scale.
- One persistent Docker volume holds all files, so adding an app requires no new
  Coolify storage configuration. Each checkout gets a separate volume.
- Backups cover all files coherently. The old local PostgreSQL volume is retained,
  but the container and PostgreSQL dependencies are removed.

## Custom themes — 2026-10-04

The shared Settings picker includes a Custom option for each app. The initial
editor exposes background and foreground colors to match Drochsign's two-color design.
The first Custom selection copies the active preset's colors and font family. Edits preview immediately
and persist per app in browser storage; switching presets keeps the customization saved.
A Use app default button restores each app's default theme. Stored colors must be six-digit
hex values; malformed preferences fall back to white/near-black. Native controls follow
the background's light/dark scheme.

The user requested font customization on 2026-10-04. Custom themes offer system
sans-serif, serif, and monospace using local font stacks, with no font downloads.
Font choice is saved alongside colors and applies to app text and controls. Existing
color-only preferences keep their colors and default to system sans-serif; unknown
stored font values also fall back to this default. Preset selection removes the custom
font override. Spacing, rounding, border, and motion tokens remain developer-controlled; exposing more controls is a future product choice.

## Build and CI efficiency — 2026-10-04

Measurements showed compilation was already fast: 2.6 seconds for the GitHub Docker
build's type check and complete compilation. Dependency installation and recursive
ownership changes dominated local source rebuilds. Fetch dependencies before copying
source, using the lockfile and workspace settings as the cache boundary; install
offline with copy imports from the image-layer store. Create files with their intended
ownership and keep the runtime non-root. Adding an app needs no Dockerfile package list.

Build production once and run browser tests against that artifact with production
migrations and isolated disposable data. Keep development worktree identity tests;
verify actual development startup/hot reload when changing its tooling. Retain the
Playwright-managed browser, sequential quality checks and one CI job. The production
image build and browser/system-dependency installation run in a native parallel step
group, then both must succeed before the test stack starts. This overlaps independent
setup without duplicating runner/tool/dependency setup. The prior hosted run spent
40 seconds building and 26 seconds installing the browser; actual savings depend on
runner contention and must be measured on the next hosted run. Persistent CI Docker
caching remains an option to evaluate.

## Coolify runtime origin — 2026-10-05

Use Coolify's runtime `SERVICE_URL_APPLICATION` as the canonical public origin when
present and nonempty, otherwise use `APP_ORIGIN`. The preview container had the correct generated
URL while an `APP_ORIGIN=$SERVICE_URL_APPLICATION` alias retained the production URL.
Reading the generated value at startup avoids that expansion dependency and follows
future preview numbers automatically. Validate the selected URL strictly and fail
closed for malformed values; do not infer trusted origins from request headers or
accept every preview subdomain.

## Main branch protection — 2026-11-22

The user approved an active ruleset for `main`: require PRs, the GitHub Actions
`foundation` status check, up-to-date branches and resolved review conversations;
block force pushes/deletion and leave the bypass list empty. Require zero approving
reviews to support solo maintenance and CI-gated Renovate updates. Do not require
signed commits or a merge queue. Record the settings and maintenance process in
[repository protection](repository-protection.md); apply them in GitHub separately
from the documentation PR. Neither administrators nor Renovate receive a bypass.

## Still to settle

- Account deletion, email-change behavior, and app-data cleanup across independent files.
- Backup destination, retention, and operational restore procedure.

## References

- [Solid 2 announcement](https://github.com/solidjs/solid/discussions/2995)
- [Drochsign](https://github.com/dennistruemper/drochsign)
- [Coolify Compose](https://coolify.io/docs/applications/builds/docker-compose)
- [Drizzle migrations](https://orm.drizzle.team/docs/migrations)
- [mise](https://mise.jdx.dev/)

## Shared side panel — 2026-10-08

Extract navigation as a browser-safe public shared module; apps own the content.
At 1280px or wider, use an expanded column by default and remember explicit collapse
per app. Below that width, use a native modal drawer, initially closed, with native
keyboard focus behavior. The toggle uses an outlined burger/X and respects reduced
motion. The separate drawer close button appears only on mobile.
See [Vortoj's navigation decisions](../apps/vortoj/docs/decisions.md#vortoj-navigation-on-every-page--2026-10-09)
for its app-owned menu and page shell.

## Review fixes — 2026-10-08

Retain throttling records when mail delivery fails, while making the failed code
unusable. Match the request timestamp as well as its digest so a late failure does
not invalidate a newer fixed test code.

## Feature-local Elm-style client models — 2026-10-09

The user chose feature-local typed models, discriminated messages, pure updates and
explicit commands as the default for new coupled or asynchronous client features.
Keep I/O in adapters, guard duplicate and stale completions, and retain synchronous
transition ordering independently of Solid rendering. Simple independent controls
and browser layout state remain local. Do not introduce a global store or state
framework. See [AGENTS.md](../AGENTS.md#client-state-style) for the contributor rules
and [Vortoj's implementation history](../apps/vortoj/docs/decisions.md#feature-local-elm-style-client-models--2026-10-09)
for the concrete reference.

## Account modes and limits — 2026-10-04

User decision:

- Local tests always use **9999** without sending mail. Coolify test/preview stages use
  **9999** and send through Mailtrap. Production sends random codes through Mailtrap.

Implementation defaults:

- Six-digit random production codes expire after ten minutes, with five attempts,
  one-minute resend throttling, five requests per hour per address and thirty active
  addresses per minute across the service. Sessions expire after 30 days; logout revokes.
- `AUTH_MODE` explicitly distinguishes local (`local`), preview (`test`) and production
  (`production`) builds. Local mode never sends, even if a token is present. A missing token
  on localhost selects no-mail test behavior. Public production without mail credentials
  has account sign-in disabled. Test mode uses isolated data and does not prove email ownership.

## Scoped agent documentation — 2026-11-09

The user requested app-specific agent context in the app directory to avoid loading
unrelated product details. Root instructions and shared docs keep cross-project
constraints and short app links. Each app owns an `AGENTS.md` entry point plus local
architecture, decisions and implementation status. Read the relevant app instructions
when working on its code, migrations or external tests; do not read every app by default.

## System appearance defaults — 2026-11-14

Theme preference is central shared functionality. With no valid stored choice,
follow prefers-color-scheme and update when the operating-system preference changes.
System in the theme picker restores this behavior; Use app default also selects
System. Explicit presets and custom palettes remain app-specific and take priority.

Each app declares themes.light and themes.dark in its app definition. Kunludo,
Poker uses Paper / Ink. Vortoj keeps Antique paper for light and uses Ink
for dark. Enigmo keeps its own light palette and uses Ink for dark. SchleZaZ has
matching light/dark variants of its own palette. The shared AppAppearance provider
wraps each app from startup, including signed-out pages; Settings consumes it rather
than creating independent theme state on each screen. Media listeners clean up on
disposal. No account, network request or state-management package is needed.

## Shared account names and game identities — 2026-11-15

The account display name is shared across authenticated apps. Existing accounts set
or confirm it once on their next verified code sign-in; new accounts set it once.
Persist confirmation in auth and preserve existing sessions and IDs. Never disclose
whether naming is needed until a valid code is verified, and do not consume that
code while requesting the name. Once confirmed, later sign-ins do not ask again.

Vortoj uses the account name as the default for creating/joining a game, while allowing
a different name in each game. Keep aliases in the game and shared identity in auth;
account confirmation must not rewrite existing game names or expose account names to
other players who only know the chosen game alias.

## Anti-slop lint rules — 2026-11-15

The user requested installing anti-slop and checking the repository. Vendor the
upstream source at revision `13909c9e07590f5a85d93c62712259fe14a883f7`, retaining its
licenses and provenance. Pin `@oxlint/plugins` to the existing Oxlint 1.86.0 and
preserve the repository boundary rules.

After reviewing the full ruleset, the user chose the rules assessed as a good fit
for this architecture, plus readable spacing. Enable these nine rules as errors:

- `no-chained-type-assertions`
- `no-module-mocking`
- `no-object-parameters`
- `no-reflect-apply`
- `no-reflect-get`
- `no-unknown-type-aliases`
- `no-widen-then-assert`
- `require-safety-comment-for-type-assertion`
- `require-readable-spacing`

Disable the other nine generic rules and native `oxc/no-accumulating-spread`.
These impose additional preferences on array transformations, immutable object
construction, type widening, naming, or parsing/transport boundaries. Preserve
discriminated unions, immutable state updates, and explicit validation at I/O
boundaries. Effect rules remain inactive because this project does not use Effect.

Apply the readable-spacing autofix without changing behavior. Resolve assertion
findings through runtime narrowing, schema parsing, contextual union checking,
and typed browser test hooks. Necessary casts retain specific safety comments;
never bypass the chained-assertion rule by splitting a cast across bindings.
The lint findings do not establish that code was generated by AI.

## Additional Oxlint checks — 2026-11-15

The user requested activating all eleven recommended checks and scanning for
findings. Enable `eslint/eqeqeq`, `eslint/no-var`, `eslint/prefer-const`,
`typescript/consistent-type-imports`, `typescript/no-import-type-side-effects`,
`typescript/ban-ts-comment`, `typescript/switch-exhaustiveness-check`,
`typescript/no-floating-promises`, and `typescript/no-misused-promises`. Enable
`vitest/no-focused-tests` and `vitest/no-identical-title` for `*.test.ts` files.
Vitest-specific rules do not apply to the Playwright `*.spec.ts` suite.

Retain the existing correctness category, which also activates additional
type-aware and Vitest defaults. Pin `oxlint-tsgolint` 7.0.2007 and enable
`options.typeAware` in the root config so local and CI checks agree. Keep the
separate TypeScript compiler check. Ban `@ts-ignore` and `@ts-nocheck`; allow
`@ts-expect-error` only with a description of at least ten characters.

The user then requested fixing every finding, prioritizing union exhaustiveness.
Replace outer switch defaults with explicit grouped cases so every message
variant is enumerated while preserving pending/stale-response guards. Keep
asynchronous effects in adapters; synchronous DOM handlers explicitly launch
operations whose failures are handled. Narrow FormData/FileReader results before
using text, bind browser-stub methods to their receiver, and type mock contracts.
For the delayed-mail regression test, capture its rejection immediately and
assert after the delayed failure, preserving the intended concurrency sequence.
Use explicit sort comparators that retain the prior ordering and specific error
expectations in tests. Keep all recommended rules and correctness defaults active.

## Observo removal — 2026-11-19

The user requested removing Observo before experimenting with a Go backend. Remove
its dashboard, API, scheduler, migrations and configuration, together with the
production Playwright/Chromium runtime. Browser testing remains a development/CI
dependency. Existing deployed `observo.sqlite` files are left untouched; the server
no longer opens them. The remaining apps and shared auth retain their current data.

## Unicorn lint selection — 2026-11-20

The user requested useful Unicorn checks and a reason for every enabled/disabled
rule. Use Oxlint's built-in Unicorn plugin with an explicit versioned selection,
retaining TypeScript, import, boundary, anti-slop and type-aware checks. The
[complete rule review](unicorn-lint-policy.md) covers all registered rules and the
wider upstream collection, distinguishing unavailable checks from deliberate
exclusions. Avoid blanket style rewrites that conflict with pure models, explicit
null contracts or browser/test adapter semantics.

## Shared SSE lifecycle — 2026-11-22

The user requested removing repeated SSE cleanup from the app servers. Use one
server-only shared event-stream helper for transport resources and shutdown.
Apps keep authorization, payloads, room subscriptions and explicit slow-reader
policy; preserve existing event framing and reconciliation intervals. No new
dependency or messaging framework is needed.

## Renovate dependency updates — 2026-11-22

The user requested Renovate configuration in a separate PR. Use the hosted GitHub
app with a Dependency Dashboard and manual merges; do not add a service or runtime
dependency. The initial policy allows routine Sunday-morning PRs in Europe/Berlin,
limited to three open and two new per hour. Security fixes retain Renovate's default
priority behavior. Group Node 24, pnpm, Oxlint/plugins and the Solid stack where
versions must be reviewed together. Keep the current toolchain and Solid major
lines until deliberately changed; allow Solid prerelease updates. The
[setup and policy](dependency-updates.md) documents activation, validation and the
limits of grouping. App installation remains a one-time owner action after merge.

### Release-age protection — 2026-11-22

The user requested a release-age delay to reduce supply-chain risk. Require three
full days for routine Renovate updates, trustworthy available timestamps and strict
internal filtering. Configure pnpm with the matching 4,320-minute delay for newly
resolved direct/transitive packages as well; keep the existing exact-version
exclusion. Vulnerability-fix PRs bypass Renovate's delay, but the pnpm policy still
requires a reviewed exact-version exception for fixes younger than three days.
This is time for detection, not proof that a release is safe.

### Renovate-only automatic merging — 2026-11-22

The user requested automatic merging for Renovate PRs only. This supersedes the
initial all-manual default for stable patch/minor updates. Enable PR-based squash
merging for patch/minor updates from stable versions 1.0.0 and above; keep major,
prerelease/pre-1.0 and vulnerability updates manual. Automatic approval review
rejected blanket automerging including major and vulnerability changes because
`main` has no branch protection or required checks; use this narrower scope.
Use Renovate-driven merging (`platformAutomerge: false`), require passing checks
(`ignoreTests: false`), and rebase branches when behind the base branch. This does
not automate merges of other PRs or change repository settings. Keep the three-day
routine cooldown and version constraints; respect reviews/branch rules added later.

### Continuous PR creation and overnight merges — 2026-11-23

Allow Renovate PR creation all day, every day, superseding the Sunday-only window.
Checks are inexpensive, and continuous eligibility reduces the wait for dependency
fixes. The user requested automatic merges from 01:00 to 05:30 Europe/Berlin to
reduce user disruption because deployments do not have zero downtime. Renovate
supports only whole-hour windows; use `automergeSchedule: ["* 1-4 * * *"]`
(01:00–04:59) to stay within that cutoff. Keep `platformAutomerge: false` so
Renovate enforces the merge window. This does not constrain deployment completion
or manual merges. The hosted app controls actual execution times. Keep the
three-day release-age protection, PR limits and merge eligibility rules; actionable
vulnerability alerts continue to bypass the routine Renovate cooldown and remain
manual.

## Playwright accessibility audit — 2026-11-22

Use axe as a development-only dependency within Playwright, reusing actual browser
flows and the existing isolated local-auth stack. A separate command keeps the
initial findings visible as failing accessibility checks without silently changing
the existing functional CI gate. Do not suppress known elements or rules to make
this audit green. Best-practice findings are reported separately from WCAG-tagged
violations. Automated checks supplement keyboard, screen-reader and other manual
assessment; they do not establish accessibility compliance.

Run against a fresh local stack with `AUTH_MODE=local` and no real mail delivery:
`TEST_AUTH_MODE=local TEST_BASE_URL=<local-origin> pnpm test:a11y`.
Account flows skip unless the caller explicitly declares local auth; public scans
still run. Playwright writes `playwright-report/a11y/` and `test-results/a11y/`.

## Full-contrast text hierarchy — 2026-11-22

The user chose full foreground/background colors for readable text rather than
faded theme colors. Use size, weight and spacing for secondary text; do not use
static text opacity. Override the vendored Drochsign snapshot in the integration
stylesheet, including small text, section headings, citations and placeholders.
Disabled controls retain full-opacity labels with dashed outlines and their
existing disabled behavior/cursor. Remove app-specific text-opacity overrides;
retain motion and visibility transitions. This does not redesign app palettes or
decorative borders, overlays and illustrations.

## Axe in CI — 2026-11-22

The user requested running the accessibility checks in CI. Run `pnpm test:a11y`
after the functional browser suite against the existing production test stack;
set `TEST_AUTH_MODE=local` explicitly so authenticated scans are exercised. Run
axe even if a functional browser test fails, provided stack startup succeeded.
For the current markup backlog, keep this audit non-blocking with an explicit
warning and job summary on failure, and upload the Playwright report and raw
results for 14 days. Do not suppress any rule or finding. Making the audit
blocking remains a follow-up after the known findings are fixed.

## Blocking axe checks and semantic fixes — 2026-11-22

The user requested a blocking accessibility audit and resolution of its remaining
confirmed findings. This supersedes the non-blocking CI policy above. Remove
`continue-on-error`; an axe failure fails the Check workflow, while report upload,
summary and stack cleanup still run after failures.

Use a neutral container for the shared menu title so it does not create another
page banner. Kunludo's standalone account content is a main landmark; the planner
keeps a visible view-specific h1 inside its existing main on every viewport.
Preserve the account layout when changing its semantic element. Vortoj's score
button uses its visible text as its accessible name and describes its game-details
action separately. Tile names include the visible letter/points with matching
spacing; the submit button's accessible name includes its visible singular label.
These fixes preserve auth, gameplay, focus handling and the two-color styling.
