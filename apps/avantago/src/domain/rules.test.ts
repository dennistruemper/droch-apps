import { describe, expect, it } from "vitest";
import { emptyDraft, handicap, pairing, rating, savedSchema, schedule } from "./index.ts";

describe("Kreispokal Vorgabe", () => {
  it("honours both edges of every band in both directions, with a cap of eight", () => {
    const bands = [
      [0, 50],
      [51, 150],
      [151, 250],
      [251, 350],
      [351, 450],
      [451, 550],
      [551, 650],
      [651, 750],
      [751, 10000],
    ];

    for (const [points, edges] of bands.entries())
      for (const difference of edges) {
        expect(handicap(0, difference!)).toEqual([points, 0]);
        expect(handicap(difference!, 0)).toEqual([0, points]);
      }
  });
  it("keeps the supplied ten-game order", () => {
    expect(schedule).toEqual([
      [0, 3],
      [1, 4],
      [2, 5],
      "double",
      [1, 3],
      [0, 5],
      [2, 4],
      [1, 5],
      [2, 3],
      [0, 4],
    ]);
  });
  it("uses only selected doubles players, taking each side's maximum rather than average", () => {
    const draft = emptyDraft();
    draft.players.forEach((p, i) => {
      p.rating = String([900, 1400, 2500, 1100, 1200, 2600][i]);
      p.name = `Player ${i}`;
    });
    draft.doubles = ["01", "01"];
    expect(pairing(draft, 3)).toMatchObject({
      kind: "ready",
      ratings: [1400, 1200],
      start: [0, 2],
      names: ["Player 0 / Player 1", "Player 3 / Player 4"],
    });
    draft.doubles = ["02", "12"];
    expect(pairing(draft, 3)).toMatchObject({
      kind: "ready",
      ratings: [2500, 2600],
      start: [1, 0],
    });
  });
  it("calculates independent singles while doubles or other ratings are missing", () => {
    const draft = emptyDraft();
    draft.players[0]!.rating = "1500";
    draft.players[3]!.rating = "1250";
    expect(pairing(draft, 0)).toMatchObject({ kind: "ready", start: [0, 2] });
    expect(pairing(draft, 1)?.kind).toBe("pending");
    expect(pairing(draft, 3)?.kind).toBe("pending");
    draft.doubles = ["01", "01"];
    expect(pairing(draft, 3)?.kind).toBe("pending");
    draft.players[0]!.rating = "";
    expect(pairing(draft, 0)?.kind).toBe("pending");
  });
  it("does not coerce blank, fractional, signed or exponential input to a valid Live-PZ", () => {
    for (const value of ["", " ", "1.5", "-1", "1e3", "10001", "abc", "Infinity"])
      expect(rating(value)).toBeNull();
    expect(rating("0")).toBe(0);
    expect(rating("10000")).toBe(10000);
  });
  it("validates persisted structure while allowing unfinished input", () => {
    const save = { version: 1, draft: emptyDraft() };
    expect(savedSchema.safeParse(save).success).toBe(true);
    expect(savedSchema.safeParse({ ...save, version: 2 }).success).toBe(false);
    expect(savedSchema.safeParse({ ...save, draft: { ...save.draft, players: [] } }).success).toBe(
      false,
    );
    expect(
      savedSchema.safeParse({ ...save, draft: { ...save.draft, doubles: ["00", "01"] } }).success,
    ).toBe(false);
  });
});
