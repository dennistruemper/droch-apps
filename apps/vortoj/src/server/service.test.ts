import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
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
  return {
    root,
    db,
    a,
    b,
    c,
    service: createVortojService(db.db, { now: () => 1000, draw: () => 0, id: randomUUID }),
  };
}
describe("Vortoj durable rooms", () => {
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
