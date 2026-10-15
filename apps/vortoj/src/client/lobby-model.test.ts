import { describe, expect, it } from "vitest";
import { init, update, type Collection } from "./lobby-model.ts";
const data: Collection = {
  rooms: [],
  sets: [{ id: "english", name: "English", tiles: [{ letter: "A", count: 28, points: 1 }] }],
};
function ready() {
  return update(update(init(), { kind: "refresh" }).model, { kind: "loaded", id: 1, data }).model;
}
describe("lobby transitions", () => {
  it("ignores stale loads and preserves existing collection on refresh failure", () => {
    const first = update(ready(), { kind: "refresh" }).model;
    const newer = update(first, { kind: "refresh" }).model;
    expect(update(newer, { kind: "loaded", id: 2, data: { rooms: [], sets: [] } }).model).toBe(
      newer,
    );
    const failed = update(newer, { kind: "failed", id: 3, error: "Offline" }).model;
    expect(failed.collection).toEqual({ kind: "failed", error: "Offline", data });
    const retry = update(failed, { kind: "refresh" });
    expect(retry.commands).toEqual([{ kind: "load", id: 4 }]);
    expect(update(retry.model, { kind: "loaded", id: 4, data }).model.collection).toEqual({
      kind: "idle",
      data,
    });
  });
  it("emits one create request and one navigation despite duplicate submissions and responses", () => {
    const event = { kind: "create" as const, title: " Sunday ", tileSetId: "english" };
    const pending = update(ready(), event);
    expect(pending.commands).toEqual([
      { kind: "create", id: 2, title: "Sunday", tileSetId: "english" },
    ]);
    expect(update(pending.model, event).model).toBe(pending.model);
    expect(update(pending.model, { kind: "created", id: 1, roomId: "wrong" }).model).toBe(
      pending.model,
    );
    const created = update(pending.model, { kind: "created", id: 2, roomId: "room" });
    expect(created.commands).toEqual([{ kind: "navigate", roomId: "room" }]);
    expect(update(created.model, event).commands).toEqual([]);
    expect(update(created.model, { kind: "created", id: 2, roomId: "room" }).commands).toEqual([]);
  });
  it("allows creation retry after a failure and keeps loading errors separate", () => {
    const pending = update(ready(), {
      kind: "create",
      title: "Sunday",
      tileSetId: "english",
    }).model;
    const refreshing = update(pending, { kind: "refresh" }).model;
    const loadFailed = update(refreshing, {
      kind: "failed",
      id: 3,
      error: "Collection offline",
    }).model;
    expect(loadFailed.creating).toBe(pending.creating);
    const failed = update(loadFailed, { kind: "failed", id: 2, error: "Create failed" }).model;
    expect(failed.collection).toBe(loadFailed.collection);
    expect(
      update(failed, { kind: "create", title: "Sunday", tileSetId: "english" }).commands[0],
    ).toMatchObject({ kind: "create", id: 4 });
  });
  it("rejects unavailable sets and invalid names without making requests", () => {
    expect(update(ready(), { kind: "create", title: "", tileSetId: "english" }).commands).toEqual(
      [],
    );
    expect(
      update(ready(), { kind: "create", title: "Sunday", tileSetId: "missing" }).commands,
    ).toEqual([]);
    expect(
      update(init(), { kind: "create", title: "Sunday", tileSetId: "english" }).commands,
    ).toEqual([]);
  });
});
