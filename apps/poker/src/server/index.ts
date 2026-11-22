import { createEventStreams } from "@repo/shared/events";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { bodyLimit } from "hono/body-limit";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { connectDatabase } from "@repo/shared/database";
import {
  appDefinition,
  statusSchema,
  createRoomSchema,
  joinRoomSchema,
  roomIdSchema,
  roundCommandSchema,
  voteCommandSchema,
} from "../contracts/index.ts";
import type { Command } from "../domain/index.ts";
import { createPokerService, PokerError, inactivityPeriod } from "./service.ts";

export { appDefinition };

export type PokerOptions = {
  db: ReturnType<typeof connectDatabase>["db"];
  origin: string;
  cookieName: string;
  secureCookies: boolean;
  now?: () => number;
  ready?: () => boolean;
  registerCleanup?: (cleanup: () => void) => void;
};

export function createRoutes(options?: PokerOptions) {
  const routes = new Hono();
  const status = () => statusSchema.parse({ app: "poker", stage: "foundation" });

  if (!options) return routes.get("/status", (c) => c.json(status()));
  const service = createPokerService(options.db, options.now);
  const subscribers = new Map<string, Set<() => void>>();
  const streams = createEventStreams();
  options.registerCleanup?.(streams.close);
  const cookieName = `${options.cookieName}_poker`;

  const token = (c: Parameters<typeof getCookie>[0]) => {
    const value = getCookie(c, cookieName);

    return value && /^[a-f0-9]{64}$/.test(value) ? value : undefined;
  };

  const hash = (value: string) => createHash("sha256").update(value).digest("hex");

  const credential = (c: Parameters<typeof getCookie>[0]) => {
    const value = token(c);

    if (!value) throw new PokerError("Join this room first", 401);

    return hash(value);
  };

  const remember = (c: Parameters<typeof getCookie>[0], value: string) =>
    setCookie(c, cookieName, value, {
      httpOnly: true,
      secure: options.secureCookies,
      sameSite: "Lax",
      path: "/api/poker",
      maxAge: inactivityPeriod / 1000,
    });

  const publish = (id: string) => {
    for (const update of subscribers.get(id) ?? []) update();
  };

  routes.onError((error, c) => {
    if (error instanceof PokerError) return c.json({ error: error.code }, error.status);
    const reference = randomUUID();
    const cause = error.cause;
    console.error("Poker request failed", {
      reference,
      path: c.req.path,
      error: error.name,
      cause: cause instanceof Error ? cause.name : undefined,
      code: cause && typeof cause === "object" && "code" in cause ? cause.code : undefined,
    });
    const action = c.req.path.endsWith("/rooms") ? "create the room" : "complete this room request";

    return c.json(
      {
        error: `Could not ${action}. Please try again. If it keeps failing, share error reference ${reference} with the site owner.`,
      },
      500,
    );
  });
  routes.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");

    if (options.ready && !options.ready())
      return c.json(
        {
          error:
            "Poker is temporarily unavailable while room storage is updated. Please try again shortly.",
        },
        503,
      );

    if (c.req.method === "POST" && c.req.header("Origin") !== options.origin)
      return c.json({ error: "Invalid request origin" }, 403);
    await next();
  });
  routes.use(
    "*",
    bodyLimit({ maxSize: 4096, onError: (c) => c.json({ error: "Request too large" }, 413) }),
  );
  routes.use("/rooms/:id/*", async (c, next) => {
    if (!roomIdSchema.safeParse(c.req.param("id")).success)
      return c.json({ error: "Room not found" }, 404);
    await next();
  });
  routes.use("/rooms/:id", async (c, next) => {
    if (!roomIdSchema.safeParse(c.req.param("id")).success)
      return c.json({ error: "Room not found" }, 404);
    await next();
  });
  routes.get("/status", (c) => c.json(status()));
  routes.post("/rooms", async (c) => {
    const parsed = createRoomSchema.safeParse(await c.req.json().catch(() => null));

    if (!parsed.success) return c.json({ error: "Enter a room title and your name" }, 400);
    const value = token(c) ?? randomBytes(32).toString("hex");
    const snapshot = service.create(parsed.data.title, parsed.data.name, hash(value));
    remember(c, value);

    return c.json(snapshot, 201);
  });
  routes.get("/rooms/:id/info", (c) => c.json(service.info(c.req.param("id"))));
  routes.get("/rooms/:id", (c) => c.json(service.snapshot(c.req.param("id"), credential(c))));
  routes.post("/rooms/:id/join", async (c) => {
    const parsed = joinRoomSchema.safeParse(await c.req.json().catch(() => null));

    if (!parsed.success) return c.json({ error: "Enter your name" }, 400);
    const value = token(c) ?? randomBytes(32).toString("hex");
    const snapshot = service.join(c.req.param("id"), parsed.data.name, hash(value));
    remember(c, value);
    publish(snapshot.id);

    return c.json(snapshot);
  });
  routes.post("/rooms/:id/:command", async (c) => {
    const kind = c.req.param("command");

    if (kind !== "vote" && kind !== "reveal" && kind !== "reset") return c.notFound();
    const body: unknown = await c.req.json().catch(() => null);

    const parsed =
      kind === "vote" ? voteCommandSchema.safeParse(body) : roundCommandSchema.safeParse(body);

    if (!parsed.success) return c.json({ error: "Invalid round or vote" }, 400);

    const command: Command =
      kind === "vote"
        ? { kind, ...voteCommandSchema.parse(body) }
        : { kind, round: parsed.data.round };

    const snapshot = service.command(c.req.param("id"), credential(c), command);
    const value = token(c);

    if (value) remember(c, value);
    publish(snapshot.id);

    return c.json(snapshot);
  });
  routes.get("/rooms/:id/events", (c) => {
    const id = c.req.param("id"),
      viewer = credential(c);

    service.snapshot(id, viewer); // Authorize before opening the response.

    return streams.response({
      signal: c.req.raw.signal,
      interval: 10000,
      slowReader: "skip",
      subscribe(send) {
        const listeners = subscribers.get(id) ?? new Set<() => void>();
        subscribers.set(id, listeners);
        listeners.add(send);

        return () => {
          listeners.delete(send);

          if (!listeners.size) subscribers.delete(id);
        };
      },
      send({ write, close }) {
        try {
          const snapshot = service.snapshot(id, viewer);
          write(`id: ${snapshot.version}\nevent: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);
        } catch (error) {
          if (error instanceof PokerError) write("event: expired\ndata: {}\n\n");
          close();
        }
      },
    });
  });

  return routes;
}
