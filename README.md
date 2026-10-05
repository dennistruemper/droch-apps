# droch-apps

A greenfield monorepo for hobby apps: independent Solid frontends, one modular
TypeScript backend, and one Docker Compose deployment in Coolify.

The first apps are account-free scrum poker and Vortoj, an account-based word board
game. Vortoj supports playing together or taking turns days apart,
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

Persistence uses `auth.sqlite`, `poker.sqlite`, and `vortoj.sqlite`, each with its own
Drizzle migration history. Vortoj supports two to four signed-in players, room invitations,
private seven-tile racks, a 15×15 board, bonuses, jokers, passing, exchanges, and final scores.
Every word formed by a move needs approval from at least half the opponents (rounded up).
There is no dictionary lookup or turn deadline. Rejected moves return the tiles and end
that turn. English and German tile sets are included; each user can save named custom
sets for future games. Games keep the set selected at room creation.

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
`/vortoj/`. All apps use one backend and port. Generated configuration
stays in ignored `.local/dev/`; nothing needs copying from `.env.example` locally.
With mise shell activation, the `mise exec --` prefix is unnecessary.

Run the same commands in another Git worktree for an independent stack. Checkout
paths determine Compose projects, volumes, networks, and session-cookie
names; host ports are allocated at startup. Container dependency volumes are
separate from host dependencies and from other checkouts. `pnpm dev:stop` stops only
the current checkout and preserves its database files. `pnpm dev:logs` follows its logs.

| Command            | Purpose                                                                            |
| ------------------ | ---------------------------------------------------------------------------------- |
| `pnpm check`       | Type check, lint including import boundaries, format check, unit/integration tests |
| `pnpm format`      | Format repository sources and docs                                                 |
| `pnpm build`       | Build both frontends and bundle the backend and migration runner                   |
| `pnpm test:e2e`    | Browser checks, including two-player poker and Vortoj, against the current URL     |
| `pnpm db:generate` | Generate SQL migrations for all databases; optionally pass an app ID               |
| `pnpm db:migrate`  | Apply each database’s migrations under `DATA_DIRECTORY`                            |

For browser tests, first run `pnpm exec playwright install chromium`, or use
`PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e` with installed Chrome. Set `TEST_BASE_URL`
to test another running deployment. The GitHub workflow runs checks, builds the
production image, and runs browser checks against that image using the production
Compose migration gate and a disposable test database. The existing worktree identity
tests remain part of `pnpm check`. `jdx/mise-action` installs and
caches the Node and pnpm versions declared in `mise.toml`.
Each PR update runs the workflow once. Push checks run only on `main`, including
merges; a newer run cancels an unfinished run for the same PR or branch.

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

| Coolify setting               | Value                                                  |
| ----------------------------- | ------------------------------------------------------ |
| Branch                        | `main`                                                 |
| Base Directory                | `/`                                                    |
| Docker Compose Location       | `/compose.yaml`                                        |
| Domains for `application`     | `https://apps.example.com:3000` (replace the hostname) |
| Runtime `APP_ORIGIN`          | Optional in Coolify; required for manual deployments   |
| Runtime `SESSION_COOKIE_NAME` | Optional; defaults to `droch_session`                  |

Coolify supplies the runtime `SERVICE_URL_APPLICATION` from the domain configured
for `application`; the backend reads it directly. Outside Coolify, set `APP_ORIGIN`
to the public origin before starting Compose. If an old Coolify configuration still
contains `Set APP_ORIGIN`, that value can be removed: reloading Compose preserves
previously saved variables.

Keep Raw Compose Deployment disabled so Coolify configures its proxy. The domain's
`:3000` suffix selects the internal container port; visitors use normal HTTPS.
Point the hostname's DNS at the Coolify server. Only `application` needs a domain.
Use HTTPS because production guest cookies are Secure. Origin checks use the exact
configured origin, so it must match the public browser origin. In Coolify, the backend
uses the generated runtime `SERVICE_URL_APPLICATION` as its canonical origin;
`APP_ORIGIN` is the fallback for local and manual deployments. The selected value
must be a single HTTP(S) origin without a path, trailing slash, or credentials.

The production definition exposes port 3000 inside Docker without publishing a
server port. The generated development override adds its own loopback port binding.
The named SQLite volume is already declared in Compose; no manual per-app storage
entry is needed. Save the settings and deploy. Check that `migrate` exits with code
0, `application` becomes healthy, and `/health/ready`, `/poker/`, and `/vortoj/` load
over HTTPS. A stopped migration container is expected after successful completion.
Test a room with two browsers to verify streaming through the actual proxy.
These settings follow [Coolify's Docker Compose documentation](https://coolify.io/docs/applications/builds/docker-compose).

New app paths and files require repository changes and a redeploy, with no DNS or
volume configuration.
Only one backend instance is intended. SQLite files live on the server's local volume,
never on a network filesystem or the repository bind mount.

`pnpm db:generate vortoj` generates only the word-game migration history. Without
an argument, it processes auth and every registered app. To migrate outside Docker,
use `DATA_DIRECTORY=.local/data pnpm db:migrate`. Production includes the compiled
SQLite native driver; development images include the tools needed to build it.

For a consistent backup across files, stop the stack before backing up the volume,
and restore the files together. Do not copy only live `.sqlite` files and omit their
WAL data. Automated backup destination and restore verification remain pending.
The former local PostgreSQL container is removed; its volume is preserved. No
application data existed in the scaffold, so no data conversion is needed.

For a local check of the production image:

```sh
pnpm test:image
pnpm test:stack
# Load the allocated test URL:
set -a
. .local/test/browser.env
set +a
pnpm test:e2e
pnpm test:stack:stop
```

Use the installed Playwright Chromium or add `PLAYWRIGHT_CHANNEL=chrome` for local
Chrome. Test images, Compose projects, cookies and ports are scoped to the checkout,
separately from development. `test:stack` starts the already-built image without a
source mount or dependency installation; successful migrations gate startup.
`test:stack:logs` prints migration and application logs. `test:stack:stop` removes
only this checkout's disposable test stack and its SQLite volume. Development data
is preserved. Run `pnpm dev` when changing development tooling to verify startup
and hot reload as well.

Mailtrap delivery needs your credentials and a verified sender. Automated backups and
operational restore verification remain pending.

## Accounts and mail

Local development and the disposable browser-test stack use the second mail implementation:
`AUTH_MODE=local` performs no I/O and sends no email, even if a token is present. Request a sign-in code, then enter **9999**. The UI
explains this test mode. Codes still expire after ten minutes and can be used once.

Set these **runtime** environment variables in Coolify:

| Variable              | Production                            | Preview / test deployment                      |
| --------------------- | ------------------------------------- | ---------------------------------------------- |
| `AUTH_MODE`           | `production` (default)                | `test`                                         |
| `AUTH_SECRET`         | Random secret, at least 32 characters | Separate random secret, at least 32 characters |
| `MAILTRAP_TOKEN`      | Your sending API token                | Your sending API token, or a Sandbox token     |
| `MAIL_FROM`           | Verified sender email address         | Verified sender, or the Sandbox sender         |
| `MAILTRAP_SANDBOX_ID` | Leave unset                           | Optional numeric inbox ID when using Sandbox   |

Generate a secret with `openssl rand -hex 32`. Keep secrets in Coolify, never in Git.
Production sends random six-digit codes through Mailtrap. With `AUTH_MODE=test`, the
code is always **9999**; with a token it is still sent through Mailtrap. Without a token,
test mode sends nothing. On localhost, a missing token automatically selects test mode.
On a public origin, production mode requires mail credentials; otherwise account sign-in
is unavailable while poker keeps working. A token also requires `MAIL_FROM`.

If delivery fails, the application container logs `Mailtrap delivery failed` with
`transport` (`sending` or `sandbox`) and the HTTP `status`, or a `timeout`/`connection`
reason. Provider response bodies, tokens, recipient addresses, and codes are not logged.
A sending token needs Domain Admin permissions for the verified domain used in
`MAIL_FROM`; read-only access cannot send email. Get the domain's sending token from
Sending Domains > Integration > Transactional Stream > Integrate > API, or edit
its permissions under Settings > API Tokens. A Sandbox token needs the matching
`MAILTRAP_SANDBOX_ID`. Sandbox messages appear in Mailtrap,
not in the recipient's real inbox.

Test mode does not verify ownership of email addresses. Use separate preview data;
keep `AUTH_MODE=production` for the real application. `NODE_ENV` stays `production` in
both deployment stages and does not select the code behavior.

First verification creates an account. Display names are visible in rooms; email addresses
stay private. Sessions last 30 days and can be revoked by signing out. Account deletion,
email changes, and account recovery beyond requesting another code are not implemented.

The former `/words/` frontend redirects to `/vortoj/`. The previous `words.sqlite` file
was an empty scaffold: it is left on existing volumes, while migrations create
`vortoj.sqlite`. There is no gameplay data to convert.

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
AUTH_MODE=test
```

Enable **Runtime Variable**. The backend reads Coolify's generated
`SERVICE_URL_APPLICATION` directly at startup, rather than asking Coolify to expand
an `APP_ORIGIN` alias. That alias can retain the production URL in a preview.
PR 1 therefore gets `https://1.apps.droch.dev` and PR 2 gets
`https://2.apps.droch.dev` automatically. No preview-specific `APP_ORIGIN` override
is needed. Remove any old
`APP_ORIGIN=$SERVICE_URL_APPLICATION` preview override. Keep the application
service's internal port at 3000, save, and redeploy after configuration changes.

If requests report `Invalid request origin`, inspect `SERVICE_URL_APPLICATION` in
the application container: it must match the browser's origin exactly. The backend
validates that single URL and does not use the comma-separated `COOLIFY_URL` list,
request headers, or wildcard domains to determine which origin to trust.

These values belong to the preview variable group, which is separate from
production. The existing production `APP_ORIGIN` remains its public origin.
See [Coolify's preview deployment documentation](https://coolify.io/docs/applications/deployments/preview-deployments).

## Priorities

Type safety, fast feedback, simplicity, and visible side effects, inspired by Elm.
Use TypeScript throughout application code, ordinary functions, and small modules.
TypeScript does not enforce purity; architecture and checks must make effects clear.
