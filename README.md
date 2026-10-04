# droch-apps

A greenfield monorepo for hobby apps: independent Solid frontends, one modular
TypeScript backend, and one Docker Compose deployment in Coolify.

The first apps are account-free scrum poker and an account-based, Scrabble-like
word game. The word game supports playing together or taking turns days apart,
without a turn deadline.

## Project documentation

- [Architecture](docs/architecture.md): stack, boundaries, deployment, and development.
- [Decisions](docs/decisions.md): agreed choices and their rationale.
- [Implementation plan](docs/implementation-plan.md): milestones and verification.
- [Agent instructions](AGENTS.md): rules for contributors and AI agents.

## Status

The foundation and scrum poker are implemented. Create a room, share its invite link,
and vote anonymously. Votes stay private until someone reveals them. Anyone
in the room can reveal votes or start the next round. Rooms and guest identities survive backend restarts, and live
updates reconnect automatically. Rooms expire after 30 days without activity.

Persistence uses `auth.sqlite`, `poker.sqlite`, and `words.sqlite`, each with its own
Drizzle migration history. The word frontend remains a shell. Email-code accounts
and the word game are the next milestones.

## Local development

Install [mise](https://mise.jdx.dev/). The local macOS setup uses Colima for Docker.
Start Colima if it is stopped, then run:

```sh
colima start
mise install
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm dev
```

`pnpm dev` builds the application image, initializes/migrates the SQLite files, and starts the backend with
frontend hot reload, waits for readiness, and prints the URL. Visit `/poker/` or
`/words/`. All apps use one backend and port. Generated configuration
stay in ignored `.local/dev/`; nothing needs copying from `.env.example` locally.
With mise shell activation, the `mise exec --` prefix is unnecessary.

Run the same commands in another Git worktree for an independent stack. Checkout
paths determine Compose projects, volumes, networks, and future session-cookie
names; host ports are allocated at startup. Container dependency volumes are
separate from host dependencies and from other checkouts. `pnpm dev:stop` stops only
the current checkout and preserves its database files. `pnpm dev:logs` follows its logs.

| Command            | Purpose                                                                            |
| ------------------ | ---------------------------------------------------------------------------------- |
| `pnpm check`       | Type check, lint including import boundaries, format check, unit/integration tests |
| `pnpm format`      | Format repository sources and docs                                                 |
| `pnpm build`       | Build both frontends and bundle the backend and migration runner                   |
| `pnpm test:e2e`    | Browser checks, including two-player poker, against the current URL                |
| `pnpm db:generate` | Generate SQL migrations for all databases; optionally pass an app ID               |
| `pnpm db:migrate`  | Apply each database’s migrations under `DATA_DIRECTORY`                            |

For browser tests, first run `pnpm exec playwright install chromium`, or use
`PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e` with installed Chrome. Set `TEST_BASE_URL`
to test another running deployment. The GitHub workflow runs checks, builds the
production image, and tests the local Compose stack; its first hosted run is pending.

Oxlint's custom boundary rule currently triggers an [upstream Linux allocator
bug](https://github.com/oxc-project/oxc/issues/20331) on small Docker VMs. Run
`pnpm check` on the host or a suitably provisioned CI runner; image builds run type
checking and compilation separately. The rule is enforced by host/CI checks.

## Production deployment

`compose.yaml` builds one application image and runs a one-shot migration service
before starting the backend. Both use one persistent `sqlite-data` volume mounted
at `/data`; each module owns a separate file inside it. No database server or database
password is needed. Set `APP_ORIGIN` and optional `SESSION_COOKIE_NAME` in Coolify.
Assign the domain to the `application` service on port 3000. New app paths and
files require repository changes and a redeploy, with no DNS or volume configuration.
Only one backend instance is intended. SQLite files live on the server's local volume,
never on a network filesystem or the repository bind mount.

`pnpm db:generate words` generates only the word-game migration history. Without
an argument, it processes auth and every registered app. To migrate outside Docker,
use `DATA_DIRECTORY=.local/data pnpm db:migrate`. Production includes the compiled
SQLite native driver; development images include the tools needed to build it.

For a consistent backup across files, stop the stack before backing up the volume,
and restore the files together. Do not copy only live `.sqlite` files and omit their
WAL data. Automated backup destination and restore verification remain pending.
The former local PostgreSQL container is removed; its volume is preserved. No
application data existed in the scaffold, so no data conversion is needed.

A local production check is `docker compose --env-file <production-env> up --build -d`.
Coolify configuration, email delivery, backups, and restore verification remain to
be completed before using real accounts or production data.

## Priorities

Type safety, fast feedback, simplicity, and visible side effects, inspired by Elm.
Use TypeScript throughout application code, ordinary functions, and small modules.
TypeScript does not enforce purity; architecture and checks must make effects clear.
