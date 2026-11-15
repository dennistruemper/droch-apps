import { afterEach, describe, expect, it, vi } from "vitest";
import { interval, slotStart } from "../domain/index.ts";
import { startMonitor } from "./monitor.ts";
import { sites } from "./sites.ts";

type Options = Parameters<typeof startMonitor>[0];

type Store = Options["store"];

import type { Latest } from "../contracts/index.ts";

afterEach(() => vi.useRealTimers());

describe("five-minute scheduler", () => {
  it("aligns to clock slots, skips persisted slots, and aborts without recording after shutdown", async () => {
    vi.useFakeTimers();
    const now = Date.UTC(2026, 9, 24, 10, 2);
    vi.setSystemTime(now);
    const record = vi.fn<Store["record"]>();
    const prune = vi.fn<Store["prune"]>();
    const hasSlot = vi.fn<Store["hasSlot"]>().mockReturnValueOnce(true).mockReturnValue(false);

    const store = { record, prune, hasSlot, isActivated: () => true } satisfies Store;

    let complete: ((result: Latest) => void) | undefined;
    let signal: AbortSignal | undefined;

    const check = vi.fn<Options["check"]>((_site, activeSignal: AbortSignal) => {
      signal = activeSignal;

      return new Promise<Latest>((resolve) => {
        complete = resolve;
      });
    });

    const { stop } = startMonitor({
      store,
      sites,
      check,
      ready: () => true,
      now: Date.now,
      onError: vi.fn<Options["onError"]>(),
    });

    expect(check).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3 * 60_000);
    expect(check).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(interval);
    expect(check).toHaveBeenCalledTimes(1); // No overlap while a check is pending.
    stop();
    expect(signal?.aborted).toBe(true);
    complete?.({
      slot: slotStart(Date.now()),
      checkedAt: Date.now(),
      outcome: "available",
      reason: "ok",
      statusCode: 200,
      durationMs: 10,
    });
    await vi.advanceTimersByTimeAsync(interval);
    expect(record).not.toHaveBeenCalled();
    expect(check).toHaveBeenCalledTimes(1);
  });
  it("waits for migrations and treats browser launch failures as missing observations", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 9, 24, 10));

    const store = {
      record: vi.fn<Store["record"]>(),
      prune: vi.fn<Store["prune"]>(),
      hasSlot: () => false,
      isActivated: () => true,
    } satisfies Store;

    let ready = false;
    const onError = vi.fn<Options["onError"]>();
    const check = vi.fn<Options["check"]>().mockRejectedValue(new Error("browser unavailable"));

    const { stop } = startMonitor({
      store,
      sites,
      check,
      ready: () => ready,
      now: Date.now,
      onError,
    });

    expect(check).not.toHaveBeenCalled();
    ready = true;
    await vi.advanceTimersByTimeAsync(interval);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(store.record).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(interval);
    expect(check).toHaveBeenCalledTimes(2);
    stop();
  });
});
