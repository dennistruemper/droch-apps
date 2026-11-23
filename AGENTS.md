# Contributor and agent instructions

Read [architecture](docs/architecture.md) and [decisions](docs/decisions.md) before
changing architecture or tooling. Use [implementation-plan](docs/implementation-plan.md)
to understand the intended order of work.

## Agreed constraints

- TypeScript for frontend, backend, contracts, and game rules.
- Solid 2, without SolidStart. Its release candidate is an accepted choice.
- Node 24 LTS, pnpm, and mise for tool versions. Do not switch to Bun.
- One workspace package per app; use folders for internal modularity.
- One shared backend and path-based app URLs on one origin.
- Adding an app must not require DNS or Coolify configuration changes.
- Docker Compose runs the application and migrations with a persistent SQLite volume.
- Drizzle with one SQLite file per app and one for shared auth. Each owner has its
  own tables and migration history. Auth is an in-process module, not a microservice.
- Optimize for a small hobby project and one backend instance; do not add infrastructure
  for hypothetical large scale.
- Custom email-code authentication through Mailtrap. Do not introduce Better Auth,
  password authentication, or password-hash storage.
- No Effect library. Make effects explicit through ordinary functions and dependencies.
- Use Drochsign as the CSS starting point, with independent app themes.
- Development must support multiple independent Git worktrees concurrently.

## Product copy

These rules apply to every app and to new screens as well as edits. Treat them as
acceptance criteria, not optional polish.

- Use one heading per page purpose. Do not add an eyebrow, slogan or subtitle that
  repeats the heading (for example, "Gemeinsam spielen" above "Deine Teams").
- Show account identity once in the account control. Do not repeat the signed-in
  name, "ein Konto", or account benefits in page summaries or forms.
- Omit narration of routine actions and obvious defaults, such as "Du erstellst
  das Team als … und wirst Admin." Keep explanations when they affect a decision,
  clarify a non-obvious consequence, or help recover from an error.
- Before finishing a UI change, review its visible copy. Remove each sentence
  that merely restates a heading, label, selected value, account identity or
  routine action. Prefer removing text to replacing it with another slogan.

- Keep user-facing text brief and focused on useful status and actions.
- Do not expose implementation or operational details in app copy unless they help
  the user make a meaningful decision. Keep app-specific copy constraints in the
  app's instructions.
- Keep such details in developer documentation. Prefer clear interface labels to
  explanatory paragraphs and omit redundant footers or instructions.

## Concept previews

- Prefer fast, lightweight previews when the user is choosing between concepts.
  Show the essential visual differences with representative sample data.
- Do only a quick sanity check that each option renders and its main interaction
  works. Defer extensive polish, responsive variants, exhaustive testing and
  edge-case optimization until the user selects a solution.
- Apply normal implementation and verification standards to the chosen solution.

## App-specific instructions

Read only the app instructions relevant to the task, including when changing its
migrations, external tests, or shared integrations:

- [Poker](apps/poker/AGENTS.md)
- [Vortoj](apps/vortoj/AGENTS.md)
- [Schlezaz](apps/schlezaz/AGENTS.md)
- [Enigmo](apps/enigmo/AGENTS.md)
- [Kunludo](apps/kunludo/AGENTS.md)

App product rules, implementation details, decisions and verification history live
in each app directory. Do not load every app's docs for unrelated work. For new apps,
add an app-local `AGENTS.md` and link it here; keep shared policy in the root docs.

## Shared authentication modes

- Local tests use the no-op mail implementation and code `9999`, even with a token.
  Coolify previews use `AUTH_MODE=test` (`9999` plus Mailtrap delivery); production
  uses random codes. Keep preview data separate from real accounts.

## Boundaries and implementation

- Public APIs are explicit exports. An `index.ts` is an API convention, not enforcement.
- Enforce boundaries with package exports and Oxlint, including relative-path bypasses.
- Forbid frontend imports of server code, including inside the same app package.
- Approved public subpaths such as an app's `server` or `contracts` are allowed;
  arbitrary internal subpaths are not.
- Apps use the public auth API and stable user IDs; do not query the auth file
  directly or attach another module's database. Authorization remains app-specific.
- Keep domain logic pure. Inject database, mail, time, randomness, and other effects
  where needed. Do not perform side effects during module import.
- Validate external data at runtime. Do not treat TypeScript types as validation.
- Keep secrets and app-private state out of client payloads; filter on the server.
- Do not add packages or abstraction layers solely to match a theoretical architecture.
- Do not modify the separate Drochsign repository as part of this project unless asked.

## Client state style

- Start new client features with coupled state or asynchronous workflows using a
  feature-local typed `Model`, a discriminated `Message` union, and a pure
  `update(model, message)` returning the next model and explicit commands.
- Use discriminated states for screens, modes and request phases. Prefer states
  that exclude impossible combinations over separate booleans and unrelated setters.
- Keep HTTP, storage, time, randomness, confirmation and DOM operations outside
  pure updates. Execute commands in an adapter and dispatch typed result messages;
  validate external responses there before passing them to the model.
- Keep transition ordering synchronous even though Solid 2 renders writes later.
  Read the current model when dispatching, not a signal still awaiting a flush.
  Guard duplicate requests, stale completions and disposal; use request IDs and
  server versions where relevant. Abort requests on component cleanup.
- Own each model within its feature. Do not introduce a global store, shared
  reducer framework or state-management dependency just to implement this style.
- Simple independent controls, such as a checkbox or open/closed panel, can use
  local signals. Browser layout measurements, scrolling and focus stay in the
  view adapter. Use stable keys for editable rows so updates preserve focus.
- Test meaningful invariants and recovery races, plus affected browser flows;
  avoid tests that merely restate every switch case. For implementation examples,
  see [Vortoj's client references](apps/vortoj/AGENTS.md#client-reference-implementations)
  when needed.
- Read the installed Solid 2 `CHEATSHEET.md` when changing reactive or lifecycle
  code; do not assume Solid 1 APIs or synchronous signal writes.

## Worktrees and checks

- The owner's macOS Docker engine is Colima. Use the existing Docker context;
  do not assume Docker Desktop or change Colima settings without a task requiring it.
- Derive development resource identity from the current checkout, not a fixed path.
- Isolate database volumes, networks, ports, cookies, outputs, and local configuration.
- Never share a mutable database or dependency links between worktrees.
- Cleanup must target only the current worktree. Preserve its database on ordinary shutdown.
- Use the project's pinned tools and documented scripts once they exist.
- Run meaningful checks for the change; prioritize domain, concurrency, auth, boundary,
  and multiplayer behavior. Do not add tests that merely duplicate implementation.
- Playwright retries are explicitly disabled (`retries: 0`) for functional and
  accessibility tests, with `failOnFlakyTests: true`. Keep both suites inheriting
  this policy; do not add retry overrides in projects, CLI commands or CI to hide
  intermittent failures. Reproduce and fix the underlying test or product race.
- Do not claim commands or checks exist or passed unless verified.

## Changed-line coverage gate

- Every PR must cover at least **90% of added or modified executable lines** compared
  with its target branch's merge base. The gate runs as a separate job enforced by
  the required `foundation` CI check. It does not enforce a repository-wide
  percentage or a historical no-drop rule.
- A line counts as covered when either the Vitest or Playwright LCOV report records
  execution. Keep using `e2e/fixtures.ts` for functional browser tests so their execution
  is collected. Branch, function and statement reports remain separate diagnostics.
- Before pushing, run `pnpm check`, generate fresh browser coverage with the instrumented
  test stack, then `pnpm test:coverage:gate origin/main` (or the PR's actual target ref).
  Fetch that ref first. The gate requires Python 3.11+ with venv/pip and installs pinned,
  hash-verified development tools under this checkout's ignored `.local/coverage-gate/`.
  Full commands and report locations are in [README coverage](README.md#changed-line-gate).
- When the gate fails, add meaningful tests for the missing behavior, including affected
  failure paths and races. Inspect `coverage/patch/summary.txt` for file/line gaps.
  Do not lower the threshold, add coverage ignores, remove sources from reports, or
  insert execution-only tests to make it pass. Any policy exception needs explicit
  owner agreement and a documented reason.
- Generate both reports from the same checkout revision; do not reuse stale reports,
  another worktree's outputs, or the changed-file-only Vitest report. Do not average
  percentages. Lines outside the diff do not count toward the gate; tests and type
  declarations retain their existing exclusions. Coverage does not replace assertions,
  branch/recovery tests, or review of behavior.

## Commit messages and pull requests

- Use Conventional Commits for PR titles: `<type>(optional scope): <description>`.
  For example, `docs: document PR and bug-fix writing conventions`.
- For `fix:` commit messages, PR titles and bug-fix comments, describe the bug:
  the triggering condition and incorrect behavior. Keep implementation details
  in the body when needed. For example, use `fix: room stays loading after a
failed reconnect`, rather than `fix: reset the loading flag`.

## Documentation maintenance

Update the relevant documents when an agreed decision changes. Keep shared rationale,
architecture and remaining work in `docs/decisions.md`, `docs/architecture.md` and
`docs/implementation-plan.md`. Keep app-specific equivalents in `apps/<app>/docs/`
and instructions in its `AGENTS.md`; shared files should link to these details.
A proposed default is not a settled user decision.
