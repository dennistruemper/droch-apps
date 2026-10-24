import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { connectDatabase, migrateDatabase } from "@repo/shared/database";
import { dashboardSchema, type Latest } from "../contracts/index.ts";
import { hourDuration, interval, oldestHour } from "../domain/index.ts";
import { createStore } from "./store.ts";
import { sites } from "./sites.ts";
import { createRoutes } from "./index.ts";

const directories: string[] = [];
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
const now = Date.UTC(2026, 9, 24, 10);
const result = (slot: number, outcome: Latest["outcome"] = "available"): Latest => ({
  slot,
  checkedAt: slot + 1000,
  outcome,
  reason: outcome === "available" ? "ok" : "network-error",
  statusCode: outcome === "available" ? 200 : null,
  durationMs: 1000,
});
function setup() {
  const directory = mkdtempSync(resolve(tmpdir(), "observo-"));
  directories.push(directory);
  migrateDatabase(directory, "observo", resolve("migrations/observo"));
  const connection = connectDatabase(directory, "observo");
  return { directory, connection, store: createStore(connection.db, sites) };
}
describe("Observo persistence and public reads", () => {
  it("preserves results across reopen, ignores duplicates and keeps late results from replacing the latest", () => {
    const { directory, connection, store } = setup();
    const id = sites[0]!.id;
    store.record(id, result(now + interval), now + interval + 2000);
    store.record(id, result(now, "unreachable"), now + interval + 2000);
    store.record(id, result(now + interval, "unreachable"), now + interval + 2000);
    connection.close();
    const reopened = connectDatabase(directory, "observo");
    try {
      const persisted = createStore(reopened.db, sites);
      const snapshot = dashboardSchema.parse(persisted.snapshot(now + interval + 3000, true));
      expect(snapshot.sites[0]!.latest).toMatchObject({
        slot: now + interval,
        outcome: "available",
      });
      expect(snapshot.sites[0]!.hours).toEqual([{ hour: now, slots: 6 }]);
      expect(persisted.hasSlot(id, now)).toBe(true);
      expect(persisted.hasSlot(id, now + interval * 2)).toBe(false);
    } finally {
      reopened.close();
    }
  });
  it("expires old history and last results, retains the boundary, and removes deconfigured websites", () => {
    const { connection, store } = setup();
    try {
      const id = sites[0]!.id;
      const cutoff = oldestHour(now);
      store.record(id, result(cutoff - hourDuration), cutoff - hourDuration + 2000);
      store.record(id, result(cutoff), cutoff + 2000);
      store.record(id, result(now + interval), now); // Future result must not enter history.
      expect(store.snapshot(now, true).sites[0]!.hours).toEqual([{ hour: cutoff, slots: 1 }]);
      expect(store.snapshot(now + hourDuration, true).sites[0]!.latest).toBeNull();
      store.record(id, result(now), now + 2000);
      createStore(connection.db, []).prune(now);
      expect(store.snapshot(now, true).sites[0]!.hours).toEqual([]);
      expect(store.snapshot(now, true).sites[0]!.latest).toBeNull();
    } finally {
      connection.close();
    }
  });
  it("activates only on an explicit same-origin visit, persists across restarts and survives pruning", async () => {
    const { directory, connection, store } = setup();
    let time = now;
    const check = vi.fn(async () => result(time));
    let stop = () => {};
    const app = createRoutes({
      db: connection.db,
      origin: "http://localhost",
      now: () => time,
      check,
      registerCleanup: (cleanup) => {
        stop = cleanup;
      },
    });
    try {
      await app.request("/status");
      await app.request("/sites");
      expect(check).not.toHaveBeenCalled();
      expect(store.isActivated()).toBe(false);
      expect((await app.request("/activate", { method: "POST" })).status).toBe(403);
      expect(
        (await app.request("/activate", { method: "POST", headers: { Origin: "http://foreign" } }))
          .status,
      ).toBe(403);
      await Promise.all(
        Array.from({ length: 3 }, () =>
          app.request("/activate", { method: "POST", headers: { Origin: "http://localhost" } }),
        ),
      );
      expect(check).toHaveBeenCalledTimes(1);
      expect(store.isActivated()).toBe(true);
      time += 31 * 24 * hourDuration;
      store.prune(time);
      expect(store.isActivated()).toBe(true);
    } finally {
      stop();
      connection.close();
    }
    const reopened = connectDatabase(directory, "observo");
    try {
      createRoutes({
        db: reopened.db,
        origin: "http://localhost",
        now: () => time,
        check,
        registerCleanup: (cleanup) => {
          stop = cleanup;
        },
      });
      await Promise.resolve();
      expect(check).toHaveBeenCalledTimes(2);
    } finally {
      stop();
      reopened.close();
    }
  });
  it("serves public validated data, rejects writes and unready storage", async () => {
    const { connection } = setup();
    try {
      const app = createRoutes({
        db: connection.db,
        now: () => now,
        origin: "http://localhost",
        checksDisabled: true,
        registerCleanup: (cleanup) => cleanups.push(cleanup),
      });
      const response = await app.request("/sites");
      expect(response.status).toBe(200);
      expect(
        (
          await app.request("/activate", {
            method: "POST",
            headers: { Origin: "http://localhost" },
          })
        ).status,
      ).toBe(200);
      expect(createStore(connection.db, sites).isActivated()).toBe(false);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(dashboardSchema.parse(await response.json()).sites).toHaveLength(1);
      expect((await app.request("/sites", { method: "POST", body: "{}" })).status).toBe(404);
      expect(
        (
          await createRoutes({
            db: connection.db,
            origin: "http://localhost",
            ready: () => false,
            registerCleanup: (cleanup) => cleanups.push(cleanup),
          }).request("/sites")
        ).status,
      ).toBe(503);
    } finally {
      connection.close();
    }
  });
});
