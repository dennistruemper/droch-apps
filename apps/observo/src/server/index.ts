import { Hono } from "hono";
import type { connectDatabase } from "@repo/shared/database";
import { appDefinition, dashboardSchema } from "../contracts/index.ts";
import { createStore } from "./store.ts";
import { sites } from "./sites.ts";
import { checkSite } from "./check.ts";
import { startMonitor } from "./monitor.ts";

export { appDefinition };
export { checkSite };
export type ObservoOptions = {
  db: ReturnType<typeof connectDatabase>["db"];
  now?: () => number;
  ready?: () => boolean;
  checksEnabled?: boolean;
  registerCleanup?: (cleanup: () => void) => void;
};
export function start(options: ObservoOptions) {
  if (options.checksEnabled === false) return;
  const now = options.now ?? Date.now;
  const stop = startMonitor({
    store: createStore(options.db, sites),
    sites,
    now,
    ready: options.ready ?? (() => true),
    check: (site, signal) => checkSite(site, { signal, now }),
    onError: () => console.error("Observo monitoring failed; retrying at the next slot"),
  });
  options.registerCleanup?.(stop);
}
export function createRoutes(options?: ObservoOptions) {
  const routes = new Hono();
  routes.get("/status", (c) => c.json({ app: "observo", stage: "monitoring" }));
  const store = options ? createStore(options.db, sites) : null;
  routes.get("/sites", (c) => {
    c.header("Cache-Control", "no-store");
    if (!store || (options?.ready && !options.ready()))
      return c.json(
        { error: "Monitoring storage is temporarily unavailable. Please try again." },
        503,
      );
    return c.json(
      dashboardSchema.parse(
        store.snapshot((options?.now ?? Date.now)(), options?.checksEnabled !== false),
      ),
    );
  });
  return routes;
}
