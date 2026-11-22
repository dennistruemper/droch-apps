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

## Update policy

- PR creation is allowed all day, every day. The hosted service chooses when it
  runs; this is not a guaranteed execution time.
- Routine updates must be at least **three days (72 hours)** old. Renovate uses
  `minimumReleaseAge: "3 days"`, requires a release timestamp, and uses strict
  internal filtering so updates wait before a PR is raised. Missing timestamps
  hold an update for review rather than silently bypassing the delay.
- pnpm separately uses `minimumReleaseAge: 4320` (minutes) for newly resolved
  direct and transitive packages, including manual dependency updates. pnpm also
  verifies the lockfile against its supply-chain policy during installation. The
  existing exact-version exclusion for `@types/node@24.19.1` remains; do not add broad package exclusions.
  The delay gives malicious releases time to be detected; it cannot guarantee
  safety, and timestamp reliability depends on the registry/datasource.
- At most three routine PRs are open, with at most two created per hour. The
  Dependency Dashboard shows pending updates.
- Renovate automatically squash-merges patch/minor updates from stable versions
  (1.0.0 and above), after passing status checks and check runs and once the branch
  is up to date with `main`. Both old and new values must be plain
  stable versions. Major upgrades, prerelease/pre-1.0 updates, Docker tag changes
  with variant suffixes, and vulnerability-fix PRs remain manual.
  Pending, failing or missing checks prevent merging (`ignoreTests: false`).
  `platformAutomerge: false` makes Renovate wait for checks itself; it does not
  enable GitHub's repository-wide auto-merge setting or affect other PRs.
  Automatic merges are allowed daily from 01:00 through 04:59 in `Europe/Berlin`
  (`automergeSchedule: ["* 1-4 * * *"]`). The requested cutoff is 05:30, but Renovate
  supports only whole hours, so the window ends at 05:00 to stay within it.
  Overnight merges reduce user disruption from deployments without zero downtime.
  This controls merge times, not deployment completion; a queued or slow deployment
  can finish later. Manual merges are unrestricted by this setting. Required
  reviews and branch rules still apply.
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
  and PR limits when GitHub supplies an actionable alert. An explicit
  `vulnerabilityAlerts.minimumReleaseAge: null` also bypasses Renovate's cooldown.
  pnpm's repository-level cooldown still applies during lockfile generation;
  a fix released within 72 hours can require a reviewed, exact-version pnpm
  exclusion. Security PRs still need review.

Every update PR runs the existing Check workflow: type checking,
linting, formatting, unit/integration tests, the production image build and browser
flows. Native SQLite, Solid prereleases and Oxlint plugin compatibility need those
checks. Vendored Drochsign and anti-slop snapshots remain explicit reviewed updates.
Documentation that mentions exact tool or lint versions must be updated when those
versions change; Renovate does not rewrite prose.

## Validate configuration changes

From a checkout with its pinned mise tools installed:

```sh
mise exec -- pnpm --allow-build=re2 --package=renovate@44.253.4 dlx renovate-config-validator --strict --no-global renovate.json
```

The validator resolves inherited presets and checks the repository configuration.
For dependency discovery without branches or remote writes, first ensure the
configuration is tracked by Git, then run:

```sh
LOG_LEVEL=debug mise exec -- pnpm --allow-build=re2 --package=renovate@44.253.4 dlx renovate --platform=local --dry-run=extract
```

Extraction verifies recognized files and pins; it does not prove registry lookup,
lockfile regeneration or hosted-app permissions. Check the first hosted update PR
and its CI before considering activation verified. The pinned CLI is a validation
tool only; the hosted app manages its own version.
