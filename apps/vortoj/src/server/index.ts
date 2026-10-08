import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { bodyLimit } from "hono/body-limit";
import { randomUUID } from "node:crypto";
import type { connectDatabase } from "@repo/shared/database";
import type { User } from "@repo/shared/auth";
import {
  appDefinition,
  statusSchema,
  createRoomSchema,
  tileSetSchema,
  commandSchema,
} from "../contracts/index.ts";
import { createVortojService, VortojError } from "./service.ts";
export { appDefinition };
export type VortojOptions = {
  db: ReturnType<typeof connectDatabase>["db"];
  origin: string;
  cookieName: string;
  secureCookies: boolean;
  ready?: () => boolean;
  resolveUser?: (token: string | undefined) => User | null;
  registerCleanup?: (cleanup: () => void) => void;
};
export function createRoutes(options?: VortojOptions) {
  const routes = new Hono();
  routes.get("/status", (c) => c.json(statusSchema.parse({ app: "vortoj", stage: "foundation" })));
  if (!options) return routes;
  const service = createVortojService(options.db),
    listeners = new Map<string, Set<() => void>>(),
    closers = new Set<() => void>();
  const resolveUser = (c: Parameters<typeof getCookie>[0]) =>
    options.resolveUser?.(getCookie(c, `${options.cookieName}_auth`));
  const user = (c: Parameters<typeof getCookie>[0]): User => {
    const value = resolveUser(c);
    if (!value) throw new VortojError("Sign in to play Vortoj.", 401);
    return value;
  };
  const publish = (id: string) => {
    for (const send of listeners.get(id) ?? []) send();
  };
  options.registerCleanup?.(() => {
    for (const close of closers) close();
  });
  routes.onError((error, c) => {
    if (error instanceof VortojError) return c.json({ error: error.message }, error.status);
    const reference = randomUUID();
    console.error("Vortoj request failed", { reference, error: error.name });
    return c.json(
      {
        error: `Could not complete this game request. Try again; if it keeps failing, share reference ${reference} with the site owner.`,
      },
      500,
    );
  });
  const protect = async (c: Parameters<typeof getCookie>[0], next: () => Promise<void>) => {
    c.header("Cache-Control", "no-store");
    if (options.ready && !options.ready())
      return c.json({ error: "Game storage is being updated. Try again shortly." }, 503);
    if (c.req.method !== "GET" && c.req.header("Origin") !== options.origin)
      return c.json({ error: "Invalid request origin" }, 403);
    const user = resolveUser(c);
    if (!user) return c.json({ error: "Sign in to play Vortoj." }, 401);
    await next();
  };
  for (const path of ["/rooms", "/rooms/*", "/tile-sets", "/tile-sets/*"])
    routes.use(path, protect);
  routes.use(
    "*",
    bodyLimit({ maxSize: 16384, onError: (c) => c.json({ error: "Request too large" }, 413) }),
  );
  routes.get("/tile-sets", (c) => c.json(service.sets(user(c))));
  routes.post("/tile-sets", async (c) => {
    const value = tileSetSchema.safeParse(await c.req.json().catch(() => null));
    if (!value.success)
      return c.json({ error: value.error.issues[0]?.message ?? "Invalid tile set" }, 400);
    return c.json(service.saveSet(user(c), value.data), 201);
  });
  routes.post("/tile-sets/:id", async (c) => {
    const value = tileSetSchema.safeParse(await c.req.json().catch(() => null));
    if (!value.success)
      return c.json({ error: value.error.issues[0]?.message ?? "Invalid tile set" }, 400);
    return c.json(service.saveSet(user(c), value.data, c.req.param("id")));
  });
  routes.delete("/tile-sets/:id", (c) => {
    service.deleteSet(user(c), c.req.param("id"));
    return c.json({ ok: true });
  });
  routes.get("/rooms", (c) => c.json(service.list(user(c))));
  routes.post("/rooms", async (c) => {
    const value = createRoomSchema.safeParse(await c.req.json().catch(() => null));
    if (!value.success) return c.json({ error: "Enter a room name and select a tile set" }, 400);
    return c.json(service.create(user(c), value.data.title, value.data.tileSetId), 201);
  });
  routes.get("/rooms/:id/info", (c) => c.json(service.info(c.req.param("id"))));
  routes.get("/rooms/:id", (c) => c.json(service.snapshot(c.req.param("id"), user(c))));
  routes.post("/rooms/:id/join", (c) => {
    const value = service.join(c.req.param("id"), user(c));
    publish(value.id);
    return c.json(value);
  });
  routes.post("/rooms/:id/command", async (c) => {
    const command = commandSchema.safeParse(await c.req.json().catch(() => null));
    if (!command.success)
      return c.json({ error: "Invalid game action. Check your tiles and try again." }, 400);
    const value = service.command(c.req.param("id"), user(c), command.data);
    publish(value.id);
    return c.json(value);
  });
  routes.get("/rooms/:id/events", (c) => {
    const id = c.req.param("id"),
      initial = user(c);
    service.snapshot(id, initial);
    const encoder = new TextEncoder();
    let cleanup = () => {},
      closed = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const stop = () => {
          if (closed) return;
          closed = true;
          cleanup();
          controller.close();
        };
        const send = () => {
          if (closed || (controller.desiredSize ?? 0) <= 0) return;
          try {
            const user = resolveUser(c);
            if (!user || user.id !== initial.id) throw new VortojError("Sign in again", 401);
            const snapshot = service.snapshot(id, user);
            controller.enqueue(
              encoder.encode(
                `id: ${snapshot.version}\nevent: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`,
              ),
            );
          } catch (error) {
            const event =
              error instanceof VortojError && error.status === 404 ? "removed" : "expired";
            controller.enqueue(encoder.encode(`event: ${event}\ndata: {}\n\n`));
            stop();
          }
        };
        const callbacks = listeners.get(id) ?? new Set<() => void>();
        listeners.set(id, callbacks);
        callbacks.add(send);
        const timer = setInterval(send, 5000);
        timer.unref();
        cleanup = () => {
          clearInterval(timer);
          callbacks.delete(send);
          closers.delete(stop);
          if (!callbacks.size) listeners.delete(id);
          c.req.raw.signal.removeEventListener("abort", stop);
        };
        closers.add(stop);
        c.req.raw.signal.addEventListener("abort", stop, { once: true });
        send();
      },
      cancel() {
        closed = true;
        cleanup();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  });
  return routes;
}
