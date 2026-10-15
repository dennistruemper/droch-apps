import {
  createRoomSchema,
  type roomListSchema,
  type savedTileSetSchema,
} from "../contracts/index.ts";
import type { z } from "zod";
export type Collection = {
  rooms: z.infer<typeof roomListSchema>;
  sets: z.infer<typeof savedTileSetSchema>[];
};
export type Loading =
  | { kind: "idle"; data: Collection | null }
  | { kind: "loading"; id: number; data: Collection | null }
  | { kind: "failed"; error: string; data: Collection | null };
export type Creating =
  | { kind: "idle" }
  | { kind: "pending"; id: number }
  | { kind: "failed"; error: string }
  | { kind: "navigating"; roomId: string };
export type Model = { collection: Loading; creating: Creating; nextId: number };
export type Command =
  | { kind: "load"; id: number }
  | { kind: "create"; id: number; title: string; tileSetId: string }
  | { kind: "navigate"; roomId: string };
export type Message =
  | { kind: "refresh" }
  | { kind: "create"; title: string; tileSetId: string }
  | { kind: "loaded"; id: number; data: Collection }
  | { kind: "created"; id: number; roomId: string }
  | { kind: "failed"; id: number; error: string };
export type Transition = { model: Model; commands: Command[] };
export function init(): Model {
  return { collection: { kind: "idle", data: null }, creating: { kind: "idle" }, nextId: 1 };
}
export function update(model: Model, message: Message): Transition {
  const unchanged: Transition = { model, commands: [] };
  switch (message.kind) {
    case "refresh": {
      const command: Command = { kind: "load", id: model.nextId };
      return {
        model: {
          ...model,
          nextId: model.nextId + 1,
          collection: { kind: "loading", id: command.id, data: model.collection.data },
        },
        commands: [command],
      };
    }
    case "create": {
      if (model.creating.kind === "pending" || model.creating.kind === "navigating")
        return unchanged;
      const parsed = createRoomSchema.safeParse(message);
      if (!parsed.success)
        return {
          model: {
            ...model,
            creating: {
              kind: "failed",
              error: parsed.error.issues[0]?.message ?? "Check the room name and tile set.",
            },
          },
          commands: [],
        };
      if (!model.collection.data?.sets.some((set) => set.id === parsed.data.tileSetId))
        return {
          model: {
            ...model,
            creating: {
              kind: "failed",
              error: "Choose an available tile set, or refresh your collection.",
            },
          },
          commands: [],
        };
      const command: Command = { kind: "create", id: model.nextId, ...parsed.data };
      return {
        model: {
          ...model,
          nextId: model.nextId + 1,
          creating: { kind: "pending", id: command.id },
        },
        commands: [command],
      };
    }
    case "loaded":
      return model.collection.kind === "loading" && model.collection.id === message.id
        ? { model: { ...model, collection: { kind: "idle", data: message.data } }, commands: [] }
        : unchanged;
    case "created":
      return model.creating.kind === "pending" && model.creating.id === message.id
        ? {
            model: { ...model, creating: { kind: "navigating", roomId: message.roomId } },
            commands: [{ kind: "navigate", roomId: message.roomId }],
          }
        : unchanged;
    case "failed":
      if (model.collection.kind === "loading" && model.collection.id === message.id)
        return {
          model: {
            ...model,
            collection: { kind: "failed", error: message.error, data: model.collection.data },
          },
          commands: [],
        };
      return model.creating.kind === "pending" && model.creating.id === message.id
        ? { model: { ...model, creating: { kind: "failed", error: message.error } }, commands: [] }
        : unchanged;
  }
}
