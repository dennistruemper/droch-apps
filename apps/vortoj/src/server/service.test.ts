import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { connectDatabase, migrateDatabase } from "@repo/shared/database";
import { createVortojService } from "./service.ts";
import { createRoutes } from "./index.ts";
import { snapshotSchema, type GameCommand } from "../contracts/index.ts";
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const dispose of cleanup.splice(0)) dispose();
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "vortoj-game-"));
  migrateDatabase(root, "vortoj", resolve("migrations/vortoj"));
  const db = connectDatabase(root, "vortoj");
  cleanup.push(() => {
    db.close();
    rmSync(root, { recursive: true, force: true });
  });
  const a = { id: randomUUID(), name: "Alice" },
    b = { id: randomUUID(), name: "Bob" },
    c = { id: randomUUID(), name: "Caro" };
  let clock = 1000;
  return {
    advance: (amount: number) => {
      clock += amount;
    },
    root,
    db,
    a,
    b,
    c,
    service: createVortojService(db.db, { now: () => clock, draw: () => 0, id: randomUUID }),
  };
}
describe("Vortoj durable rooms", () => {
  it("backfills existing rooms from history or creation time without losing game data", () => {
    const root = mkdtempSync(join(tmpdir(), "vortoj-upgrade-"));
    const oldMigrations = join(root, "old-migrations");
    mkdirSync(join(oldMigrations, "meta"), { recursive: true });
    const current = resolve("migrations/vortoj");
    const journal = JSON.parse(readFileSync(join(current, "meta/_journal.json"), "utf8"));
    journal.entries = journal.entries.slice(0, 1);
    writeFileSync(join(oldMigrations, "meta/_journal.json"), JSON.stringify(journal));
    writeFileSync(
      join(oldMigrations, "0000_mushy_mongu.sql"),
      readFileSync(join(current, "0000_mushy_mongu.sql")),
    );
    try {
      migrateDatabase(root, "vortoj", oldMigrations);
      const old = connectDatabase(root, "vortoj");
      try {
        const owner = randomUUID();
        for (const [id, history] of [
          ["with-history", [{ text: "Move", at: 200 }]],
          ["no-history", []],
        ] as const)
          old.db.$client
            .prepare(
              "INSERT INTO rooms (id, owner_id, title, created_at, tile_set, state) VALUES (?, ?, ?, ?, ?, ?)",
            )
            .run(
              id,
              owner,
              id,
              100,
              JSON.stringify({ name: "A", tiles: [] }),
              JSON.stringify({ phase: "waiting", history }),
            );
      } finally {
        old.close();
      }
      migrateDatabase(root, "vortoj", current);
      const upgraded = connectDatabase(root, "vortoj");
      try {
        expect(
          upgraded.db.$client.prepare("SELECT id, updated_at FROM rooms ORDER BY id").all(),
        ).toEqual([
          { id: "no-history", updated_at: 100 },
          { id: "with-history", updated_at: 200 },
        ]);
        expect(
          upgraded.db.$client
            .prepare(
              "SELECT json_extract(state, '$.history[0].text') AS text FROM rooms WHERE id = 'with-history'",
            )
            .get(),
        ).toEqual({ text: "Move" });
      } finally {
        upgraded.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("isolates named tile collections and freezes room sets", () => {
    const f = fixture();
    const set = f.service.saveSet(f.a, {
      name: "Ä and Æ",
      tiles: [
        { letter: "Ä", count: 20, points: 2 },
        { letter: "Æ", count: 20, points: 3 },
      ],
    });
    expect(f.service.sets(f.b).some((s) => s.id === set.id)).toBe(false);
    expect(() => f.service.saveSet(f.b, { name: "Hijacked", tiles: set.tiles }, set.id)).toThrow(
      /not found/,
    );
    expect(() => f.service.create(f.b, "Room", set.id)).toThrow(/not found/);
    const room = f.service.create(f.a, "Room", set.id);
    f.service.saveSet(
      f.a,
      { name: "Changed", tiles: [{ letter: "A", count: 40, points: 1 }] },
      set.id,
    );
    f.service.deleteSet(f.a, set.id);
    expect(f.service.snapshot(room.id, f.a).tileSet.name).toBe("Ä and Æ");
  });
  it("bounds room creation per owner without blocking another account or existing games", () => {
    const f = fixture();
    const first = f.service.create(f.a, "First", "english");
    for (let i = 1; i < 100; i++) {
      f.advance(1);
      f.service.create(f.a, `Room ${i}`, "english");
    }
    const newest = f.service.create(f.a, "Overflow", "english");
    expect(() => f.service.info(first.id)).toThrow(/not found/);
    expect(f.service.list(f.a)).toHaveLength(100);
    expect(f.service.create(f.b, "Other owner", "english").title).toBe("Other owner");
    expect(f.service.join(newest.id, f.b).players).toHaveLength(2);
  });
  it("removes the least recently updated owned game and its memberships/receipts when creating room 101", () => {
    const f = fixture();
    const other = f.service.create(f.b, "Other owner's old game", "english");
    const finish = (id: string, owner: typeof f.a, guest: typeof f.b) => {
      let game = f.service.join(id, guest);
      game = f.service.command(id, owner, {
        kind: "start",
        version: game.version,
        commandId: randomUUID(),
      });
      for (let i = 0; i < 4; i++) {
        const actor = game.turnId === owner.id ? owner : guest;
        game = f.service.command(id, actor, {
          kind: "pass",
          version: game.version,
          commandId: randomUUID(),
        });
      }
      expect(game.phase).toBe("finished");
    };
    finish(other.id, f.b, f.c);
    f.advance(1);
    const oldest = f.service.create(f.a, "Oldest", "english");
    f.advance(1);
    const newer = f.service.create(f.a, "Newer", "english");
    for (let i = 2; i < 100; i++) f.service.create(f.a, `Unfinished ${i}`, "english");
    // Updating an older room protects it; creation age does not decide retention.
    f.advance(1);
    finish(newer.id, f.a, f.b);
    f.advance(1);
    finish(oldest.id, f.a, f.b);
    // The untouched unfinished rooms are older still; update them so the finished
    // newer room becomes the oldest activity across all phases.
    for (const room of f.service.list(f.a).filter((room) => room.phase === "waiting")) {
      f.advance(1);
      f.service.join(room.id, f.c);
    }
    const created = f.service.create(f.a, "Room 101", "english");
    expect(f.service.list(f.a)).toHaveLength(100);
    expect(f.service.snapshot(created.id, f.a).phase).toBe("waiting");
    expect(() => f.service.info(newer.id)).toThrow(/not found/);
    expect(f.service.snapshot(oldest.id, f.a).phase).toBe("finished");
    expect(f.service.snapshot(other.id, f.b).phase).toBe("finished");
    expect(f.service.list(f.b).some((room) => room.id === newer.id)).toBe(false);
    for (const table of ["members", "commands"])
      expect(
        f.db.db.$client
          .prepare(`SELECT count(*) AS count FROM ${table} WHERE room_id = ?`)
          .get(newer.id),
      ).toEqual({ count: 0 });
  });
  it("sorts rooms by durable accepted activity and leaves reads, retries and rejected commands unchanged", () => {
    const f = fixture();
    const older = f.service.create(f.a, "Older", "english");
    f.advance(10);
    const newer = f.service.create(f.a, "Newer", "english");
    expect(f.service.list(f.a).map((room) => room.id)).toEqual([newer.id, older.id]);
    f.advance(10);
    let game = f.service.join(older.id, f.b);
    expect(f.service.list(f.a).map((room) => room.id)).toEqual([older.id, newer.id]);
    const updated = f.service.list(f.a)[0]!.updatedAt;
    f.advance(10);
    f.service.snapshot(older.id, f.a);
    f.service.info(older.id);
    f.service.join(older.id, f.b);
    expect(f.service.list(f.a)[0]!.updatedAt).toBe(updated);
    const start: GameCommand = { kind: "start", version: game.version, commandId: randomUUID() };
    game = f.service.command(older.id, f.a, start);
    const startedAt = f.service.list(f.a)[0]!.updatedAt;
    f.advance(10);
    f.service.command(older.id, f.a, start);
    expect(() =>
      f.service.command(older.id, f.b, {
        kind: "pass",
        version: game.version,
        commandId: randomUUID(),
      }),
    ).toThrow(/turn/);
    expect(f.service.list(f.a)[0]!.updatedAt).toBe(startedAt);
    f.service.command(older.id, f.a, {
      kind: "pass",
      version: game.version,
      commandId: randomUUID(),
    });
    expect(f.service.list(f.a)[0]!.updatedAt).toBeGreaterThan(startedAt);
    const reopened = connectDatabase(f.root, "vortoj");
    try {
      expect(createVortojService(reopened.db).list(f.a)).toEqual(f.service.list(f.a));
    } finally {
      reopened.close();
    }
  });
  it("rolls back pruning if creation fails", () => {
    const f = fixture();
    const oldest = f.service.create(f.a, "Oldest", "english");
    let game = f.service.join(oldest.id, f.b);
    game = f.service.command(oldest.id, f.a, {
      kind: "start",
      version: game.version,
      commandId: randomUUID(),
    });
    for (let i = 0; i < 4; i++)
      game = f.service.command(oldest.id, game.turnId === f.a.id ? f.a : f.b, {
        kind: "pass",
        version: game.version,
        commandId: randomUUID(),
      });
    f.advance(1);
    const collision = f.service.create(f.a, "Collision", "english");
    for (let i = 2; i < 100; i++) f.service.create(f.a, `Room ${i}`, "english");
    const colliding = createVortojService(f.db.db, {
      now: () => 2000,
      draw: () => 0,
      id: () => collision.id as ReturnType<typeof randomUUID>,
    });
    expect(() => colliding.create(f.a, "Failed creation", "english")).toThrow();
    expect(f.service.snapshot(oldest.id, f.a).phase).toBe("finished");
    expect(f.service.list(f.a)).toHaveLength(100);
  });
  it("authorizes membership and limits rooms to four before starting", () => {
    const f = fixture(),
      room = f.service.create(f.a, "Room", "german");
    expect(() => f.service.snapshot(room.id, f.b)).toThrow(/Join/);
    expect(f.service.info(room.id)).toEqual({
      id: room.id,
      title: "Room",
      phase: "waiting",
      playerCount: 1,
    });
    f.service.join(room.id, f.b);
    f.service.join(room.id, f.c);
    f.service.join(room.id, { id: randomUUID(), name: "D" });
    expect(() => f.service.join(room.id, { id: randomUUID(), name: "E" })).toThrow(/four/);
    expect(f.service.join(room.id, f.b).players).toHaveLength(4);
    expect(JSON.stringify(f.service.list(f.a))).not.toContain('"rack"');
  });
  it("deduplicates retries, rejects request reuse and persists private racks on reconnect", () => {
    const f = fixture(),
      room = f.service.create(f.a, "Room", "english");
    const joined = f.service.join(room.id, f.b),
      start: GameCommand = { kind: "start", version: joined.version, commandId: randomUUID() };
    const game = f.service.command(room.id, f.a, start);
    expect(f.service.command(room.id, f.a, start).version).toBe(game.version);
    expect(() => f.service.command(room.id, f.a, { ...start, kind: "pass" })).toThrow(/request ID/);
    expect(() => f.service.join(room.id, f.c)).toThrow(/started/);
    const bob = f.service.snapshot(room.id, f.b);
    for (const tile of bob.you.rack) expect(JSON.stringify(game)).not.toContain(tile.id);
    const reopened = connectDatabase(f.root, "vortoj");
    try {
      const service = createVortojService(reopened.db);
      expect(service.snapshot(room.id, f.a)).toEqual(game);
      expect(service.snapshot(room.id, f.b).you.rack).toEqual(bob.you.rack);
    } finally {
      reopened.close();
    }
  });
  it("rolls back an invalid turn and handles concurrent stale actions", () => {
    const f = fixture(),
      room = f.service.create(f.a, "Room", "english");
    const joined = f.service.join(room.id, f.b),
      game = f.service.command(room.id, f.a, {
        kind: "start",
        version: joined.version,
        commandId: randomUUID(),
      });
    expect(() =>
      f.service.command(room.id, f.b, {
        kind: "pass",
        version: game.version,
        commandId: randomUUID(),
      }),
    ).toThrow(/turn/);
    expect(f.service.snapshot(room.id, f.a).version).toBe(game.version);
    f.service.command(room.id, f.a, {
      kind: "pass",
      version: game.version,
      commandId: randomUUID(),
    });
    expect(() =>
      f.service.command(room.id, f.a, {
        kind: "pass",
        version: game.version,
        commandId: randomUUID(),
      }),
    ).toThrow(/changed/);
  });
  it("reports pruned rooms separately from expired sessions on open streams", async () => {
    const f = fixture();
    const room = f.service.create(f.a, "Oldest", "english");
    const joined = f.service.join(room.id, f.b);
    f.service.command(room.id, f.a, {
      kind: "start",
      version: joined.version,
      commandId: randomUUID(),
    });
    f.advance(10);
    for (let i = 1; i < 100; i++) f.service.create(f.a, `Room ${i}`, "english");
    vi.useFakeTimers();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const routes = createRoutes({
        db: f.db.db,
        origin: "https://review.example.test",
        cookieName: "test",
        secureCookies: true,
        resolveUser: () => f.b,
      });
      const stream = await routes.request(`/rooms/${room.id}/events`);
      reader = stream.body!.getReader();
      await reader.read();
      f.service.create(f.a, "Room 101", "english");
      await vi.advanceTimersByTimeAsync(5000);
      expect(new TextDecoder().decode((await reader.read()).value)).toContain("event: removed");
      expect((await reader.read()).done).toBe(true);
      expect((await routes.request("/rooms")).status).toBe(200);
    } finally {
      await reader?.cancel();
      vi.useRealTimers();
    }
  });
  it("protects HTTP and event streams and filters their snapshots", async () => {
    const f = fixture(),
      origin = "https://apps.example.test",
      users: Record<string, typeof f.a> = { alice: f.a, bob: f.b, caro: f.c };
    const routes = createRoutes({
      db: f.db.db,
      origin,
      cookieName: "test",
      secureCookies: true,
      resolveUser: (token) => (token ? (users[token] ?? null) : null),
    });
    const call = (path: string, actor?: string, body?: unknown) =>
      routes.request(path, {
        method: body ? "POST" : "GET",
        headers: { Origin: origin, ...(actor ? { Cookie: `test_auth=${actor}` } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    expect((await call("/rooms")).status).toBe(401);
    expect(
      (
        await routes.request("/rooms", {
          method: "POST",
          headers: { Cookie: "test_auth=alice" },
          body: "{}",
        })
      ).status,
    ).toBe(403);
    const created = await call("/rooms", "alice", { title: "Room", tileSetId: "english" });
    const room = snapshotSchema.parse(await created.json());
    expect((await call(`/rooms/${room.id}/events`, "bob")).status).toBe(403);
    const joined = snapshotSchema.parse(
      await (await call(`/rooms/${room.id}/join`, "bob", {})).json(),
    );
    const started = snapshotSchema.parse(
      await (
        await call(`/rooms/${room.id}/command`, "alice", {
          kind: "start",
          version: joined.version,
          commandId: randomUUID(),
        })
      ).json(),
    );
    const stream = await call(`/rooms/${room.id}/events`, "bob"),
      reader = stream.body!.getReader();
    const event = new TextDecoder().decode((await reader.read()).value);
    for (const tile of started.you.rack) expect(event).not.toContain(tile.id);
    expect(event).not.toContain('"state"');
    delete users.bob;
    const passed = await call(`/rooms/${room.id}/command`, "alice", {
      kind: "pass",
      version: started.version,
      commandId: randomUUID(),
    });
    expect(passed.status).toBe(200);
    expect(new TextDecoder().decode((await reader.read()).value)).toContain("event: expired");
    expect((await reader.read()).done).toBe(true);
    expect((await call(`/rooms/${room.id}`, "bob")).status).toBe(401);
    await reader.cancel();
  });
});
