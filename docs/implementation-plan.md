# Implementation plan

All milestones are pending. This is a sequence of work, not a promise that scripts
or infrastructure already exist. See [architecture](architecture.md) and
[decisions](decisions.md).

## 1. Foundation

- Add mise pins for Node and pnpm, workspace manifests, and the lockfile.
- Create one package per app plus server composition and shared modules.
- Configure strict TypeScript, Solid 2 compilation, Oxlint, Oxfmt, and Vitest.
- Add explicit exports and resolved module-boundary enforcement.
- Add root commands for development, checks, tests, builds, and migrations.
- Integrate Drochsign after deciding how to consume and update it.

Acceptance: type checking and builds pass; forbidden import fixtures fail, including
cross-module relative imports and client-to-server imports within an app package.

## 2. Runnable shells and isolated development

- Build frontend shells at `/poker/` and `/words/` with a shared typed registry.
- Create the Hono composition server, static serving, and scoped SPA fallbacks.
- Add PostgreSQL/Drizzle, migration execution, production Compose, and dev overrides.
- Add worktree-specific resource IDs, port allocation, cookies, and startup URLs.
- Match tool versions between development, CI, and Docker.

Acceptance: production image and local hot reload work. Two worktrees run at once
without sharing databases, sessions, ports, outputs, or cleanup scope. Restarting
one leaves the other functional. Failed migrations block startup. API and asset
404s are not converted into SPA HTML.

## 3. Poker vertical slice

- Implement room creation, invite links, anonymous membership, voting, reveal, and reset.
- Separate pure rules from server persistence and participant authorization.
- Persist rooms and participant identities; add an agreed inactive-room expiry policy.
- Add SSE, snapshots, versioning, reconnect, and missed-update reconciliation.

Acceptance: two browser contexts complete rounds, recover after restart, and never
receive another player's unrevealed vote. Unauthorized participants cannot reveal
or reset a round.

## 4. Custom email-code accounts

- Implement Mailtrap sending and development Sandbox configuration.
- Add focused auth APIs, verification records, accounts, and server-side sessions.
- Implement code expiry, keyed digests, atomic consumption, throttling, and revocation.
- Document environment setup without committing credentials.

Acceptance: login works end to end; expiry, attempt limits, resend behavior,
concurrent verification, code reuse, logout, origin protection, and worktree session
separation are tested. No password functionality exists.

## 5. Word-game slice

- Settle dictionary language/licensing and rules before implementation.
- Implement invitations, membership, racks, board, validation, and scoring.
- Add passing, exchanging, match completion, durable history, and no turn deadline.
- Use transactional command IDs and match versions for duplicate/stale submissions.
- Reuse live-update infrastructure while keeping domain and authorization rules app-specific.

Acceptance: players can play together or resume after days. Concurrent and retried
commands cannot apply duplicate turns. Opponents' private rack data is never sent.
Restart and reconnect preserve the authoritative match.

## 6. Deployment verification and future-app workflow

- Add scoped CI checks and multiplayer Playwright tests.
- Document the one-time Coolify/domain/Mailtrap setup, backups, and restore procedure.
- Add a small app scaffold command using the chosen package layout and registry.
- Verify a temporary third app builds and mounts without Compose, DNS, or Coolify edits.
- Verify streaming and reconnect through the production proxy.

Acceptance: one deployable Compose stack, tested recovery, reproducible tool versions,
and documented app creation requiring only repository changes and deployment.
