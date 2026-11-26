import { describe, expect, it } from "vitest";
import { emptyDraft } from "../domain/index.ts";
import { init, update } from "./calculator-model.ts";

describe("calculator transitions", () => {
  const ready = () =>
    update(init().model, { kind: "loaded", draft: emptyDraft(), warning: "" }).model;

  it("preserves sequential input changes before the view flushes and ignores late restore", () => {
    let model = ready();
    model = update(model, { kind: "edit-player", index: 0, field: "name", value: "Ada" }).model;
    model = update(model, { kind: "edit-player", index: 3, field: "rating", value: "1250" }).model;
    model = update(model, { kind: "loaded", draft: emptyDraft(), warning: "" }).model;
    expect(model.screen).toMatchObject({
      kind: "editing",
      draft: { players: [{ name: "Ada" }, {}, {}, { rating: "1250" }, {}, {}] },
    });
  });
  it("describes confirmation without clearing input, then saves only the confirmed reset", () => {
    const model = update(ready(), {
      kind: "edit-player",
      index: 0,
      field: "name",
      value: "Anna",
    }).model;

    const requested = update(model, { kind: "reset" });
    expect(requested.model).toBe(model);
    expect(requested.commands).toEqual([{ kind: "confirm-reset" }]);
    const reset = update(model, { kind: "reset-confirmed" });
    expect(reset.commands).toEqual([{ kind: "save", draft: emptyDraft() }]);
  });
  it("retains editable input when persistence fails and handles cleared double selection", () => {
    let model = update(ready(), { kind: "doubles", side: 0, value: "01" }).model;
    model = update(model, { kind: "storage-failed" }).model;
    expect(model.screen).toMatchObject({ draft: { doubles: ["01", null] } });
    expect(model.warning).toContain("Speichern");
    model = update(model, { kind: "doubles", side: 0, value: "" }).model;
    expect(model.screen).toMatchObject({ draft: { doubles: [null, null] } });
  });
});
