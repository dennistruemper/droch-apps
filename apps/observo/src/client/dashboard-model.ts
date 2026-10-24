import type { Dashboard } from "../contracts/index.ts";

type Request =
  | { kind: "idle" }
  | { kind: "loading"; id: number }
  | { kind: "failed"; error: string };
export type Model = {
  data: Dashboard | null;
  request: Request;
  nextId: number;
  now: number;
  selected: { siteId: string; hour: number } | null;
};
export type Message =
  | { kind: "refresh" }
  | { kind: "clock"; now: number }
  | { kind: "loaded"; id: number; data: Dashboard }
  | { kind: "failed"; id: number; error: string }
  | { kind: "select"; siteId: string; hour: number };
export type Command = { kind: "activate" | "load"; id: number };
export const init = (): Model => ({
  data: null,
  request: { kind: "idle" },
  nextId: 1,
  now: 0,
  selected: null,
});
export function update(model: Model, message: Message): { model: Model; commands: Command[] } {
  const unchanged = { model, commands: [] };
  switch (message.kind) {
    case "refresh":
      if (model.request.kind === "loading") return unchanged;
      return {
        model: {
          ...model,
          request: { kind: "loading", id: model.nextId },
          nextId: model.nextId + 1,
        },
        commands: [{ kind: model.data === null ? "activate" : "load", id: model.nextId }],
      };
    case "loaded":
      if (model.request.kind !== "loading" || model.request.id !== message.id) return unchanged;
      return {
        model: {
          ...model,
          data:
            model.data && message.data.generatedAt < model.data.generatedAt
              ? model.data
              : message.data,
          now: Math.max(model.now, message.data.generatedAt),
          request: { kind: "idle" },
        },
        commands: [],
      };
    case "failed":
      if (model.request.kind !== "loading" || model.request.id !== message.id) return unchanged;
      return {
        model: { ...model, request: { kind: "failed", error: message.error } },
        commands: [],
      };
    case "clock":
      return { model: { ...model, now: Math.max(model.now, message.now) }, commands: [] };
    case "select":
      return {
        model: { ...model, selected: { siteId: message.siteId, hour: message.hour } },
        commands: [],
      };
  }
}
