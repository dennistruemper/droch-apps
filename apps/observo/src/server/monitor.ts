import { interval, slotStart } from "../domain/index.ts";
import type { Latest } from "../contracts/index.ts";
import type { createStore } from "./store.ts";
import type { Site } from "./sites.ts";

export function startMonitor(options: {
  store: ReturnType<typeof createStore>;
  sites: readonly Site[];
  ready: () => boolean;
  check: (site: Site, signal: AbortSignal) => Promise<Latest>;
  now: () => number;
  onError: () => void;
}) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function tick() {
    try {
      if (!options.ready()) return;
      const now = options.now();
      options.store.prune(now);
      // Sequential checks bound outbound concurrency. Missed slots stay unknown.
      for (const site of options.sites) {
        if (controller.signal.aborted) break;
        if (options.store.hasSlot(site.id, options.now())) continue;
        const checked = await options.check(site, controller.signal);
        if (!controller.signal.aborted) options.store.record(site.id, checked, options.now());
      }
    } catch {
      if (!controller.signal.aborted) options.onError();
    } finally {
      if (!controller.signal.aborted) {
        const now = options.now();
        timer = setTimeout(() => void tick(), Math.max(1, slotStart(now) + interval - now));
        timer.unref();
      }
    }
  }
  void tick();
  return () => {
    controller.abort();
    if (timer) clearTimeout(timer);
  };
}
