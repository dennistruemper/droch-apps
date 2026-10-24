import { describe, expect, it } from "vitest";
import { draw, emptyMemory, type Memory } from "./index.ts";
const options = ["A", "B", "C", "D", "E"];
describe("SchleZaZ rules", () => {
  it("wraps the fourth option and ignores blank options", () => {
    expect(draw(options, "xkcd", emptyMemory(), 0, 0).value).toBe("D");
    expect(draw([" ", " A ", "B"], "xkcd", emptyMemory(), 0, 0).value).toBe("B");
    expect(draw(["A", "B", "C"], "xkcd", emptyMemory(), 0, 0).value).toBe("A");
    expect(() => draw(["A", " "], "xkcd", emptyMemory(), 0, 0)).toThrow();
  });
  it("repeats exactly twice, then draws a fresh pair", () => {
    let memory = emptyMemory();
    const results = [0, 0.9, 0.5, 0, 0.9, 0].map((random) => {
      const result = draw(options, "schlezaz", memory, random, 0);
      memory = result.memory;
      return result.value;
    });
    expect(results).toEqual(["A", "A", "C", "C", "E", "E"]);
  });
  it("exhausts unique shuffle values before refilling, including duplicate input", () => {
    let memory: Memory = emptyMemory();
    const results = Array.from({ length: 6 }, () => {
      const result = draw(["A", "A", "B", "C"], "shuffle", memory, 0, 0);
      memory = result.memory;
      return result.value;
    });
    expect(results).toEqual(["A", "B", "C", "A", "B", "C"]);
  });
  it("executes the selected random mode once and preserves its own memory", () => {
    const first = draw(options, "random", emptyMemory(), 0.99, 0.6);
    expect(first.mode).toBe("schlezaz");
    expect(first.value).toBe("E");
    const intervening = draw(options, "random", first.memory, 0, 0.3);
    expect(intervening.mode).toBe("standard");
    const repeated = draw(options, "random", intervening.memory, 0, 0.6);
    expect(repeated.value).toBe("E");
    expect(repeated.memory.repeat).toBeNull();
    expect(draw(options, "standard", emptyMemory(), 0.999999, 0).value).toBe("E");
  });
});
