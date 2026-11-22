import { createEventStreams } from "@repo/shared/events";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { bodyLimit } from "hono/body-limit";
import { randomUUID } from "node:crypto";
import type { connectDatabase } from "@repo/shared/database";
import type { User } from "@repo/shared/auth";
import { appDefinition, commandSchema } from "../contracts/index.ts";
import { createTeamService, TeamError } from "./service.ts";
import { createNotificationWorker } from "./notifications.ts";
import type { SendMail } from "@repo/shared/mail";

export { appDefinition };

export type KunludoOptions = {
  db: ReturnType<typeof connectDatabase>["db"];
  origin: string;
  cookieName: string;
  joinSecret?: string;
  sendMail?: SendMail;
  deliveryAddress?: (userId: string) => string | null;
  resolveUser?: (token: string | undefined) => User | null;
  ready?: () => boolean;
  registerCleanup?: (cleanup: () => void | Promise<void>) => void;
};

export function createRoutes(options?: KunludoOptions) {
  const routes = new Hono();
  routes.get("/status", (c) => c.json({ app: "kunludo", stage: "ready" }));

  if (!options) return routes;

  const service = options.joinSecret
    ? createTeamService(options.db, { secret: options.joinSecret })
    : null;

  if (service && options.sendMail && options.deliveryAddress) {
    const worker = createNotificationWorker(options.db, {
      send: options.sendMail,
      deliveryAddress: options.deliveryAddress,
      origin: options.origin,
      ...(options.ready ? { ready: options.ready } : {}),
    });

    worker.start();
    options.registerCleanup?.(() => worker.stop());
  }

  const listeners = new Set<() => void>(),
    streams = createEventStreams();

  options.registerCleanup?.(streams.close);

  function user(c: Parameters<typeof getCookie>[0]): User {
    const value = options?.resolveUser?.(getCookie(c, `${options.cookieName}_auth`));

    if (!value) throw new TeamError("Bitte melde dich erneut an.", 401);

    return value;
  }

  routes.onError((error, c) => {
    if (error instanceof TeamError) return c.json({ error: error.message }, error.status);

    if (error instanceof Error && error.name === "ZodError")
      return c.json({ error: "Bitte prüfe deine Eingaben." }, 400);
    const reference = randomUUID();
    console.error("Kunludo request failed", { reference, error: error.name });

    return c.json({ error: `Anfrage fehlgeschlagen (${reference}). Bitte erneut versuchen.` }, 500);
  });
  routes.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");

    if (!service || (options.ready && !options.ready()))
      return c.json({ error: "Anmeldung oder Teamdaten momentan nicht verfügbar." }, 503);

    if (c.req.method !== "GET" && c.req.header("Origin") !== options.origin)
      return c.json({ error: "Ungültiger Anfrageursprung." }, 403);
    user(c);
    await next();
  });
  routes.use(
    "*",
    bodyLimit({
      maxSize: 600000,
      onError: (c) => c.json({ error: "Datei zu groß (maximal 500 KB)." }, 413),
    }),
  );
  routes.get("/snapshot", (c) => c.json(service!.snapshot(user(c))));
  routes.get("/teams/:id/code", (c) => c.json(service!.code(c.req.param("id"), user(c))));
  routes.post("/command", async (c) => {
    const parsed = commandSchema.safeParse(await c.req.json().catch(() => null));

    if (!parsed.success)
      return c.json({ error: parsed.error.issues[0]?.message ?? "Ungültige Anfrage." }, 400);
    const result = service!.command(user(c), parsed.data);

    for (const listener of listeners) listener();

    return c.json(result);
  });
  routes.get("/events", (c) => {
    const initial = user(c);

    return streams.response({
      signal: c.req.raw.signal,
      interval: 5000,
      slowReader: "close",
      subscribe(send) {
        listeners.add(send);

        return () => {
          listeners.delete(send);
        };
      },
      send({ write, close }) {
        try {
          const current = user(c);

          if (current.id !== initial.id) throw new TeamError("Sitzung abgelaufen.", 401);
          const value = service!.snapshot(current);
          write(`event: snapshot\nid: ${value.version}\ndata: ${JSON.stringify(value)}\n\n`);
        } catch {
          write("event: expired\ndata: {}\n\n");
          close();
        }
      },
    });
  });

  return routes;
}
