import { describe, expect, it } from "vitest";
import { init, update, type Model } from "./generator-model.ts";
function ready(): Model {
  let model = update(init(), { kind: "edit", id: 0, value: "Pizza" }).model;
  return update(model, { kind: "edit", id: 1, value: "Pasta" }).model;
}
describe("generator transitions", () => {
  it("requires two values and guards synchronous double submission and pending edits", () => {
    expect(update(init(), { kind: "generate" }).commands).toEqual([]);
    const started = update(ready(), { kind: "generate" });
    expect(started.commands).toHaveLength(1);
    expect(update(started.model, { kind: "generate" }).commands).toEqual([]);
    expect(update(started.model, { kind: "mode", mode: "standard" }).model).toBe(started.model);
    expect(update(started.model, { kind: "edit", id: 0, value: "Changed" }).model).toBe(
      started.model,
    );
  });
  it("reveals only after its own timer and ignores old completions", () => {
    const started = update(ready(), { kind: "generate" }).model;
    const sampled = update(started, {
      kind: "sampled",
      requestId: 1,
      random: 0,
      modeRandom: 0,
      delayRandom: 0.5,
    });
    expect(sampled.commands).toEqual([{ kind: "wait", requestId: 1, milliseconds: 6000 }]);
    expect(sampled.model.phase.kind).toBe("loading");
    expect(update(sampled.model, { kind: "complete", requestId: 0 }).model).toBe(sampled.model);
    const done = update(sampled.model, { kind: "complete", requestId: 1 }).model;
    expect(done.phase).toEqual({ kind: "result", value: "Pizza", mode: "schlezaz" });
    const next = update(done, { kind: "generate" }).model;
    expect(
      update(next, { kind: "sampled", requestId: 1, random: 0.9, modeRandom: 0, delayRandom: 0 })
        .model,
    ).toBe(next);
    expect(update(next, { kind: "failed", requestId: 1 }).model).toBe(next);
    const failed = update(next, { kind: "failed", requestId: 2 }).model;
    expect(failed.error).toBeTruthy();
    expect(update(failed, { kind: "generate" }).commands).toHaveLength(1);
  });
  it("resets sequence memory on input changes and preserves stable row identity", () => {
    const model = { ...ready(), memory: { repeat: "removed", unused: ["removed"] } };
    const added = update(model, { kind: "add" }).model;
    expect(added.memory).toEqual({ repeat: null, unused: [] });
    const edited = update(added, { kind: "edit", id: 2, value: "Soup" }).model;
    expect(edited.rows.map((row) => row.id)).toEqual([0, 1, 2]);
    const removed = update(edited, { kind: "remove", id: 0 }).model;
    expect(removed.rows).toEqual([
      { id: 1, value: "Pasta" },
      { id: 2, value: "Soup" },
    ]);
    expect(update(removed, { kind: "remove", id: 1 }).model).toBe(removed);
  });
});
