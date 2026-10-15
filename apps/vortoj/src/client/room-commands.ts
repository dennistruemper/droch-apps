import { snapshotSchema, roomInfoSchema } from "../contracts/index.ts";
import { api, RequestError } from "./api.ts";
import type { Request, Message } from "./room-model.ts";
/** HTTP, randomness and runtime parsing stay outside the pure update function. */
export async function execute(
  command: Request,
  roomId: string,
  signal: AbortSignal,
): Promise<Message> {
  const path = `/rooms/${roomId}`;
  switch (command.kind) {
    case "load":
      try {
        return {
          kind: "loaded",
          id: command.id,
          room: snapshotSchema.parse(await api(path, undefined, "GET", signal)),
        };
      } catch (error) {
        if (!(error instanceof RequestError) || error.status !== 403) throw error;
        return {
          kind: "invite-loaded",
          id: command.id,
          info: roomInfoSchema.parse(await api(`${path}/info`, undefined, "GET", signal)),
        };
      }
    case "join":
      return {
        kind: "loaded",
        id: command.id,
        room: snapshotSchema.parse(await api(`${path}/join`, {}, "POST", signal)),
      };
    case "action":
      return {
        kind: "loaded",
        id: command.id,
        room: snapshotSchema.parse(
          await api(
            `${path}/command`,
            { ...command.action, version: command.version, commandId: crypto.randomUUID() },
            "POST",
            signal,
          ),
        ),
      };
  }
}
