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

## Vortoj product rules

- The word app is Vortoj, at `/vortoj/`, with two to four authenticated room members.
- Keep racks private in HTTP and event-stream payloads; filtering is server-side.
- No external dictionary: opponents approve every newly formed word. At least half
  the opponents, rounded up, must approve. Turns and votes have no deadline.
- Include English/German presets and per-user named reusable custom tile sets.
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
- Keep secrets, unrevealed poker votes, and opponents' tile racks out of client payloads.
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
- Follow the Vortoj examples: `apps/vortoj/src/client/account-model.ts`,
  `tiles-model.ts`, `room-model.ts`, `lobby-model.ts`, their command adapters and transition tests.
  Test meaningful invariants and recovery races, plus affected browser flows;
  avoid tests that merely restate every switch case.
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
- Do not claim commands or checks exist or passed unless verified.

## Documentation maintenance

Update the relevant documents when an agreed decision changes. Keep rationale in
`docs/decisions.md`, current architecture in `docs/architecture.md`, and remaining work
in `docs/implementation-plan.md`. A proposed default is not a settled user decision.
