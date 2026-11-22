# Dependency updates

[Renovate](https://docs.renovatebot.com/) proposes dependency updates using
[`renovate.json`](../renovate.json). The hosted GitHub app runs the bot; there is
no service to deploy and no Renovate dependency in the application.

## One-time GitHub setup

1. Merge the configuration PR into `main`, the remote default branch.
2. Install or configure the [Renovate GitHub app](https://github.com/apps/renovate)
   for the repository owner. Select **Only select repositories** and grant access
   to `droch-apps`. If it is already installed, add this repository to its access.
3. Check the Dependency Dashboard issue and the app's initial run. Existing
   configuration on the default branch lets Renovate skip its onboarding PR.
   GitHub Issues must be enabled for the dashboard.
4. Keep GitHub's dependency graph and Dependabot alerts enabled, and grant
   Renovate access to vulnerability alerts when requested. These alerts feed
   Renovate's vulnerability-fix PRs. Do not enable a second bot's version-update
   PRs for the same dependencies.

Merging this configuration alone does not install the app. No repository secret,
GitHub Actions schedule, or Coolify change is required for the hosted service.

## Initial update policy

- Routine PR creation is allowed on Sundays from 00:00 through 11:59 in
  `Europe/Berlin`. The hosted service chooses when it runs within that window;
  this is not a guaranteed execution time. Existing PRs can still be refreshed.
- At most three routine PRs are open, with at most two created per hour. The
  Dependency Dashboard shows pending updates. Nothing merges automatically.
- Renovate's recommended presets supply standard monorepo grouping and supported
  dependency handling. Native managers cover workspace npm dependencies and the
  pnpm lockfile, mise tools, Docker images and GitHub Actions. A custom regex
  manager covers `RUN npm install --global pnpm@...` in `Dockerfile`.
- Node pins and `@types/node` are grouped and restricted to Node 24. The existing
  `engines.node` range remains a compatibility constraint. pnpm pins in mise,
  `packageManager` and Docker are grouped and restricted to pnpm 11 initially.
  Changing these toolchain majors requires an explicit policy edit.
- `oxlint` and `@oxlint/plugins` share one update PR. Review that their exact
  versions still match, and update the versioned Unicorn rule catalog if needed.
  Grouping combines available updates; it does not enforce version equality.
- Solid runtime, web renderer, router and Vite plugin share an update PR. Their
  accepted prereleases remain eligible even when npm's `latest` tag points to
  another release line. Runtime/web/router stay on major 2; the compiler plugin
  stays on major 3. These packages have different version numbers; CI must verify
  compatibility. Major changes require a policy edit.
- Other major updates remain visible as manually reviewed PRs. Vulnerability-fix
  PRs use Renovate's default priority behavior, bypassing the routine schedule
  and PR limits when GitHub supplies an actionable alert; they still need review.

Before merging an update, require the existing Check workflow: type checking,
linting, formatting, unit/integration tests, the production image build and browser
flows. Native SQLite, Solid prereleases and Oxlint plugin compatibility need those
checks. Vendored Drochsign and anti-slop snapshots remain explicit reviewed updates.
Documentation that mentions exact tool or lint versions must be updated when those
versions change; Renovate does not rewrite prose.

## Validate configuration changes

From a checkout with its pinned mise tools installed:

```sh
mise exec -- pnpm --allow-build=re2 --package=renovate@44.257.9 dlx renovate-config-validator --strict --no-global renovate.json
```

The validator resolves inherited presets and checks the repository configuration.
For dependency discovery without branches or remote writes, first ensure the
configuration is tracked by Git, then run:

```sh
LOG_LEVEL=debug mise exec -- pnpm --allow-build=re2 --package=renovate@44.257.9 dlx renovate --platform=local --dry-run=extract
```

Extraction verifies recognized files and pins; it does not prove registry lookup,
lockfile regeneration or hosted-app permissions. Check the first hosted update PR
and its CI before considering activation verified. The pinned CLI is a validation
tool only; the hosted app manages its own version.
