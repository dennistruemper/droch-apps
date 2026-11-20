import { afterEach, describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { connectDatabase, migrateDatabase } from "@repo/shared/database";
import { createTeamService } from "./service.ts";
import { createRoutes } from "./index.ts";
import { teamInputSchema, type Action } from "../contracts/index.ts";

const alice = { id: "alice", name: "Alice" },
  bob = { id: "bob", name: "Bob" },
  charlie = { id: "charlie", name: "Charlie" };

const dispose: (() => void)[] = [];

afterEach(() => {
  for (const f of dispose.splice(0)) f();
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "kunludo-"));
  migrateDatabase(directory, "kunludo", resolve("migrations/kunludo"));
  const connection = connectDatabase(directory, "kunludo");
  dispose.push(() => {
    connection.close();
    rmSync(directory, { recursive: true, force: true });
  });

  const secret = "s".repeat(64),
    now = Date.parse("2026-08-01T00:00Z"),
    service = createTeamService(connection.db, { secret, now: () => now });

  const send = (u: typeof alice, action: Action) =>
    service.command(u, { commandId: randomUUID(), version: service.snapshot(u).version, action });

  const create = (u = alice, name = "Team", club = "Club A") =>
    send(u, { kind: "create-team", team: { name, club, timezone: "Europe/Berlin", needed: 4 } })
      .teamId!;

  const enter = (tid: string, u = bob) =>
    send(u, { kind: "join", teamId: tid, pin: service.code(tid, alice).pin });

  const game = (tid: string, start = "2026-11-20T18:00Z", opponent = "Visitors") => {
    send(alice, {
      kind: "create-game",
      teamId: tid,
      game: {
        opponent,
        venue: "Hall",
        home: true,
        window: { start: Date.parse(start), end: Date.parse(start) + 7200000, buffer: 30 },
      },
    });

    return service
      .snapshot(alice)
      .games.filter((g) => g.teamId === tid)
      .at(-1)!;
  };

  return { service, connection, send, create, enter, game, secret, now };
}

describe("teams, privacy and transactional planning", () => {
  it("creates the account as admin, uses one identity across unrestricted clubs and rejects named rosters", () => {
    const f = fixture(),
      a = f.create(alice, "Adults", "Club A"),
      b = f.create(alice, "Boys", "Club B");

    f.enter(a);
    f.enter(b);
    const s = f.service.snapshot(bob);
    expect(s.teams.map((t) => t.club)).toEqual(["Club A", "Club B"]);
    expect(s.teams.every((t) => t.members.find((m) => m.id === bob.id)?.name === "Bob")).toBe(true);
    expect(
      teamInputSchema.safeParse({
        name: "X",
        club: "",
        needed: 4,
        timezone: "Europe/Berlin",
        creatorName: "Fake",
      }).success,
    ).toBe(false);
    expect(f.service.snapshot(charlie).teams).toEqual([]);
    expect(() => f.service.code(a, bob)).toThrow(/Admins/);
  });
  it("promotes joined users, protects the last admin, and atomically rotates PIN on removal with safe retries", () => {
    const f = fixture(),
      tid = f.create(),
      old = f.service.code(tid, alice);

    f.enter(tid);
    expect(old.pin).toMatch(/^[A-Z0-9]{6}$/);
    expect(() => f.send(bob, { kind: "remove", teamId: tid, userId: alice.id })).toThrow(/Admins/);
    expect(() => f.send(alice, { kind: "remove", teamId: tid, userId: alice.id })).toThrow(
      /weiteren Admin/,
    );
    f.send(alice, { kind: "promote", teamId: tid, userId: bob.id });

    const cmd = {
      commandId: randomUUID(),
      version: f.service.snapshot(alice).version,
      action: { kind: "remove", teamId: tid, userId: bob.id } as const,
    };

    f.service.command(alice, cmd);
    const next = f.service.code(tid, alice);
    expect(next.teamId).toBe(tid);
    expect(next.pin).not.toBe(old.pin);
    f.service.command(alice, cmd);
    expect(f.service.code(tid, alice)).toEqual(next);
    expect(f.service.snapshot(bob).teams).toEqual([]);
    expect(() => f.send(bob, { kind: "join", teamId: tid, pin: old.pin })).toThrow(/ungültig/);
    f.send(bob, { kind: "join", teamId: tid, pin: next.pin });
    expect(f.service.snapshot(bob).teams).toHaveLength(1);
    expect(JSON.stringify(f.service.snapshot(alice))).not.toContain(next.pin);
    const stored = f.connection.db.$client.prepare("SELECT pin_box,pin_digest FROM teams").get();
    expect(JSON.stringify(stored)).not.toContain(next.pin);
  });
  it("does not rotate on session changes, preserves another team, and checks cross-team targets", () => {
    const f = fixture(),
      a = f.create(),
      b = f.create(alice, "Other", "Club B");

    f.enter(a);
    f.enter(b);
    const before = f.service.code(a, alice);
    expect(f.service.code(a, { ...alice })).toEqual(before);
    f.send(alice, { kind: "remove", teamId: a, userId: bob.id });
    expect(f.service.snapshot(bob).teams.map((t) => t.id)).toEqual([b]);
    expect(() =>
      f.send(bob, {
        kind: "create-game",
        teamId: a,
        game: {
          opponent: "X",
          venue: "",
          home: true,
          window: { start: f.now + 10000, end: f.now + 20000, buffer: 0 },
        },
      }),
    ).toThrow(/nicht verfügbar/);
    const g = f.game(b);
    expect(() => f.send(alice, { kind: "cancel", teamId: a, gameId: g.id })).toThrow(
      /nicht verfügbar/,
    );
  });
  it("prevents double-counting across hidden teams, protects privacy and serializes overlapping commitments", () => {
    const f = fixture(),
      a = f.create(),
      b = f.create(alice, "Secret Boys", "Secret club");

    f.enter(a);

    const ga = f.game(a),
      gb = f.game(b, "2026-11-20T19:00Z", "Private opponent");

    f.send(alice, { kind: "answer", teamId: a, gameId: ga.id, answer: "yes" });
    f.send(alice, { kind: "answer", teamId: b, gameId: gb.id, answer: "yes" });
    expect(
      f.service.snapshot(alice).games.every((g) => g.mine === "pending" && g.ready === 0),
    ).toBe(true);
    const guest = JSON.stringify(f.service.snapshot(bob));
    expect(guest).not.toContain("Secret");
    expect(guest).not.toContain("Private opponent");
    expect(f.service.snapshot(bob).games[0]!.members.find((m) => m.id === alice.id)?.state).toBe(
      "pending",
    );
    const v = f.service.snapshot(alice).version;
    f.send(alice, { kind: "commit", teamId: a, gameId: ga.id });
    expect(() =>
      f.service.command(alice, {
        commandId: randomUUID(),
        version: v,
        action: { kind: "commit", teamId: b, gameId: gb.id },
      }),
    ).toThrow(/geändert/);
    f.send(alice, { kind: "commit", teamId: b, gameId: gb.id });
    const s = f.service.snapshot(alice);
    expect(s.games.filter((g) => g.committed)).toHaveLength(1);
    expect(s.games.find((g) => g.id === ga.id)?.mine).toBe("elsewhere");
    expect(f.service.snapshot(bob).games[0]!.members.find((m) => m.id === alice.id)?.state).toBe(
      "elsewhere",
    );
  });
  it("supports both non-overlapping games and reconfirms reschedules, polls and reserves", () => {
    const f = fixture(),
      a = f.create(),
      b = f.create(),
      g = f.game(a),
      h = f.game(b, "2026-11-21T18:00Z");

    f.enter(a);

    for (const [tid, x] of [
      [a, g],
      [b, h],
    ] as const)
      f.send(alice, { kind: "commit", teamId: tid, gameId: x.id });
    expect(f.service.snapshot(alice).games.filter((g) => g.committed)).toHaveLength(2);
    f.send(alice, { kind: "reserve", teamId: a, gameId: g.id, userId: bob.id, add: true });
    expect(f.service.snapshot(alice).games.find((v) => v.id === g.id)!.ready).toBe(1);
    const window = { start: g.window.start + 86400000, end: g.window.end + 86400000, buffer: 30 };
    f.send(bob, { kind: "propose", teamId: a, gameId: g.id, window });
    const p = f.service.snapshot(alice).games.find((v) => v.id === g.id)!.proposals[0]!;
    f.send(bob, { kind: "vote", teamId: a, gameId: g.id, proposalId: p.id, answer: "yes" });
    f.send(alice, { kind: "adopt", teamId: a, gameId: g.id, proposalId: p.id });
    const updated = f.service.snapshot(alice).games.find((v) => v.id === g.id)!;
    expect(updated.mine).toBe("stale");
    expect(updated.members.some((m) => m.reserve)).toBe(false);
    expect(updated.committed).toBe(false);
    expect(updated.proposals).toEqual([]);
  });
  it("imports both actual calendars, deduplicates per team, and preserves answers on unchanged re-import", () => {
    const f = fixture();

    for (const n of [3, 4]) {
      const tid = f.create(alice, `Team ${n}`),
        calendar = readFileSync(`e2e/fixtures/rendsburger-tsv-${n}.ics`, "utf8");

      const selected = [...calendar.matchAll(/^UID:\s*(.+)$/gm)].map((m) => m[1]!.trim());

      const action: Action = {
        kind: "import",
        teamId: tid,
        calendar,
        ownName: `Rendsburger TSV ${n}`,
        selected,
      };

      f.send(alice, action);
      const first = f.service.snapshot(alice).games.filter((g) => g.teamId === tid);
      expect(first).toHaveLength(20);
      f.send(alice, { kind: "answer", teamId: tid, gameId: first[0]!.id, answer: "yes" });
      f.send(alice, action);
      expect(f.service.snapshot(alice).games.filter((g) => g.teamId === tid)).toHaveLength(20);
      expect(f.service.snapshot(alice).games.find((g) => g.id === first[0]!.id)!.mine).toBe("yes");
    }

    const reopened = createTeamService(f.connection.db, { secret: f.secret, now: () => f.now });
    expect(reopened.snapshot(alice).games).toHaveLength(40);
  });
  it("bounds failed joining attempts and rejects command-ID reuse with different actions", () => {
    const f = fixture(),
      tid = f.create();

    for (let i = 0; i < 20; i++)
      expect(() => f.send(bob, { kind: "join", teamId: tid, pin: "000000" })).toThrow(
        /PIN|beitreten|Versuche/i,
      );

    expect(() => f.send(bob, { kind: "join", teamId: tid, pin: "000000" })).toThrow(
      expect.objectContaining({ status: 429 }),
    );

    const c = {
      commandId: randomUUID(),
      version: f.service.snapshot(alice).version,
      action: { kind: "rotate", teamId: tid } as const,
    };

    f.service.command(alice, c);
    expect(() =>
      f.service.command(alice, { ...c, action: { kind: "remove", teamId: tid, userId: alice.id } }),
    ).toThrow(/Anfrage-ID/);
  });
  it("enforces sessions, origin, runtime data and private HTTP/event payloads", async () => {
    const f = fixture(),
      tid = f.create();

    const routes = createRoutes({
      db: f.connection.db,
      joinSecret: f.secret,
      origin: "https://local.test",
      cookieName: "test",
      resolveUser: (token) => (token === "alice" ? alice : token === "bob" ? bob : null),
    });

    expect((await routes.request("/snapshot")).status).toBe(401);

    const headers = {
      Cookie: "test_auth=bob",
      "Content-Type": "application/json",
      Origin: "https://evil.test",
    };

    expect((await routes.request("/command", { method: "POST", headers, body: "{}" })).status).toBe(
      403,
    );
    expect(
      (await routes.request(`/teams/${tid}/code`, { headers: { Cookie: "test_auth=bob" } })).status,
    ).toBe(404);
    expect(
      (
        await routes.request("/command", {
          method: "POST",
          headers: { ...headers, Origin: "https://local.test" },
          body: JSON.stringify({
            commandId: randomUUID(),
            version: 0,
            action: {
              kind: "create-team",
              team: {
                name: "X",
                club: "",
                needed: 4,
                timezone: "Europe/Berlin",
                creatorName: "fake",
              },
            },
          }),
        })
      ).status,
    ).toBe(400);
    const abort = new AbortController();

    const events = await routes.request("/events", {
      headers: { Cookie: "test_auth=bob" },
      signal: abort.signal,
    });

    const reader = events.body!.getReader();
    const event = new TextDecoder().decode((await reader.read()).value);
    expect(event).not.toContain(tid);
    await reader.cancel();
    abort.abort();
  });
});

it("withdraws private team snapshots immediately on an open stream after removal", async () => {
  const f = fixture(),
    tid = f.create();

  f.enter(tid);

  const routes = createRoutes({
    db: f.connection.db,
    joinSecret: f.secret,
    origin: "https://local.test",
    cookieName: "test",
    resolveUser: (t) => (t === "alice" ? alice : t === "bob" ? bob : null),
  });

  const stream = await routes.request("/events", { headers: { Cookie: "test_auth=bob" } });
  const reader = stream.body!.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toContain(tid);

  const response = await routes.request("/command", {
    method: "POST",
    headers: {
      Cookie: "test_auth=alice",
      Origin: "https://local.test",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      commandId: randomUUID(),
      version: f.service.snapshot(alice).version,
      action: { kind: "remove", teamId: tid, userId: bob.id },
    }),
  });

  expect(response.status).toBe(200);
  const next = new TextDecoder().decode((await reader.read()).value);
  expect(next).not.toContain(tid);
  expect(next).toContain('"teams":[]');
  await reader.cancel();
});

it("allows only team admins to update joined players' availability without overriding other commitments", () => {
  const f = fixture(),
    teamId = f.create();

  f.enter(teamId);
  const game = f.game(teamId);

  const action = {
    kind: "set-answer",
    teamId,
    gameId: game.id,
    userId: bob.id,
    answer: "yes",
  } as const;

  expect(() => f.send(bob, action)).toThrow(/Admins/);
  expect(() => f.send(charlie, action)).toThrow(/nicht verfügbar/);
  expect(() => f.send(alice, { ...action, userId: charlie.id })).toThrow(/beigetretene/);
  f.send(alice, action);
  expect(f.service.snapshot(bob).games[0]!.mine).toBe("yes");
  expect(f.service.snapshot(bob).games[0]!.ready).toBe(1);
  f.send(bob, { kind: "commit", teamId, gameId: game.id });
  f.send(alice, { ...action, answer: "no" });
  expect(f.service.snapshot(bob).games[0]!.mine).toBe("no");
  expect(f.service.snapshot(bob).games[0]!.committed).toBe(false);
  const otherId = f.create(alice, "Other club");
  f.enter(otherId);
  const otherGame = f.game(otherId);
  f.send(bob, { kind: "commit", teamId: otherId, gameId: otherGame.id });
  f.send(alice, action);
  expect(f.service.snapshot(bob).games.find((g) => g.id === game.id)!.mine).toBe("elsewhere");
  expect(f.service.snapshot(bob).games.find((g) => g.id === otherGame.id)!.committed).toBe(true);
  f.send(bob, { kind: "answer", teamId, gameId: game.id, answer: "maybe" });
  expect(f.service.snapshot(bob).games.find((g) => g.id === game.id)!.mine).toBe("maybe");
});

it("applies calendar cancellations to existing and newly imported matches idempotently", () => {
  const f = fixture(),
    teamId = f.create();

  const calendar = (cancelled: boolean) =>
    [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:cancelled-match",
      "DTSTART:20261120T180000Z",
      "SUMMARY:Our team - Visitors",
      `STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n");

  const action = (cancelled: boolean): Extract<Action, { kind: "import" }> => ({
    kind: "import",
    teamId,
    calendar: calendar(cancelled),
    ownName: "Our team",
    selected: ["cancelled-match"],
  });

  f.send(alice, action(false));
  const game = f.service.snapshot(alice).games[0]!;
  f.send(alice, { kind: "commit", teamId, gameId: game.id });
  f.send(alice, action(true));
  const cancelled = f.service.snapshot(alice).games[0]!;
  expect(cancelled.cancelled).toBe(true);
  expect(cancelled.committed).toBe(false);
  expect(cancelled.ready).toBe(0);
  f.send(alice, action(true));
  expect(f.service.snapshot(alice).games[0]!.revision).toBe(cancelled.revision);
  const other = f.create(alice, "Other team");
  f.send(alice, { ...action(true), teamId: other });
  expect(f.service.snapshot(alice).games.find((g) => g.teamId === other)!.cancelled).toBe(true);
});

it("refreshes a confirmed account name in every team when its session reconnects", () => {
  const f = fixture();
  f.create(alice, "First");
  f.create(alice, "Second");
  const before = f.service.snapshot(alice).version;
  const changed = f.service.snapshot({ ...alice, name: "Shared name" });
  expect(
    changed.teams.every((t) =>
      t.members.some((m) => m.id === alice.id && m.name === "Shared name"),
    ),
  ).toBe(true);
  expect(changed.version).toBeGreaterThan(before);
  expect(f.service.snapshot({ ...alice, name: "Shared name" }).version).toBe(changed.version);
});

it("does not decode an unrelated team's game JSON when building a snapshot", () => {
  const f = fixture();
  const visible = f.create(alice, "Visible");
  const unrelated = f.create(charlie, "Unrelated");
  // Unrelated stored data must not be materialized into this viewer's snapshot.
  f.connection.db.$client
    .prepare("UPDATE teams SET games = ? WHERE id = ?")
    .run("not-json", unrelated);
  expect(f.service.snapshot(alice).teams.map((team) => team.id)).toEqual([visible]);
  expect(f.service.snapshot(bob).teams).toEqual([]);
});
