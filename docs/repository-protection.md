# Repository protection

The active [Protect main ruleset](https://github.com/dennistruemper/droch-apps/rules/27851275)
protects `refs/heads/main`. Its creation payload is recorded in
[`.github/rulesets/main.json`](../.github/rulesets/main.json). It was applied and
read back from GitHub on 2026-11-22.

## Enforced policy

| Setting                       | Value                                         |
| ----------------------------- | --------------------------------------------- |
| Enforcement                   | Active                                        |
| Target                        | `refs/heads/main` only                        |
| Pull request required         | Yes; direct pushes are blocked                |
| Required approving reviews    | 0                                             |
| Required status check         | `foundation`                                  |
| Expected status source        | GitHub Actions, integration ID `15368`        |
| Branch must be up to date     | Yes                                           |
| Review conversations resolved | Required                                      |
| Force pushes                  | Blocked                                       |
| Branch deletion               | Blocked                                       |
| Bypass actors                 | None, including repository roles and Renovate |

The `foundation` job in [Check](../.github/workflows/check.yml) covers dependency
installation, type checking, linting, formatting, unit/integration tests, the
production image build and browser flows. Requiring the job gates merging on the
complete workflow, rather than on an early successful step. Preserve its unique
name; if it changes, update the live required check and this payload together.

Zero required approvals fits a solo-maintained repository and permits
CI-gated Renovate updates without requiring a second person. Conversations still
need resolution. Code-owner reviews, last-push approval, signed commits, linear
history and a merge queue are not required. Existing merge methods are unchanged.

These rules apply equally to human and bot PRs. Renovate receives no bypass and
must satisfy the same checks and up-to-date requirement. Automatic merging is
configured separately in Renovate's configuration; this ruleset does not enable
automatic merging for ordinary PRs or change GitHub's auto-merge repository setting.

## Maintaining the settings

GitHub enforces repository rulesets from its settings, not from this JSON file.
Merging a change to the recorded payload does **not** apply it automatically.
For a policy change, review the payload in a PR, update the existing ruleset via
GitHub's Settings → Rules → Rulesets or the repository rulesets API, then read back
the live settings and active rules. Update the existing ruleset rather than
creating overlapping duplicates. No administration token is stored in this repo
or passed to CI.

After a change, verify that the ruleset remains active, the target is correct,
the bypass list is empty, `foundation` is tied to GitHub Actions, and unrelated
feature branches have no matching rules. Check that a current PR reports the
expected required check. Renaming or disabling the CI job without updating the
ruleset will block merges until corrected.

The repository owner can edit the ruleset to recover from a broken configuration.
An empty bypass list prevents ordinary merges/pushes from bypassing the rules;
it does not remove the owner's ability to administer repository settings.
