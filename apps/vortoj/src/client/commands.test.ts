import { afterEach, describe, expect, it, vi } from "vitest";
import { execute as account } from "./account-commands.ts";
import { execute as lobby } from "./lobby-commands.ts";
import { execute as room } from "./room-commands.ts";
import { execute as tiles } from "./tiles-commands.ts";
import type { Command as AccountCommand } from "./account-model.ts";

const set = { id: "custom", name: "Custom", tiles: [{ letter: "A", count: 28, points: 1 }] };
const signal = () => new AbortController().signal;

afterEach(() => vi.unstubAllGlobals());

describe("account response validation", () => {
  it.each<AccountCommand>([
    { kind: "load-session", id: 8 },
    { kind: "send-code", id: 8, email: "a@example.test" },
    { kind: "verify", id: 8, email: "a@example.test", code: "9999", name: "A" },
  ])("rejects malformed successful responses for $kind", async (command) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ unexpected: true })));
    await expect(account(command, signal())).rejects.toMatchObject({ name: "ZodError" });
  });

  it("does not report verification success without a user", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ user: null })));
    await expect(
      account(
        { kind: "verify", id: 8, email: "a@example.test", code: "9999", name: "A" },
        signal(),
      ),
    ).rejects.toThrow("Could not sign you in");
  });

  it("does not report sign-out success when the server rejects it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ error: "Unavailable" }, { status: 503 })),
    );
    await expect(account({ kind: "sign-out", id: 8 }, signal())).rejects.toMatchObject({
      status: 503,
    });
  });
});

describe("lobby partial failures", () => {
  it.each(["/tile-sets", "/rooms"])(
    "rejects loading when %s fails, rather than publishing partial data",
    async (failedPath) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (path: string) =>
          path.endsWith(failedPath)
            ? Response.json({ error: "Unavailable" }, { status: 503 })
            : Response.json([]),
        ),
      );
      await expect(lobby({ kind: "load", id: 4 }, signal())).rejects.toMatchObject({ status: 503 });
    },
  );

  it.each(["/tile-sets", "/rooms"])(
    "rejects malformed collection data from %s",
    async (invalidPath) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (path: string) => Response.json(path.endsWith(invalidPath) ? [{}] : [])),
      );
      await expect(lobby({ kind: "load", id: 4 }, signal())).rejects.toMatchObject({
        name: "ZodError",
      });
    },
  );

  it("does not navigate using an ID from an invalid creation response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ id: "unvalidated" })));
    await expect(
      lobby({ kind: "create", id: 4, title: "Game", tileSetId: "custom" }, signal()),
    ).rejects.toMatchObject({ name: "ZodError" });
  });
});

describe("room invitation fallback", () => {
  it.each([401, 404, 500])("does not treat HTTP %s as an invitation", async (status) => {
    const fetch = vi
      .fn<(path: string) => Promise<Response>>()
      .mockResolvedValue(Response.json({ error: "Denied" }, { status }));

    vi.stubGlobal("fetch", fetch);
    await expect(room({ kind: "load", id: 3 }, "room", signal())).rejects.toMatchObject({ status });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not fetch invitation data to hide an invalid snapshot", async () => {
    const fetch = vi.fn<(path: string) => Promise<Response>>().mockResolvedValue(Response.json({}));
    vi.stubGlobal("fetch", fetch);
    await expect(room({ kind: "load", id: 3 }, "room", signal())).rejects.toMatchObject({
      name: "ZodError",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid invitation data after a membership denial", async () => {
    const fetch = vi
      .fn<(path: string) => Promise<Response>>()
      .mockResolvedValueOnce(Response.json({ error: "Not a member" }, { status: 403 }))
      .mockResolvedValueOnce(Response.json({}));

    vi.stubGlobal("fetch", fetch);
    await expect(room({ kind: "load", id: 3 }, "room", signal())).rejects.toMatchObject({
      name: "ZodError",
    });
    expect(fetch.mock.calls.map(([path]) => path)).toEqual([
      "/api/vortoj/rooms/room",
      "/api/vortoj/rooms/room/info",
    ]);
  });

  it("propagates a failed join instead of publishing a loaded room", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ error: "Room full" }, { status: 409 })),
    );
    await expect(room({ kind: "join", id: 3 }, "room", signal())).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe("tile collection failures", () => {
  it("does not accept a malformed saved set or refresh the collection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ id: "custom" })));
    const reload = vi.fn<() => Promise<void>>();
    await expect(
      tiles({ kind: "save", requestId: 2, setId: undefined, value: set }, signal(), reload),
    ).rejects.toMatchObject({ name: "ZodError" });
    expect(reload).not.toHaveBeenCalled();
  });

  it("preserves a collection refresh failure instead of reporting reloaded", async () => {
    const error = new Error("Refresh failed");
    await expect(
      tiles(
        { kind: "reload", requestId: 2, notice: "Saved" },
        signal(),
        vi.fn().mockRejectedValue(error),
      ),
    ).rejects.toBe(error);
  });

  it("never sends a delete after the user cancels", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));
    const fetch = vi.fn<(path: string) => Promise<Response>>();
    vi.stubGlobal("fetch", fetch);
    await expect(tiles({ kind: "remove", requestId: 2, set }, signal(), vi.fn())).resolves.toEqual({
      kind: "cancelled",
      requestId: 2,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not report removal or refresh after a rejected delete", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ error: "Unavailable" }, { status: 503 })),
    );
    const reload = vi.fn<() => Promise<void>>();
    await expect(
      tiles({ kind: "remove", requestId: 2, set }, signal(), reload),
    ).rejects.toMatchObject({ status: 503 });
    expect(reload).not.toHaveBeenCalled();
  });
});
