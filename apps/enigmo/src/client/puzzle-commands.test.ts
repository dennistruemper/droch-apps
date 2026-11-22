import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyProgress, findPuzzle } from "../domain/index.ts";
import { execute, load } from "./puzzle-commands.ts";

const puzzle = findPuzzle("ymir")!;

afterEach(() => vi.unstubAllGlobals());

describe("puzzle storage failure recovery", () => {
  it("starts with empty progress when storage access is blocked", () => {
    vi.stubGlobal("window", {
      get localStorage() {
        throw new Error("Blocked");
      },
    });
    expect(load(puzzle)).toEqual(emptyProgress());
    expect(execute({ kind: "save", puzzle, progress: emptyProgress() })).toEqual({
      kind: "storage-failed",
    });
  });

  it.each(["{broken", JSON.stringify({ answers: "invalid" }), "x".repeat(20_001)])(
    "recovers from malformed, invalid or oversized stored progress (case %#)",
    (raw) => {
      vi.stubGlobal("window", { localStorage: { getItem: () => raw } });
      expect(load(puzzle)).toEqual(emptyProgress());
    },
  );

  it("reports quota failure without claiming progress was saved", () => {
    vi.stubGlobal("window", {
      localStorage: {
        setItem: () => {
          throw new Error("Quota exceeded");
        },
      },
    });
    expect(execute({ kind: "save", puzzle, progress: emptyProgress() })).toEqual({
      kind: "storage-failed",
    });
  });
});
