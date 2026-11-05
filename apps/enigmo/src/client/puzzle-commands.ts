import { createAppStorage } from "@repo/shared/storage";
import { emptyProgress, parseProgress, type Puzzle } from "../domain/index.ts";
import type { Command, Message } from "./puzzle-model.ts";

const key = (puzzle: Puzzle) => `${puzzle.code}:v${puzzle.revision}`;
export function load(puzzle: Puzzle) {
  try {
    const raw = createAppStorage("enigmo", window.localStorage).get(key(puzzle));
    return raw && raw.length <= 20_000 ? parseProgress(JSON.parse(raw), puzzle) : emptyProgress();
  } catch {
    return emptyProgress();
  }
}
export function execute(command: Command): Message | undefined {
  if (command.kind === "navigate") {
    window.location.assign(`/enigmo/?code=${encodeURIComponent(command.code)}`);
    return;
  }
  try {
    createAppStorage("enigmo", window.localStorage).set(
      key(command.puzzle),
      JSON.stringify(command.progress),
    );
  } catch {
    return { kind: "storage-failed" };
  }
}
