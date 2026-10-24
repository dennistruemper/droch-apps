import { afterEach, describe, expect, it, vi } from "vitest";
import type { Browser } from "playwright";
import { checkSite } from "./check.ts";
import { sites } from "./sites.ts";
import { slotStart } from "../domain/index.ts";

afterEach(() => vi.useRealTimers());

// The pending browser operation rejects on close, as Chromium does for both
// deadline cleanup and an unexpected disconnect. No real browser or network runs.
function fixture() {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 9, 24, 10));
  let connected = true;
  let rejectNavigation: ((error: Error) => void) | undefined;
  const page = {
    setDefaultTimeout: vi.fn(),
    on: vi.fn(),
    goto: vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectNavigation = reject;
        }),
    ),
  };
  const close = vi.fn(async () => {
    connected = false;
    rejectNavigation?.(new Error("Browser disconnected"));
  });
  const browser = {
    close,
    isConnected: () => connected,
    newContext: async () => ({ route: async () => {}, newPage: async () => page }),
  } as unknown as Browser;
  const controller = new AbortController();
  const options = { now: Date.now, signal: controller.signal, launch: async () => browser };
  return { close, page, controller, options };
}

describe("browser check deadline", () => {
  it("records deadline expiry as a failed timeout rather than losing the observation", async () => {
    const { close, page, options } = fixture();
    const started = Date.now();
    const pending = checkSite(sites[0]!, options);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(page.goto).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toMatchObject({
      slot: slotStart(started),
      checkedAt: started,
      outcome: "not-functional",
      reason: "timeout",
      durationMs: 60_000,
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps unexpected browser disconnects as missing observations", async () => {
    const { close, options } = fixture();
    const pending = checkSite(sites[0]!, options);
    const rejected = expect(pending).rejects.toThrow("Browser disconnected");
    await vi.advanceTimersByTimeAsync(0);
    await close();
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps shutdown cancellation missing even when it coincides with the deadline", async () => {
    const { controller, options } = fixture();
    const pending = checkSite(sites[0]!, options);
    const rejected = expect(pending).rejects.toThrow("Browser disconnected");
    await vi.advanceTimersByTimeAsync(0);
    vi.advanceTimersByTime(60_000);
    controller.abort();
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps browser launch failures as missing observations", async () => {
    const { options } = fixture();
    await expect(
      checkSite(sites[0]!, {
        ...options,
        launch: async () => {
          throw new Error("Launch failed");
        },
      }),
    ).rejects.toThrow("Launch failed");
    expect(vi.getTimerCount()).toBe(0);
  });
});
