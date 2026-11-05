import { describe, expect, it } from "vitest";
import {
  emptyProgress,
  findPuzzle,
  letters,
  normalize,
  parseProgress,
  puzzles,
  solved,
} from "../domain/index.ts";
import { init, update, type Model } from "./puzzle-model.ts";

const puzzle = findPuzzle("ymir")!;
const answers = Object.fromEntries(
  puzzle.questions.map((question) => [question.id, question.answer]),
);
function active(): Extract<Model, { kind: "puzzle" }> {
  const model = init(" ymIR ", () => emptyProgress());
  if (model.kind !== "puzzle") throw new Error("Expected puzzle");
  return model;
}
describe("Enigmo content and puzzle transitions", () => {
  it("keeps every authored puzzle consistent and contributes an actual scrambled anagram", () => {
    expect(new Set(puzzles.map((item) => item.code)).size).toBe(puzzles.length);
    for (const item of puzzles) {
      expect(item.code).toMatch(/^[A-Z0-9-]+$/);
      expect(new Set(item.questions.map((question) => question.id)).size).toBe(
        item.questions.length,
      );
      const correct = item.questions.map((question) => question.answer).join("");
      expect([...correct].sort()).toEqual([...normalize(item.solution)].sort());
      expect(correct).not.toBe(normalize(item.solution));
      for (const question of item.questions) {
        expect(new Set(question.options.map((option) => option.letter)).size).toBe(
          question.options.length,
        );
        expect(question.options.filter((option) => option.letter === question.answer)).toHaveLength(
          1,
        );
        for (const option of question.options) expect(option.letter).toMatch(/^[A-Z]$/);
      }
    }
  });
  it("keeps selected letters in question order with placeholders without grading individual choices", () => {
    const start = active();
    const later = update(start, { kind: "answer", id: "pokemon", letter: "P" });
    expect(later.model.kind === "puzzle" && letters(puzzle, later.model.progress).join("")).toBe(
      "____P____",
    );
    expect(later.model.kind === "puzzle" && later.model.feedback).toBe("none");
    expect(later.commands[0]?.kind).toBe("save");
    expect(update(later.model, { kind: "answer", id: "pokemon", letter: "?" }).model).toBe(
      later.model,
    );
    expect(update(later.model, { kind: "answer", id: "unknown", letter: "A" }).model).toBe(
      later.model,
    );
  });
  it("requires all correct answers as well as the final word; supports retrying and changing answers", () => {
    const start = active();
    expect(update(start, { kind: "check" }).model).toMatchObject({ feedback: "incomplete" });
    const complete = { ...start, progress: { answers, solution: " gAr nEr iNg " } };
    expect(update(complete, { kind: "check" }).model).toMatchObject({ feedback: "solved" });
    const edited = update(
      { ...complete, feedback: "solved" },
      { kind: "answer", id: "trek", letter: "K" },
    );
    expect(edited.model).toMatchObject({ feedback: "none" });
    expect(update(edited.model, { kind: "check" }).model).toMatchObject({ feedback: "incorrect" });
    const wrongWord = { ...complete, progress: { answers, solution: "gathering" } };
    expect(solved(puzzle, wrongWord.progress)).toBe(false);
    expect(update(wrongWord, { kind: "check" }).model).toMatchObject({ feedback: "incorrect" });
  });
  it("validates persisted progress and never restores forged completion or stale question options", () => {
    expect(parseProgress({ answers: [], solution: true }, puzzle)).toEqual(emptyProgress());
    expect(parseProgress({ answers: { trek: "?" }, solution: "GARNERING" }, puzzle)).toEqual(
      emptyProgress(),
    );
    expect(
      parseProgress(
        { answers: { trek: "G", pokemon: "X", removed: "R" }, solution: "gar" },
        puzzle,
      ),
    ).toEqual({ answers: { trek: "G" }, solution: "gar" });
    expect(init("YMIR", () => ({ answers: {}, solution: "GARNERING" }))).toMatchObject({
      feedback: "none",
    });
    expect(init("YMIR", () => ({ answers, solution: "GARNERING" }))).toMatchObject({
      feedback: "solved",
    });
    expect(init("missing", () => emptyProgress())).toEqual({ kind: "missing" });
    expect(init(null, () => emptyProgress())).toEqual({ kind: "entry", code: "" });
  });
  it("keeps all selections when browser storage fails", () => {
    const model = { ...active(), progress: { answers, solution: "gar" } };
    const failed = update(model, { kind: "storage-failed" });
    expect(failed.model).toMatchObject({ progress: model.progress, storageFailed: true });
    expect(failed.commands).toEqual([]);
  });
});
