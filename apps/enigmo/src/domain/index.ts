import { z } from "zod";
import { puzzles } from "./puzzles.ts";

export type Puzzle = {
  readonly code: string;
  readonly revision: number;
  readonly title: string;
  readonly introduction: string;
  readonly finalTask: string;
  readonly solution: string;
  readonly treasure: string;
  readonly questions: readonly {
    readonly id: string;
    readonly topic: string;
    readonly text: string;
    readonly options: readonly { readonly letter: string; readonly text: string }[];
    readonly answer: string;
  }[];
};
export { puzzles };
export const normalize = (value: string) => value.toUpperCase().replace(/\s/gu, "");
export const normalizeCode = (value: string) => value.trim().toUpperCase();
export function findPuzzle(code: string): Puzzle | undefined {
  return puzzles.find((puzzle) => puzzle.code === normalizeCode(code));
}
export type Progress = { answers: Record<string, string>; solution: string };
export const emptyProgress = (): Progress => ({ answers: {}, solution: "" });
const progressSchema = z.object({
  answers: z
    .record(z.string().max(100), z.string().regex(/^[A-Z]$/))
    .refine((value) => Object.keys(value).length <= 100),
  solution: z.string().max(100),
});
export function parseProgress(value: unknown, puzzle: Puzzle): Progress {
  const parsed = progressSchema.safeParse(value);
  if (!parsed.success) return emptyProgress();
  const answers: Record<string, string> = {};
  for (const question of puzzle.questions) {
    const letter = parsed.data.answers[question.id];
    if (question.options.some((option) => option.letter === letter)) answers[question.id] = letter!;
  }
  return { answers, solution: parsed.data.solution };
}
export function letters(puzzle: Puzzle, progress: Progress): string[] {
  return puzzle.questions.map((question) => progress.answers[question.id] ?? "_");
}
export function solved(puzzle: Puzzle, progress: Progress): boolean {
  return (
    puzzle.questions.every((question) => progress.answers[question.id] === question.answer) &&
    normalize(progress.solution) === normalize(puzzle.solution)
  );
}
