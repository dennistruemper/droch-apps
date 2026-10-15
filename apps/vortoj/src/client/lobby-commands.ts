import { snapshotSchema, roomListSchema, savedTileSetSchema } from "../contracts/index.ts";
import { api } from "./api.ts";
import type { Command, Message } from "./lobby-model.ts";
export async function execute(
  command: Exclude<Command, { kind: "navigate" }>,
  signal: AbortSignal,
): Promise<Message> {
  switch (command.kind) {
    case "load": {
      const [sets, rooms] = await Promise.all([
        api("/tile-sets", undefined, "GET", signal),
        api("/rooms", undefined, "GET", signal),
      ]);
      return {
        kind: "loaded",
        id: command.id,
        data: { sets: savedTileSetSchema.array().parse(sets), rooms: roomListSchema.parse(rooms) },
      };
    }
    case "create": {
      const room = snapshotSchema.parse(
        await api("/rooms", { title: command.title, tileSetId: command.tileSetId }, "POST", signal),
      );
      return { kind: "created", id: command.id, roomId: room.id };
    }
  }
}
