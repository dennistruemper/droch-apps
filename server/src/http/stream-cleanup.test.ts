import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { connectDatabase, migrateDatabase } from "@repo/shared/database";
import { createRoutes as pokerRoutes } from "@repo/poker/server";
import { createRoutes as vortojRoutes } from "@repo/vortoj/server";
import { createRoutes as kunludoRoutes } from "@repo/kunludo/server";

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.useRealTimers();
});

async function fixture(id: "poker" | "vortoj" | "kunludo") {
  const directory = mkdtempSync(join(tmpdir(), "droch-stream-cleanup-"));
  migrateDatabase(directory, id, resolve("migrations", id));
  const connection = connectDatabase(directory, id);
  const closers: (() => void | Promise<void>)[] = [];
  const origin = "http://localhost:3000";
  const user = { id: randomUUID(), name: "Player" };
  const create = { poker: pokerRoutes, vortoj: vortojRoutes, kunludo: kunludoRoutes }[id];

  const app = create({
    db: connection.db,
    origin,
    cookieName: "test",
    secureCookies: false,
    joinSecret: "synthetic-test-secret",
    resolveUser: () => user,
    registerCleanup: (close) => closers.push(close),
  });

  cleanups.push(() => {
    for (const close of closers) void close();
    connection.close();
    rmSync(directory, { recursive: true, force: true });
  });

  let cookie = "",
    path = "/events";

  if (id !== "kunludo") {
    const response = await app.request("/rooms", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(
        id === "poker" ? { title: "Room", name: "Host" } : { title: "Room", tileSetId: "english" },
      ),
    });

    if (response.status !== 201) throw new Error(await response.text());
    cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
    path = `/rooms/${z.object({ id: z.string() }).parse(await response.json()).id}/events`;
  }

  return {
    open: (signal?: AbortSignal) =>
      app.request(path, { headers: { Cookie: cookie }, ...(signal ? { signal } : {}) }),
    close: () => {
      for (const close of closers) void close();
    },
  };
}

for (const id of ["poker", "vortoj", "kunludo"] as const) {
  describe(`${id} stream cleanup`, () => {
    it("does not retain a timer or emit a snapshot for an already disconnected request", async () => {
      const f = await fixture(id);
      vi.useFakeTimers();
      const controller = new AbortController();
      controller.abort();
      const response = await f.open(controller.signal);

      expect(vi.getTimerCount()).toBe(0);
      expect(await response.body!.getReader().read()).toEqual({ done: true, value: undefined });
      f.close();
    });

    it("releases timers on abort, body cancellation and repeated shutdown", async () => {
      const f = await fixture(id);
      vi.useFakeTimers();
      const controller = new AbortController();
      const response = await f.open(controller.signal);
      expect(vi.getTimerCount()).toBe(1);
      controller.abort();
      expect(vi.getTimerCount()).toBe(0);
      await response.body!.cancel();
      const cancelled = await f.open();
      await cancelled.body!.cancel();
      expect(vi.getTimerCount()).toBe(0);
      const stopped = await f.open();
      f.close();
      f.close();
      await stopped.body!.cancel();
      expect(vi.getTimerCount()).toBe(0);
    });
  });
}
