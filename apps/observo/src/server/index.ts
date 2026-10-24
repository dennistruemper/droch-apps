import { Hono } from "hono";
import type { connectDatabase } from "@repo/shared/database";
import { appDefinition, dashboardSchema, type Latest } from "../contracts/index.ts";
import { createStore } from "./store.ts";
import { sites, type Site } from "./sites.ts";
import { checkSite } from "./check.ts";
import { startMonitor } from "./monitor.ts";

export { appDefinition, checkSite };
export type ObservoOptions = {
  db: ReturnType<typeof connectDatabase>["db"];
  origin: string;
  now?: () => number;
  ready?: () => boolean;
  checksDisabled?: boolean;
  check?: (site: Site, signal: AbortSignal) => Promise<Latest>;
  registerCleanup?: (cleanup: () => void) => void;
};
export function createRoutes(options?: ObservoOptions) {
  const routes = new Hono();
  routes.get("/status", (c) => c.json({ app: "observo", stage: "monitoring" }));
  if (!options)
    return routes.get("/sites", (c) =>
      c.json({ error: "Monitoring storage is temporarily unavailable." }, 503),
    );
  const now = options.now ?? Date.now;
  const ready = options.ready ?? (() => true);
  const store = createStore(options.db, sites);
  const monitor = startMonitor({
    store,
    sites,
    now,
    ready,
    disabled: options.checksDisabled ?? false,
    check: options.check ?? ((site, signal) => checkSite(site, { signal, now })),
    onError: () => console.error("Observo monitoring failed; retrying at the next slot"),
  });
  options.registerCleanup?.(monitor.stop);
  routes.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    if (!ready())
      return c.json(
        { error: "Monitoring storage is temporarily unavailable. Please try again." },
        503,
      );
    await next();
  });
  const snapshot = () =>
    dashboardSchema.parse(store.snapshot(now(), !options.checksDisabled && store.isActivated()));
  routes.get("/sites", (c) => c.json(snapshot()));
  // A rendered dashboard explicitly activates; reads, health checks and prefetches do not.
  routes.post("/activate", (c) => {
    if (c.req.header("Origin") !== options.origin)
      return c.json({ error: "Invalid request origin" }, 403);
    if (!options.checksDisabled) {
      if (store.activate(now())) monitor.wake();
    }
    return c.json(snapshot());
  });
  return routes;
}
