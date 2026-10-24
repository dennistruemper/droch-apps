import {
  draw,
  emptyMemory,
  validOptions,
  type Mode,
  type Memory,
  type ConcreteMode,
} from "../domain/index.ts";
export type Row = { id: number; value: string };
type Phase =
  | { kind: "idle" }
  | { kind: "sampling"; requestId: number }
  | { kind: "loading"; requestId: number; value: string; mode: ConcreteMode }
  | { kind: "result"; value: string; mode: ConcreteMode };
export type Model = {
  rows: Row[];
  nextRowId: number;
  mode: Mode;
  memory: Memory;
  phase: Phase;
  requestId: number;
  error: string | null;
};
export type Message =
  | { kind: "add" }
  | { kind: "remove"; id: number }
  | { kind: "edit"; id: number; value: string }
  | { kind: "mode"; mode: Mode }
  | { kind: "generate" }
  | { kind: "sampled"; requestId: number; random: number; modeRandom: number; delayRandom: number }
  | { kind: "complete"; requestId: number }
  | { kind: "failed"; requestId: number }
  | { kind: "clear" };
export type Command =
  | { kind: "sample"; requestId: number }
  | { kind: "wait"; requestId: number; milliseconds: number };
export function init(): Model {
  return {
    rows: [
      { id: 0, value: "" },
      { id: 1, value: "" },
    ],
    nextRowId: 2,
    mode: "schlezaz",
    memory: emptyMemory(),
    phase: { kind: "idle" },
    requestId: 0,
    error: null,
  };
}
export const busy = (model: Model) =>
  model.phase.kind === "sampling" || model.phase.kind === "loading";
export function update(model: Model, message: Message): { model: Model; commands: Command[] } {
  const stay = { model, commands: [] };
  const changed = (next: Model) => ({ model: next, commands: [] });
  switch (message.kind) {
    case "sampled": {
      if (model.phase.kind !== "sampling" || model.phase.requestId !== message.requestId)
        return stay;
      if (
        !Number.isFinite(message.delayRandom) ||
        message.delayRandom < 0 ||
        message.delayRandom >= 1
      )
        return changed({
          ...model,
          phase: { kind: "idle" },
          error: "Der Zufall streikt. Bitte erneut versuchen.",
        });
      const result = draw(
        model.rows.map((row) => row.value),
        model.mode,
        model.memory,
        message.random,
        message.modeRandom,
      );
      return {
        model: {
          ...model,
          memory: result.memory,
          phase: {
            kind: "loading",
            requestId: message.requestId,
            value: result.value,
            mode: result.mode,
          },
        },
        commands: [
          {
            kind: "wait",
            requestId: message.requestId,
            milliseconds: 2000 + message.delayRandom * 8000,
          },
        ],
      };
    }
    case "complete":
      if (model.phase.kind !== "loading" || model.phase.requestId !== message.requestId)
        return stay;
      return changed({
        ...model,
        phase: { kind: "result", value: model.phase.value, mode: model.phase.mode },
      });
    case "failed":
      if (!busy(model) || model.requestId !== message.requestId) return stay;
      return changed({
        ...model,
        phase: { kind: "idle" },
        error: "Der Zufall streikt. Bitte erneut versuchen.",
      });
    case "generate": {
      if (busy(model) || validOptions(model.rows.map((row) => row.value)).length < 2) return stay;
      const requestId = model.requestId + 1;
      return {
        model: { ...model, requestId, phase: { kind: "sampling", requestId }, error: null },
        commands: [{ kind: "sample", requestId }],
      };
    }
    default: {
      if (busy(model)) return stay;
      if (message.kind === "clear") return changed({ ...model, phase: { kind: "idle" } });
      const reset = {
        ...model,
        memory: emptyMemory(),
        phase: { kind: "idle" } as const,
        error: null,
      };
      switch (message.kind) {
        case "mode":
          return changed({ ...reset, mode: message.mode });
        case "add":
          return changed({
            ...reset,
            rows: [...model.rows, { id: model.nextRowId, value: "" }],
            nextRowId: model.nextRowId + 1,
          });
        case "remove":
          return model.rows.length <= 2
            ? stay
            : changed({ ...reset, rows: model.rows.filter((row) => row.id !== message.id) });
        case "edit":
          return changed({
            ...reset,
            rows: model.rows.map((row) =>
              row.id === message.id ? { ...row, value: message.value } : row,
            ),
          });
      }
    }
  }
}
