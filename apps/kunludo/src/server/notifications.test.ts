import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { connectDatabase, migrateDatabase } from "@repo/shared/database";
import type { Mail, SendMail } from "@repo/shared/mail";
import type { Action } from "../contracts/index.ts";
import { createTeamService } from "./service.ts";
import { createNotificationWorker, notificationDelay } from "./notifications.ts";
import { mailQueue, memberships } from "./schema.ts";
const disposers: (() => void)[] = [];
afterEach(() => {
  for (const close of disposers.splice(0)) close();
  vi.restoreAllMocks();
});
const a = { id: "admin", name: "Anna" },
  b = { id: "player", name: "Ben" },
  d = { id: "other-admin", name: "Dora" };
function fixture() {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const directory = mkdtempSync(join(tmpdir(), "kunludo-mails-"));
  migrateDatabase(directory, "kunludo", resolve("migrations/kunludo"));
  let connection = connectDatabase(directory, "kunludo");
  disposers.push(() => {
    connection.close();
    rmSync(directory, { recursive: true, force: true });
  });
  let clock = Date.parse("2026-08-01T00:00Z");
  const options = { secret: "s".repeat(64), now: () => clock };
  let service = createTeamService(connection.db, options);
  const send = (user: typeof a, action: Action, commandId: string = randomUUID()) =>
    service.command(user, { commandId, version: service.snapshot(user).version, action });
  const teamId = send(a, {
    kind: "create-team",
    team: { name: "TT 4", club: "Club", needed: 4, timezone: "Europe/Berlin" },
  }).teamId!;
  for (const user of [b, d]) send(user, { kind: "join", teamId, pin: service.code(teamId, a).pin });
  const game = (opponent: string) => {
    send(a, {
      kind: "create-game",
      teamId,
      game: {
        opponent,
        venue: "Halle",
        home: true,
        window: {
          start: Date.parse("2026-11-20T19:00Z"),
          end: Date.parse("2026-11-20T22:00Z"),
          buffer: 0,
        },
      },
    });
    return service.snapshot(a).games.find((g) => g.opponent === opponent)!;
  };
  const first = game("First"),
    second = game("Second");
  const sent: Mail[] = [];
  const worker = (
    transport: SendMail = async (mail) => {
      sent.push(mail);
    },
  ) =>
    createNotificationWorker(connection.db, {
      now: () => clock,
      origin: "https://apps.example.test",
      send: transport,
      deliveryAddress: (id) => `${id}@example.test`,
    });
  return {
    teamId,
    first,
    second,
    sent,
    send,
    worker,
    options,
    service: () => service,
    db: () => connection.db,
    rows: () => connection.db.select().from(mailQueue).all(),
    advance: (ms: number) => {
      clock += ms;
    },
    answer: (answer: "yes" | "no" | "maybe", gameId = first.id, commandId?: string) =>
      send(b, { kind: "answer", teamId, gameId, answer }, commandId),
    reopen() {
      connection.close();
      connection = connectDatabase(directory, "kunludo");
      service = createTeamService(connection.db, options);
    },
  };
}
it("batches the team's matches until five minutes after the last real change", async () => {
  const f = fixture();
  f.answer("yes");
  f.advance(240_000);
  f.answer("maybe", f.second.id);
  expect(f.rows()).toHaveLength(1);
  expect(f.rows()[0]!.changes).toHaveLength(2);
  const worker = f.worker();
  f.advance(notificationDelay - 1);
  await worker.run();
  expect(f.sent).toHaveLength(0);
  f.advance(1);
  await worker.run();
  expect(f.sent).toHaveLength(1);
  expect(f.sent[0]).toMatchObject({
    to: "admin@example.test",
    subject: "TT 4: Verfügbarkeit aktualisiert",
  });
  expect(f.sent[0]!.text).toContain("First");
  expect(f.sent[0]!.text).toContain("Second");
  expect(f.sent[0]!.text).toContain("Noch keine Antwort → Ja");
  expect(f.sent[0]!.text).toContain("20:00");
  expect(f.sent[0]!.text).toContain("https://apps.example.test/kunludo/");
  expect(f.rows()).toHaveLength(0);
  await worker.run();
  expect(f.sent).toHaveLength(1);
});
it("does not extend a batch for unchanged answers or duplicate command IDs, and removes reverted edits", async () => {
  const f = fixture(),
    id = randomUUID();
  f.answer("yes", f.first.id, id);
  const due = f.rows()[0]!.dueAt;
  f.advance(240_000);
  f.answer("yes");
  f.answer("yes", f.first.id, id);
  expect(f.rows()[0]!.dueAt).toBe(due);
  f.advance(60_000);
  await f.worker().run();
  expect(f.sent).toHaveLength(1);
  f.answer("no");
  f.answer("maybe");
  f.answer("yes");
  expect(f.rows()).toHaveLength(0);
});
it("persists batches and due times through database reopen", async () => {
  const f = fixture();
  f.answer("maybe");
  const row = f.rows()[0]!;
  f.reopen();
  expect(f.rows()[0]).toEqual(row);
  f.advance(notificationDelay);
  await f.worker().run();
  expect(f.sent).toHaveLength(1);
});
it("saves no notification or answer when the surrounding command rolls back", () => {
  const f = fixture();
  const broken = createTeamService(f.db(), {
    ...f.options,
    id: () => {
      throw new Error("injected failure");
    },
  });
  expect(() =>
    broken.command(b, {
      commandId: randomUUID(),
      version: f.service().snapshot(b).version,
      action: { kind: "answer", teamId: f.teamId, gameId: f.first.id, answer: "yes" },
    }),
  ).toThrow("injected failure");
  expect(f.rows()).toHaveLength(0);
  expect(
    f
      .service()
      .snapshot(b)
      .games.find((g) => g.id === f.first.id)!.mine,
  ).toBe("unanswered");
});
it("retries only the failed recipient and backs off persistently", async () => {
  const f = fixture();
  f.send(a, { kind: "promote", teamId: f.teamId, userId: d.id });
  f.answer("no");
  f.advance(notificationDelay);
  let failed = false;
  const delivered: string[] = [];
  const worker = f.worker(async (mail) => {
    if (mail.to === "admin@example.test" && !failed) {
      failed = true;
      throw new Error("private provider details");
    }
    delivered.push(mail.to);
  });
  await worker.run();
  expect(delivered).toEqual(["other-admin@example.test"]);
  expect(f.rows()).toHaveLength(1);
  expect(f.rows()[0]).toMatchObject({ attempts: 1, status: "sending" });
  await worker.run();
  expect(delivered).toHaveLength(1);
  f.reopen();
  f.advance(60_000);
  await f
    .worker(async (mail) => {
      delivered.push(mail.to);
    })
    .run();
  expect(delivered).toEqual(["other-admin@example.test", "admin@example.test"]);
  expect(f.rows()).toHaveLength(0);
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
    "private provider details",
  );
});
it.each(["admin removed", "admin demoted", "player removed", "game cancelled", "game rescheduled"])(
  "suppresses queued information when %s before delivery",
  async (reason) => {
    const f = fixture();
    f.answer("yes");
    if (reason === "admin removed") {
      f.send(a, { kind: "promote", teamId: f.teamId, userId: d.id });
      f.send(d, { kind: "remove", teamId: f.teamId, userId: a.id });
    }
    if (reason === "admin demoted")
      f.db().update(memberships).set({ role: "member" }).where(eq(memberships.userId, a.id)).run();
    if (reason === "player removed") f.send(a, { kind: "remove", teamId: f.teamId, userId: b.id });
    if (reason === "game cancelled")
      f.send(a, { kind: "cancel", teamId: f.teamId, gameId: f.first.id });
    if (reason === "game rescheduled")
      f.send(a, {
        kind: "edit-game",
        teamId: f.teamId,
        gameId: f.first.id,
        game: { opponent: "First", venue: "Other hall", home: true, window: f.first.window },
      });
    f.advance(notificationDelay);
    await f.worker().run();
    expect(f.sent).toHaveLength(0);
    expect(f.rows()).toHaveLength(0);
  },
);
it("excludes the acting admin and identifies admin-entered responses to other admins", async () => {
  const f = fixture();
  f.send(a, { kind: "promote", teamId: f.teamId, userId: d.id });
  f.send(a, {
    kind: "set-answer",
    teamId: f.teamId,
    gameId: f.first.id,
    userId: b.id,
    answer: "no",
  });
  expect(f.rows().map((r) => r.recipientId)).toEqual([d.id]);
  f.advance(notificationDelay);
  await f.worker().run();
  expect(f.sent[0]!.text).toContain("geändert von Anna");
});
it("preserves changes arriving during delivery and serializes concurrent worker runs", async () => {
  const f = fixture();
  f.answer("yes");
  f.advance(notificationDelay);
  let release!: () => void;
  let markEntered!: () => void;
  const entered = new Promise<void>((resolve) => {
    markEntered = resolve;
  });
  const worker = f.worker(async (mail) => {
    f.sent.push(mail);
    markEntered();
    await new Promise<void>((r) => {
      release = r;
    });
  });
  const first = worker.run();
  await entered;
  const concurrent = worker.run();
  f.answer("no");
  expect(f.rows()).toHaveLength(2);
  release();
  await Promise.all([first, concurrent]);
  expect(f.rows()).toHaveLength(1);
  expect(f.rows()[0]!.changes[0]!.after).toBe("no");
  f.advance(notificationDelay);
  await f.worker().run();
  expect(f.sent).toHaveLength(2);
  expect(f.sent[1]!.text).toContain("Ja → Nein");
});
it("recovers expired sending leases and never processes failed jobs automatically", async () => {
  const f = fixture();
  f.answer("yes");
  f.advance(notificationDelay);
  f.db()
    .update(mailQueue)
    .set({ status: "sending", leaseUntil: f.options.now() + 60_000 })
    .run();
  f.reopen();
  await f.worker().run();
  expect(f.sent).toHaveLength(0);
  f.advance(60_000);
  await f.worker().run();
  expect(f.sent).toHaveLength(1);
  f.answer("no");
  f.db().update(mailQueue).set({ status: "failed" }).run();
  f.advance(notificationDelay);
  await f.worker().run();
  expect(f.sent).toHaveLength(1);
});
it("stops after eight failed deliveries without blocking saved availability", async () => {
  const f = fixture();
  f.answer("yes");
  f.advance(notificationDelay);
  let attempts = 0;
  const worker = f.worker(async () => {
    attempts++;
    throw new Error("offline");
  });
  for (let i = 0; i < 8; i++) {
    await worker.run();
    f.advance(3_600_000);
  }
  expect(attempts).toBe(8);
  expect(f.rows()[0]).toMatchObject({ status: "failed", attempts: 8 });
  expect(
    f
      .service()
      .snapshot(b)
      .games.find((g) => g.id === f.first.id)!.mine,
  ).toBe("yes");
  await worker.run();
  expect(attempts).toBe(8);
});

it("merges a failed delivery with later edits and waits for the new quiet period", async () => {
  const f = fixture();
  f.answer("yes");
  f.advance(notificationDelay);
  await f
    .worker(async () => {
      throw new Error("offline");
    })
    .run();
  f.advance(30_000);
  f.answer("no", f.second.id);
  f.advance(30_000);
  await f.worker().run();
  expect(f.sent).toHaveLength(0);
  f.advance(notificationDelay - 30_000);
  await f.worker().run();
  expect(f.sent).toHaveLength(1);
  expect(f.sent[0]!.text).toContain("First");
  expect(f.sent[0]!.text).toContain("Second");
  expect(f.rows()).toHaveLength(0);
});

it("keeps team batches separate even for the same player and does not leak the other schedule", async () => {
  const f = fixture();
  const other = f.send(d, {
    kind: "create-team",
    team: { name: "Other club", club: "Private", needed: 4, timezone: "Europe/Berlin" },
  }).teamId!;
  f.send(b, { kind: "join", teamId: other, pin: f.service().code(other, d).pin });
  f.send(d, {
    kind: "create-game",
    teamId: other,
    game: { opponent: "Private opponent", venue: "Secret", home: true, window: f.first.window },
  });
  const gameId = f
    .service()
    .snapshot(d)
    .games.find((g) => g.teamId === other)!.id;
  f.answer("yes");
  f.advance(240_000);
  f.send(b, { kind: "answer", teamId: other, gameId, answer: "maybe" });
  f.advance(60_000);
  await f.worker().run();
  expect(f.sent).toHaveLength(1);
  expect(f.sent[0]!.to).toBe("admin@example.test");
  expect(f.sent[0]!.text).not.toContain("Private opponent");
  f.advance(240_000);
  await f.worker().run();
  expect(f.sent).toHaveLength(2);
  expect(f.sent[1]!.to).toBe("other-admin@example.test");
  expect(f.sent[1]!.text).not.toContain("First");
});

it("aborts and awaits in-flight delivery on shutdown, preserving its recoverable lease", async () => {
  const f = fixture();
  f.answer("yes");
  f.advance(notificationDelay);
  let markEntered!: () => void;
  const entered = new Promise<void>((resolve) => {
    markEntered = resolve;
  });
  const worker = f.worker(async (_mail, signal) => {
    markEntered();
    await new Promise<void>((_resolve, reject) =>
      signal!.addEventListener("abort", () => reject(new Error("aborted")), { once: true }),
    );
  });
  const run = worker.run();
  await entered;
  await worker.stop();
  await run;
  expect(f.rows()[0]).toMatchObject({ status: "sending" });
  await worker.run();
  expect(f.rows()).toHaveLength(1);
  f.reopen();
  f.advance(60_000);
  await f.worker().run();
  expect(f.sent).toHaveLength(1);
});

it("does not retry an older change to an admin who subsequently edited that answer", async () => {
  const f = fixture();
  f.answer("yes");
  f.advance(notificationDelay);
  await f
    .worker(async () => {
      throw new Error("offline");
    })
    .run();
  for (const answer of ["no", "yes"] as const)
    f.send(a, { kind: "set-answer", teamId: f.teamId, gameId: f.first.id, userId: b.id, answer });
  f.advance(notificationDelay);
  await f.worker().run();
  expect(f.sent).toHaveLength(0);
  expect(f.rows()).toHaveLength(0);
});

it("sends Anna and Bob one combined digest after the last team change across Charlie/Dave G1–G5 sequences", async () => {
  const f = fixture();
  const bob = { id: "bob", name: "Bob" },
    charlie = { id: "charlie", name: "Charlie" },
    dave = { id: "dave", name: "Dave" };
  for (const user of [bob, charlie, dave])
    f.send(user, { kind: "join", teamId: f.teamId, pin: f.service().code(f.teamId, a).pin });
  f.send(a, { kind: "promote", teamId: f.teamId, userId: bob.id });
  const games = new Map<string, string>();
  for (let i = 1; i <= 5; i++) {
    const start = f.first.window.start + i * 86400000;
    f.send(a, {
      kind: "create-game",
      teamId: f.teamId,
      game: {
        opponent: `G${i}`,
        venue: "Halle",
        home: true,
        window: { start, end: start + 7200000, buffer: 0 },
      },
    });
    games.set(
      `G${i}`,
      f
        .service()
        .snapshot(a)
        .games.find((g) => g.opponent === `G${i}`)!.id,
    );
  }
  const sequence = [
    [0, charlie, "G1", "yes"],
    [0, dave, "G5", "no"],
    [1, charlie, "G3", "yes"],
    [2, charlie, "G2", "no"],
    [2, dave, "G2", "maybe"],
    [3, charlie, "G5", "maybe"],
    [3, dave, "G4", "yes"],
    [4, charlie, "G4", "yes"],
    [4, dave, "G1", "yes"],
    [5, charlie, "G1", "maybe"],
    [6, dave, "G3", "no"],
  ] as const;
  let minute = 0;
  for (const [at, user, game, answer] of sequence) {
    f.advance((at - minute) * 60_000);
    minute = at;
    f.send(user, { kind: "answer", teamId: f.teamId, gameId: games.get(game)!, answer });
  }
  f.advance(4 * 60_000);
  await f.worker().run();
  expect(f.sent).toHaveLength(0);
  expect(f.rows()).toHaveLength(2);
  f.advance(60_000);
  await f.worker().run();
  expect(f.sent).toHaveLength(2);
  expect(f.sent.map((mail) => mail.to).sort()).toEqual(["admin@example.test", "bob@example.test"]);
  expect(f.sent.every((mail) => mail.text.includes("Charlie") && mail.text.includes("Dave"))).toBe(
    true,
  );
  expect(f.sent[0]!.text.match(/G1\n/g)).toHaveLength(2);
  expect(f.sent[0]!.text).toContain("G1\nNoch keine Antwort → Vielleicht");
  expect(f.sent[0]!.text).toContain("G1\nNoch keine Antwort → Ja");
  expect(f.rows()).toHaveLength(0);
});

it("reverting one player's answer preserves another player's edit on the same match", async () => {
  const f = fixture();
  f.answer("yes");
  f.advance(notificationDelay);
  await f.worker().run();
  f.sent.length = 0;
  f.answer("no");
  f.send(d, { kind: "answer", teamId: f.teamId, gameId: f.first.id, answer: "maybe" });
  f.answer("yes");
  expect(f.rows()).toHaveLength(1);
  expect(f.rows()[0]!.changes.map((c) => c.playerId)).toEqual([d.id]);
  f.advance(notificationDelay);
  await f.worker().run();
  expect(f.sent).toHaveLength(1);
  expect(f.sent[0]!.text).toContain("Dora");
  expect(f.sent[0]!.text).not.toContain("Ben");
});

it("removing a player suppresses only their entries from a combined team digest", async () => {
  const f = fixture();
  f.answer("yes");
  f.send(d, { kind: "answer", teamId: f.teamId, gameId: f.first.id, answer: "no" });
  f.send(a, { kind: "remove", teamId: f.teamId, userId: b.id });
  f.advance(notificationDelay);
  await f.worker().run();
  expect(f.sent).toHaveLength(1);
  expect(f.sent[0]!.text).toContain("Dora");
  expect(f.sent[0]!.text).not.toContain("Ben");
});
