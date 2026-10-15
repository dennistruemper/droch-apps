import { describe, expect, it } from "vitest";
import { init, update, type Model, type SavedSet } from "./tiles-model.ts";
const a: SavedSet = { id: "a", name: "Set A", tiles: [{ letter: "A", count: 28, points: 1 }] };
const b: SavedSet = { id: "b", name: "Set B", tiles: [{ letter: "B", count: 28, points: 2 }] };
function editing(set = a): Model {
  return update(init(), { kind: "edit", set, copy: false, rowIds: ["row"] }).model;
}
describe("tile editor transitions", () => {
  it("freezes save identity and draft, rejects duplicate submissions and late responses", () => {
    const draft = editing();
    const save = update(draft, { kind: "save" });
    expect(save.commands).toEqual([
      { kind: "save", requestId: 1, setId: "a", value: { name: "Set A", tiles: a.tiles } },
    ]);
    for (const event of [
      { kind: "edit", set: b, copy: false, rowIds: ["b-row"] },
      { kind: "save" },
      { kind: "row-changed", id: "row", field: "letter", value: "B" },
      { kind: "new" },
    ] as const)
      expect(update(save.model, event).model).toBe(save.model);
    expect(update(save.model, { kind: "saved", requestId: 99, set: b }).model).toBe(save.model);
    const saved = update(save.model, { kind: "saved", requestId: 1, set: a }).model;
    const finished = update(saved, { kind: "reloaded", requestId: 1 }).model;
    const next = update(finished, { kind: "edit", set: b, copy: false, rowIds: ["b-row"] }).model;
    expect(update(next, { kind: "failed", requestId: 1, error: "Late failure" }).model).toBe(next);
    expect(update(next, { kind: "save" }).commands[0]).toMatchObject({
      setId: "b",
      value: { tiles: b.tiles },
    });
    expect(draft.pending).toBeNull();
  });
  it("keeps an unrelated edited set when deleting and permits retry after failure", () => {
    const remove = update(editing(), { kind: "remove", set: b });
    expect(update(remove.model, { kind: "removed", requestId: 1 }).model.setId).toBe("a");
    const failed = update(remove.model, { kind: "failed", requestId: 1, error: "Offline" }).model;
    expect(failed.rows).toEqual(editing().rows);
    expect(failed.pending).toBeNull();
    const retry = update(failed, { kind: "remove", set: a });
    expect(update(retry.model, { kind: "removed", requestId: 2 }).model.setId).toBeUndefined();
  });
  it("retains editable incomplete input and validates before starting I/O", () => {
    const emptyQuantity = update(editing(), {
      kind: "row-changed",
      id: "row",
      field: "count",
      value: "",
    }).model;
    expect(emptyQuantity.rows[0]?.count).toBe("");
    expect(update(emptyQuantity, { kind: "save" }).commands).toEqual([]);
    const valid = update(emptyQuantity, {
      kind: "row-changed",
      id: "row",
      field: "count",
      value: "28",
    }).model;
    const lowercase = update(valid, {
      kind: "row-changed",
      id: "row",
      field: "letter",
      value: "a",
    }).model;
    expect(update(lowercase, { kind: "save" }).commands[0]).toMatchObject({
      value: { tiles: a.tiles },
    });
    expect(valid.rows[0]?.letter).toBe("A");
  });
  it("retains a newly saved identity if refreshing the collection fails", () => {
    const copy = update(editing(), { kind: "edit", set: a, copy: true, rowIds: ["copy"] }).model;
    const saving = update(copy, { kind: "save" }).model;
    const persisted = update(saving, { kind: "saved", requestId: 1, set: { ...a, id: "new-id" } });
    expect(persisted.commands[0]?.kind).toBe("reload");
    const failed = update(persisted.model, {
      kind: "failed",
      requestId: 1,
      error: "Collection unavailable",
    }).model;
    expect(update(failed, { kind: "save" }).commands[0]).toMatchObject({ setId: "new-id" });
  });
  it("copies presets as new sets and cancelled deletion preserves the draft", () => {
    const copy = update(editing(), { kind: "edit", set: a, copy: true, rowIds: ["copy"] }).model;
    expect(copy.setId).toBeUndefined();
    expect(copy.name).toBe("Set A copy");
    const removal = update(copy, { kind: "remove", set: b });
    const cancelled = update(removal.model, { kind: "cancelled", requestId: 1 }).model;
    expect(cancelled.rows).toBe(copy.rows);
    expect(cancelled.pending).toBeNull();
  });
});
