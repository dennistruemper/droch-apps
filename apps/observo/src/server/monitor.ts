import { interval, slotStart } from "../domain/index.ts";
import type { Latest } from "../contracts/index.ts";
import type { createStore } from "./store.ts";
import type { Site } from "./sites.ts";

export function startMonitor(options: {
  store: ReturnType<typeof createStore>;
  sites: readonly Site[];
  ready: () => boolean;
  disabled?: boolean;
  check: (site: Site, signal: AbortSignal) => Promise<Latest>;
  now: () => number;
  onError: () => void;
}) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  async function tick() {
    if (controller.signal.aborted || running) return;
    running = true;
    if (timer) clearTimeout(timer);
    try {
      if (!options.ready()) return;
      options.store.prune(options.now());
      if (options.disabled || !options.store.isActivated()) return;
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
      running = false;
      if (!controller.signal.aborted) {
        const now = options.now();
        timer = setTimeout(() => void tick(), Math.max(1, slotStart(now) + interval - now));
        timer.unref();
      }
    }
  }
  void tick();
  return {
    wake: () => {
      void tick();
    },
    stop: () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    },
  };
}
