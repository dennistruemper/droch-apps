import { afterEach, expect, it, vi } from "vitest";
import { createEventStreams } from "./index.ts";

const disposers: (() => void)[] = [];

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  vi.useRealTimers();
});

function fixture(policy: "skip" | "close" = "skip") {
  vi.useFakeTimers();
  const streams = createEventStreams();
  const controller = new AbortController();
  const callbacks = new Set<() => void>();
  const unsubscribe = vi.fn<() => void>();

  const send = vi.fn<(writer: { write: (frame: string) => void; close: () => void }) => void>(
    ({ write }) => write("event: snapshot\ndata: {}\n\n"),
  );

  const options = {
    signal: controller.signal,
    interval: 1000,
    slowReader: policy,
    subscribe(notify: () => void) {
      callbacks.add(notify);

      return () => {
        callbacks.delete(notify);
        unsubscribe();
      };
    },
    send,
  };

  disposers.push(streams.close);

  return { streams, controller, callbacks, unsubscribe, send, options };
}

it("preserves headers and frames and stops periodic work and subscriptions on cancellation", async () => {
  const f = fixture();
  const response = f.streams.response(f.options);
  expect(response.headers.get("Content-Type")).toBe("text/event-stream");
  expect(response.headers.get("Cache-Control")).toBe("no-cache, no-transform");
  expect(response.headers.get("X-Accel-Buffering")).toBe("no");
  const reader = response.body!.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toBe(
    "event: snapshot\ndata: {}\n\n",
  );
  vi.advanceTimersByTime(1000);
  expect(f.send).toHaveBeenCalledTimes(2);
  await reader.cancel();
  f.controller.abort();
  f.streams.close();
  expect(f.unsubscribe).toHaveBeenCalledOnce();
  expect(f.callbacks.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});

it.each(["skip", "close"] as const)("retains the %s slow-reader policy", async (policy) => {
  const f = fixture(policy);
  const response = f.streams.response(f.options);
  // Leave the initial frame queued, then reconcile with a full queue.
  vi.advanceTimersByTime(1000);
  expect(f.send).toHaveBeenCalledOnce();
  expect(f.callbacks.size).toBe(policy === "close" ? 0 : 1);
  expect(vi.getTimerCount()).toBe(policy === "close" ? 0 : 1);
  await response.body!.cancel();
  expect(f.unsubscribe).toHaveBeenCalledOnce();
});

it("does not subscribe, schedule or send when the request has already aborted", async () => {
  const f = fixture();
  f.controller.abort();
  const response = f.streams.response(f.options);
  expect(await response.body!.getReader().read()).toEqual({ done: true, value: undefined });
  expect(f.send).not.toHaveBeenCalled();
  expect(f.callbacks.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});

it("releases a subscription returned after synchronous abort during setup", async () => {
  const f = fixture();

  const response = f.streams.response({
    ...f.options,
    subscribe(notify) {
      const cleanup = f.options.subscribe(notify);
      f.controller.abort();

      return cleanup;
    },
  });

  expect(await response.body!.getReader().read()).toEqual({ done: true, value: undefined });
  expect(f.unsubscribe).toHaveBeenCalledOnce();
  expect(f.callbacks.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  expect(f.send).not.toHaveBeenCalled();
});

it("releases timers when subscribing fails and when sending throws", async () => {
  const f = fixture();
  expect(() =>
    f.streams.response({
      ...f.options,
      subscribe() {
        throw new Error("Unavailable");
      },
    }),
  ).toThrow("Unavailable");
  expect(vi.getTimerCount()).toBe(0);
  f.send.mockImplementation(() => {
    throw new Error("Failed");
  });
  const response = f.streams.response(f.options);
  expect(await response.body!.getReader().read()).toEqual({ done: true, value: undefined });
  expect(f.unsubscribe).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it("shuts down all streams without retaining callbacks or closing twice", async () => {
  const f = fixture();
  const first = f.streams.response(f.options);
  const second = f.streams.response(f.options);
  f.streams.close();
  f.streams.close();
  await first.body!.cancel();
  await second.body!.cancel();
  expect(f.unsubscribe).toHaveBeenCalledTimes(2);
  expect(f.callbacks.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});
