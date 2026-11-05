import { findPuzzle, letters, solved, type Progress, type Puzzle } from "../domain/index.ts";

type Feedback = "none" | "incomplete" | "incorrect" | "solved";
export type Model =
  | { kind: "entry"; code: string }
  | { kind: "missing" }
  | {
      kind: "puzzle";
      puzzle: Puzzle;
      progress: Progress;
      feedback: Feedback;
      storageFailed: boolean;
    };
export type Message =
  | { kind: "code"; value: string }
  | { kind: "open" }
  | { kind: "answer"; id: string; letter: string }
  | { kind: "solution"; value: string }
  | { kind: "check" }
  | { kind: "storage-failed" };
export type Command =
  | { kind: "navigate"; code: string }
  | { kind: "save"; puzzle: Puzzle; progress: Progress };
export function init(code: string | null, load: (puzzle: Puzzle) => Progress): Model {
  if (code === null) return { kind: "entry", code: "" };
  const puzzle = findPuzzle(code);
  if (!puzzle) return { kind: "missing" };
  const progress = load(puzzle);
  return {
    kind: "puzzle",
    puzzle,
    progress,
    feedback: solved(puzzle, progress) ? "solved" : "none",
    storageFailed: false,
  };
}
export function update(model: Model, message: Message): { model: Model; commands: Command[] } {
  const stay = { model, commands: [] };
  if (model.kind === "entry") {
    if (message.kind === "code")
      return { model: { ...model, code: message.value.slice(0, 100) }, commands: [] };
    if (message.kind === "open" && model.code.trim())
      return { model, commands: [{ kind: "navigate", code: model.code.trim().toUpperCase() }] };
    return stay;
  }
  if (model.kind !== "puzzle") return stay;
  if (message.kind === "storage-failed")
    return { model: { ...model, storageFailed: true }, commands: [] };
  if (message.kind === "check") {
    const complete = !letters(model.puzzle, model.progress).includes("_");
    return {
      model: {
        ...model,
        feedback: !complete
          ? "incomplete"
          : solved(model.puzzle, model.progress)
            ? "solved"
            : "incorrect",
      },
      commands: [],
    };
  }
  let progress: Progress;
  if (message.kind === "answer") {
    const question = model.puzzle.questions.find((item) => item.id === message.id);
    if (!question?.options.some((option) => option.letter === message.letter)) return stay;
    progress = {
      ...model.progress,
      answers: { ...model.progress.answers, [message.id]: message.letter },
    };
  } else if (message.kind === "solution") {
    progress = { ...model.progress, solution: message.value.slice(0, 100) };
  } else return stay;
  return {
    model: { ...model, progress, feedback: "none" },
    commands: [{ kind: "save", puzzle: model.puzzle, progress }],
  };
}
