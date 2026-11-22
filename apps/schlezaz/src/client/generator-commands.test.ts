import { afterEach, describe, expect, it, vi } from "vitest";
import { execute } from "./generator-commands.ts";

afterEach(() => vi.useRealTimers());

describe("generator command cancellation", () => {
  it("rejects an already cancelled sample before drawing randomness", async () => {
    const controller = new AbortController();
    const reason = new Error("Disposed");
    controller.abort(reason);
    await expect(execute({ kind: "sample", requestId: 1 }, controller.signal)).rejects.toBe(reason);
  });

  it("cancels a pending wait and clears its timer without returning completion", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const reason = new Error("Disposed");
    const pending = execute({ kind: "wait", requestId: 2, milliseconds: 500 }, controller.signal);
    const rejected = pending.catch((error: unknown) => error);
    expect(vi.getTimerCount()).toBe(1);
    controller.abort(reason);
    expect(await rejected).toBe(reason);
    expect(vi.getTimerCount()).toBe(0);
    await vi.runAllTimersAsync();
  });
});
