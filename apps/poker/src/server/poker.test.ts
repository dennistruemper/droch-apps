import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { connectDatabase, migrateDatabase } from "@repo/shared/database";
import { roomSnapshotSchema } from "../contracts/index.ts";
import { createRoutes } from "./index.ts";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});
const origin = "http://localhost:3000";
const period = 30 * 24 * 60 * 60 * 1000;
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "droch-poker-"));
  let ready = true;
  let now = 1_800_000_000_000;
  migrateDatabase(directory, "poker", resolve("migrations/poker"));
  let connection = connectDatabase(directory, "poker");
  let streams: (() => void)[] = [];
  function routes() {
    return createRoutes({
      db: connection.db,
      origin,
      cookieName: "test",
      secureCookies: false,
      now: () => now,
      ready: () => ready,
      registerCleanup: (close) => streams.push(close),
    });
  }
  let app = routes();
  cleanups.push(() => {
    streams.forEach((close) => close());
    connection.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const request = (path: string, cookie = "", body?: unknown, requestOrigin = origin) =>
    app.request(path, {
      headers: { Cookie: cookie, Origin: requestOrigin, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }),
    });
  async function create() {
    const response = await request("/rooms", "", { title: "Planning", name: "Host" });
    expect(response.status).toBe(201);
    const cookie = response.headers.get("set-cookie")!.split(";")[0]!;
    const snapshot = roomSnapshotSchema.parse(await response.json());
    return { cookie, snapshot, path: `/rooms/${snapshot.id}` };
  }
  async function joinRoom(path: string) {
    const response = await request(`${path}/join`, "", { name: "Guest" });
    expect(response.status).toBe(200);
    return response.headers.get("set-cookie")!.split(";")[0]!;
  }
  return {
    request,
    create,
    joinRoom,
    advance: (milliseconds: number) => {
      now += milliseconds;
    },
    client: () => connection.db.$client,
    setReady: (value: boolean) => {
      ready = value;
    },
    restart() {
      streams.forEach((close) => close());
      streams = [];
      connection.close();
      migrateDatabase(directory, "poker", resolve("migrations/poker"));
      connection = connectDatabase(directory, "poker");
      app = routes();
    },
  };
}
async function event(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const chunk = await reader.read();
  const text = new TextDecoder().decode(chunk.value);
  expect(text).toContain("event: snapshot");
  return roomSnapshotSchema.parse(JSON.parse(text.split("data: ")[1]!.trim()));
}

describe("poker HTTP and persistence", () => {
  it("filters private votes in every snapshot and SSE update, then reveals and resets atomically", async () => {
    const f = fixture();
    const host = await f.create();
    const guest = await f.joinRoom(host.path);
    const stream = await f.request(`${host.path}/events`, guest);
    const reader = stream.body!.getReader();
    expect(stream.headers.get("content-type")).toBe("text/event-stream");
    expect((await event(reader)).participants).toHaveLength(2);
    await f.request(`${host.path}/vote`, host.cookie, { round: 1, vote: "13" });
    const update = await event(reader);
    expect(update.participants.find((p) => p.isCreator)).toMatchObject({
      hasVoted: true,
      vote: null,
    });
    expect(update.you.vote).toBeNull();
    const own = roomSnapshotSchema.parse(await (await f.request(host.path, host.cookie)).json());
    expect(own.you.vote).toBe("13");
    expect(own.participants.every((p) => p.vote === null)).toBe(true);
    await f.request(`${host.path}/vote`, guest, { round: 1, vote: "☕" });
    expect((await event(reader)).you.vote).toBe("☕");
    const revealed = await f.request(`${host.path}/reveal`, guest, { round: 1 });
    expect(revealed.status).toBe(200);
    expect((await event(reader)).participants.map((p) => p.vote).sort()).toEqual(["13", "☕"]);
    expect((await f.request(`${host.path}/vote`, guest, { round: 1, vote: "8" })).status).toBe(409);
    const resets = await Promise.all([
      f.request(`${host.path}/reset`, guest, { round: 1 }),
      f.request(`${host.path}/reset`, host.cookie, { round: 1 }),
    ]);
    expect(resets.map((r) => r.status).sort()).toEqual([200, 409]);
    const reset = await event(reader);
    expect(reset).toMatchObject({ round: 2, revealed: false, you: { vote: null } });
    expect(reset.participants.every((p) => !p.hasVoted && p.vote === null)).toBe(true);
    expect((await f.request(`${host.path}/vote`, guest, { round: 1, vote: "8" })).status).toBe(409);
    expect((await f.request(`${host.path}/reveal`, host.cookie, { round: 2 })).status).toBe(409);
    await reader.cancel();
  });

  it("reconnects with a full durable snapshot and keeps anonymous membership across backend restarts", async () => {
    const f = fixture(),
      host = await f.create(),
      guest = await f.joinRoom(host.path);
    await f.request(`${host.path}/vote`, guest, { round: 1, vote: "☕" });
    const before = roomSnapshotSchema.parse(await (await f.request(host.path, guest)).json());
    f.restart();
    const after = roomSnapshotSchema.parse(await (await f.request(host.path, guest)).json());
    expect(after).toEqual(before);
    const rejoin = roomSnapshotSchema.parse(
      await (await f.request(`${host.path}/join`, guest, { name: "Duplicate" })).json(),
    );
    expect(rejoin.you.id).toBe(before.you.id);
    expect(rejoin.participants).toHaveLength(2);
    await f.request(`${host.path}/reveal`, host.cookie, { round: 1 });
    const reader = (await f.request(`${host.path}/events`, guest)).body!.getReader();
    const current = await event(reader);
    expect(current.version).toBeGreaterThan(before.version);
    expect(current.revealed).toBe(true);
    expect(current.participants.find((p) => p.id === before.you.id)?.vote).toBe("☕");
    await reader.cancel();
  });

  it("requires room membership on reads, streams, and commands; protects origins and cookie credentials", async () => {
    const f = fixture(),
      host = await f.create();
    for (const suffix of ["", "/events"])
      expect((await f.request(host.path + suffix)).status).toBe(401);
    expect((await f.request(`${host.path}/vote`, "", { round: 1, vote: "5" })).status).toBe(401);
    for (const command of ["reveal", "reset"])
      expect((await f.request(`${host.path}/${command}`, "", { round: 1 })).status).toBe(401);
    const other = await f.create();
    expect((await f.request(host.path, other.cookie)).status).toBe(401);
    expect(
      (await f.request("/rooms", "", { title: "x", name: "x" }, "https://evil.test")).status,
    ).toBe(403);
    expect((await f.request(`${host.path}/reset`, host.cookie, { round: 1 }, "")).status).toBe(403);
    expect(
      (await f.request(`${host.path}/vote`, host.cookie, { round: 1, vote: "100" })).status,
    ).toBe(400);
    expect((await f.request("/rooms", "", { title: "", name: "x" })).status).toBe(400);
    expect((await f.request("/rooms/not-an-id/info")).status).toBe(404);
    expect((await f.request("/rooms", "", { title: "x", name: "x".repeat(5000) })).status).toBe(
      413,
    );
    const response = await f.request(`${host.path}/join`, host.cookie, { name: "Host" });
    expect(response.headers.get("set-cookie")).toMatch(/HttpOnly/);
    expect(response.headers.get("set-cookie")).toMatch(/Path=\/api\/poker/);
    expect(response.headers.get("set-cookie")).toMatch(/SameSite=Lax/);
    const rows = f.client().prepare("SELECT token_hash FROM participants").all() as {
      token_hash: string;
    }[];
    expect(rows.every((row) => !host.cookie.includes(row.token_hash))).toBe(true);
    const publicInfo = await (await f.request(`${host.path}/info`)).json();
    expect(Object.keys(publicInfo).sort()).toEqual(["id", "participantCount", "title"]);
  });

  it("gives recovery instructions for unavailable storage and references unexpected failures without leaking details", async () => {
    const f = fixture();
    f.setReady(false);
    const unavailable = await f.request("/rooms", "", { title: "Planning", name: "Host" });
    expect(unavailable.status).toBe(503);
    expect((await unavailable.json()).error).toContain("Please try again shortly");
    f.setReady(true);
    f.client().exec("DROP TABLE participants");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const failed = await f.request("/rooms", "", {
        title: "Private title",
        name: "Private name",
      });
      expect(failed.status).toBe(500);
      const body = await failed.json();
      expect(body.error).toMatch(/Could not create the room.*error reference [a-f0-9-]{36}/);
      expect(body.error).not.toMatch(/SQL|participants|Private/);
      expect(log).toHaveBeenCalledOnce();
      expect(JSON.stringify(log.mock.calls)).not.toContain("Private name");
    } finally {
      log.mockRestore();
    }
  });

  it("expires at 30 days, cascades membership deletion, and does not count viewing as activity", async () => {
    const f = fixture(),
      host = await f.create();
    f.advance(period - 1);
    expect((await f.request(host.path, host.cookie)).status).toBe(200);
    f.advance(1);
    expect((await f.request(host.path, host.cookie)).status).toBe(404);
    expect(f.client().prepare("SELECT * FROM participants").all()).toEqual([]);
    expect((await f.request(`${host.path}/join`, host.cookie, { name: "Host" })).status).toBe(404);
  });

  it("refreshes inactivity for joins, votes, reveals, and new rounds, including repeated joins", async () => {
    const f = fixture(),
      host = await f.create();
    for (const [command, body] of [
      ["join", { name: "Host" }],
      ["vote", { round: 1, vote: "?" }],
      ["reveal", { round: 1 }],
      ["reset", { round: 1 }],
    ] as const) {
      f.advance(period - 1);
      expect((await f.request(`${host.path}/${command}`, host.cookie, body)).status).toBe(200);
    }
    f.advance(period - 1);
    expect((await f.request(host.path, host.cookie)).status).toBe(200);
  });
});
