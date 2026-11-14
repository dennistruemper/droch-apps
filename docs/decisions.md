# Decisions

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
- [Observo](../apps/observo/AGENTS.md)
- [Enigmo](../apps/enigmo/AGENTS.md)

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
