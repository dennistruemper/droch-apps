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
production image, and tests the local Compose stack. `jdx/mise-action` installs and
caches the Node and pnpm versions declared in `mise.toml`.

Oxlint's custom boundary rule currently triggers an [upstream Linux allocator
bug](https://github.com/oxc-project/oxc/issues/20331) on small Docker VMs. Run
`pnpm check` on the host or a suitably provisioned CI runner; image builds run type
checking and compilation separately. The rule is enforced by host/CI checks.

## Production deployment

`compose.yaml` builds one application image and runs a one-shot migration service
before starting the backend. Both use one persistent `sqlite-data` volume mounted
at `/data`; each module owns a separate file inside it. No database server or database
password is needed. Use the Git repository's **Docker Compose** build pack in Coolify;
the Dockerfile is built by Compose rather than selected as a separate deployment.

| Coolify setting               | Value                                                         |
| ----------------------------- | ------------------------------------------------------------- |
| Branch                        | `main`                                                        |
| Base Directory                | `/`                                                           |
| Docker Compose Location       | `/compose.yaml`                                               |
| Domains for `application`     | `https://apps.example.com:3000` (replace the hostname)        |
| Runtime `APP_ORIGIN`          | `https://apps.example.com` (no port suffix or trailing slash) |
| Runtime `SESSION_COOKIE_NAME` | Optional; defaults to `droch_session`                         |

Open the application's **Configuration > Environment Variables** to set `APP_ORIGIN`;
ensure Runtime Variable is enabled. Save and redeploy to apply it. If an existing
Coolify configuration contains the literal value `Set APP_ORIGIN`, replace it with
the public origin: reloading Compose preserves previously saved variable values.

Keep Raw Compose Deployment disabled so Coolify configures its proxy. The domain's
`:3000` suffix selects the internal container port; visitors use normal HTTPS.
Point the hostname's DNS at the Coolify server. Only `application` needs a domain.
Use HTTPS because production guest cookies are Secure. Origin checks use the exact
`APP_ORIGIN` value, so it must match the public browser origin.

The production definition exposes port 3000 inside Docker without publishing a
server port. The generated development override adds its own loopback port binding.
The named SQLite volume is already declared in Compose; no manual per-app storage
entry is needed. Save the settings and deploy. Check that `migrate` exits with code
0, `application` becomes healthy, and `/health/ready`, `/poker/`, and `/words/` load
over HTTPS. A stopped migration container is expected after successful completion.
Test a room with two browsers to verify streaming through the actual proxy.
These settings follow [Coolify's Docker Compose documentation](https://coolify.io/docs/applications/builds/docker-compose).

New app paths and files require repository changes and a redeploy, with no DNS or
volume configuration.
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

A local production check needs an override that publishes the application port,
for example `ports: ["127.0.0.1:3000:3000"]` under `services.application`.
Run `docker compose --project-name droch-production-check --env-file <production-env> -f compose.yaml -f <local-override> up --build -d`.
Use a separate Compose project and volume for that check; do not reuse development data.
Email delivery, backups, and restore verification remain to be completed before
using real accounts or production data.

## Preview deployments

Enable previews in Coolify for the GitHub repository. The default URL template,
`{{pr_id}}.{{domain}}`, creates `1.apps.droch.dev`, `2.apps.droch.dev`, and so on
when the production hostname is `apps.droch.dev`.

Create wildcard DNS once so future previews need no new records. For the
`droch.dev` zone in Cloudflare, use:

| Type | Name     | Content                      | Proxy status |
| ---- | -------- | ---------------------------- | ------------ |
| A    | `*.apps` | Coolify server's public IPv4 | DNS only     |

Set any explicit preview records, such as `1.apps`, to DNS only as well; explicit
records take precedence over the wildcard. Coolify handles HTTPS certificates for
each preview. Cloudflare's standard Universal SSL for a full DNS setup covers the
zone root and first-level subdomains, but not deeper names such as
`1.apps.droch.dev`. Keeping preview records DNS only avoids that certificate
coverage issue. See [Cloudflare's SSL limitations](https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/limitations/).

Open the application's **Preview Deployment Environment Variables** and set:

```dotenv
APP_ORIGIN=$SERVICE_URL_APPLICATION
```

Enable **Runtime Variable** and disable **Literal** so the reference expands.
Coolify generates `SERVICE_URL_APPLICATION` from the application service's preview
domain, without the internal port. PR 1 therefore gets `https://1.apps.droch.dev`
and PR 2 gets `https://2.apps.droch.dev` automatically. Do not hardcode a PR number
in the shared preview variables. Keep the application service's internal port at
3000, save, and redeploy the preview after configuration changes.

These values belong to the preview variable group, which is separate from
production. The existing production `APP_ORIGIN` remains its public origin.
See [Coolify's preview deployment documentation](https://coolify.io/docs/applications/deployments/preview-deployments).

## Priorities

Type safety, fast feedback, simplicity, and visible side effects, inspired by Elm.
Use TypeScript throughout application code, ordinary functions, and small modules.
TypeScript does not enforce purity; architecture and checks must make effects clear.
