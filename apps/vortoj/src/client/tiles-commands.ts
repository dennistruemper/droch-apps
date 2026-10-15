import { savedTileSetSchema } from "../contracts/index.ts";
import { api } from "./api.ts";
import type { Command, Message } from "./tiles-model.ts";
export async function execute(
  command: Command,
  signal: AbortSignal,
  saved: () => Promise<void>,
): Promise<Message> {
  const requestId = command.requestId;
  switch (command.kind) {
    case "save": {
      const set = savedTileSetSchema.parse(
        await api(
          command.setId ? `/tile-sets/${command.setId}` : "/tile-sets",
          command.value,
          "POST",
          signal,
        ),
      );
      return { kind: "saved", requestId, set };
    }
    case "reload":
      await saved();
      return { kind: "reloaded", requestId };
    case "remove":
      if (
        !confirm(
          `Remove ${command.set.name} from your collection? Existing games keep their tiles.`,
        )
      )
        return { kind: "cancelled", requestId };
      await api(`/tile-sets/${command.set.id}`, undefined, "DELETE", signal);
      return { kind: "removed", requestId };
  }
}
