import { afterEach, describe, expect, it, vi } from "vitest";
import { request, RequestError } from "./api.ts";

afterEach(() => vi.unstubAllGlobals());

describe("HTTP failure boundary", () => {
  it("turns a network failure into a recoverable error without leaking transport details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private transport detail")));
    await expect(request("/api/auth/session")).rejects.toMatchObject({
      name: "Error",
      status: 0,
      message: "Cannot reach Vortoj. Check your connection and try again.",
    });
  });

  it("rejects unreadable JSON even when HTTP succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>oops</html>")));
    await expect(request("/api/auth/session")).rejects.toMatchObject({
      status: 200,
      message: "Could not read the response. Refresh and try again.",
    });
  });

  it.each([
    [{ error: "Try again later" }, "Try again later"],
    [{ error: { private: "details" } }, "Could not complete the request"],
    [null, "Could not complete the request"],
  ])("preserves HTTP status and only exposes string error messages (%j)", async (body, message) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body, { status: 429 })));
    const result = request("/api/auth/code", { email: "a@example.test" });
    await expect(result).rejects.toBeInstanceOf(RequestError);
    await expect(result).rejects.toMatchObject({ status: 429, message });
  });

  it("forwards cancellation to fetch and never resolves an aborted request as success", async () => {
    const controller = new AbortController();

    const fetch = vi.fn<(path: string, options: RequestInit) => Promise<Response>>(
      (_path: string, options: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          options.signal!.addEventListener("abort", () => reject(options.signal!.reason), {
            once: true,
          });
        }),
    );

    vi.stubGlobal("fetch", fetch);
    const result = request("/api/auth/session", undefined, "GET", controller.signal);
    const failed = result.catch((error: unknown) => error);
    expect(fetch.mock.calls[0]![1].signal).toBe(controller.signal);
    controller.abort();
    expect(await failed).toMatchObject({ status: 0 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
