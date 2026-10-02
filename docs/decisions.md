# Decisions

Recorded on 2026-10-02. These capture the planning conversation, not completed work.

## Agreed choices

| Decision | Rationale / consequence |
| --- | --- |
| One monorepo, one backend, a frontend per app | Share infrastructure while keeping app features modular. |
| TypeScript throughout | One application language, with type safety and fast feedback as priorities. |
| Solid 2 without SolidStart | Interactive apps; Solid 2 prerelease risk is accepted. Landing pages can use another technology later. |
| Paths on one origin | New apps require no additional DNS or Coolify routing configuration. |
| One package per app | Earlier contract/domain/server packages per app were excessive. Internal modules are folders with explicit APIs. |
| pnpm and Node 24 LTS | Preferred over Bun for package management and runtime. |
| Drizzle and PostgreSQL | Drizzle selected after comparing Kysely, Prisma, and plain SQL. |
| Custom authentication | User prefers a focused implementation over Better Auth. Passwords and password hashes are excluded. |
| Email code or link through Mailtrap | Email-based account access; email codes are the current baseline. |
| Docker Compose includes the database | One deployable stack and a similar local environment. |
| No Effect library | Use pure functions and explicit dependencies with ordinary TypeScript. |
| Drochsign CSS starting point | Semantic HTML, minimal classes, two-color themes; themes can differ by app. |
| Independent worktree development | Multiple apps/branches can be worked on and run concurrently. |

## Product requirements

### Scrum poker

No accounts. Participants join rooms anonymously. Guest identity and host permissions
still need server enforcement; no registration should be required.

### Word game

Accounts are required. Matches are turn-based with live updates. Players can be online
together or make moves days apart. There is no time limit per turn. Durable match
state must not depend on a browser or live connection remaining open.

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
- Persist poker rooms across deployments and expire inactive rooms.
- One backend instance initially, with PostgreSQL as the durable source of truth.

## Still to settle

- Exact dependency versions and confirmed Solid 2 integration compatibility.
- How Drochsign is consumed and updated: vendored snapshot or versioned dependency.
- Word-game dictionary language, licensing, board layout, scoring, and player count.
- Poker voting deck, room expiration policy, and detailed host behavior.
- Exact code/session lifetimes, account registration policy, and email-change behavior.
- Backup destination, retention, and operational restore procedure.

## References

- [Solid 2 announcement](https://github.com/solidjs/solid/discussions/2995)
- [Drochsign](https://github.com/dennistruemper/drochsign)
- [Coolify Compose](https://coolify.io/docs/applications/builds/docker-compose)
- [Drizzle migrations](https://orm.drizzle.team/docs/migrations)
- [mise](https://mise.jdx.dev/)
