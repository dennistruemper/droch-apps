import {
  letterSchema,
  type Snapshot,
  type Placement,
  type RoomInfo,
  type GameCommand,
} from "../contracts/index.ts";
export type Action = GameCommand extends infer C
  ? C extends GameCommand
    ? Omit<C, "version" | "commandId">
    : never
  : never;
export type Screen =
  | { kind: "loading" }
  | { kind: "invite"; info: RoomInfo }
  | { kind: "active"; room: Snapshot }
  | { kind: "expired" }
  | { kind: "removed" };
export type Move =
  | {
      kind: "placement";
      selected: string | null;
      draft: Placement[];
      joker: string;
      jokerError: string;
    }
  | { kind: "exchange"; tiles: string[] };
export type Request = { id: number } & (
  | { kind: "load" }
  | { kind: "join" }
  | { kind: "action"; action: Action; version: number }
);
export type Command =
  | Request
  | { kind: "subscribe" }
  | { kind: "close-stream" }
  | { kind: "close-dialogs" }
  | { kind: "overview" }
  | { kind: "approval"; version: number; action: "show" | "close" | "keep" }
  | { kind: "joker-dialog"; open: boolean };
export type Model = {
  screen: Screen;
  move: Move;
  pending: Request | null;
  loading: number | null;
  nextId: number;
  error: string;
  connection: string;
};
export type Message =
  | { kind: "refresh" }
  | { kind: "join" }
  | { kind: "action"; action: Action }
  | { kind: "snapshot"; room: Snapshot }
  | { kind: "loaded"; id: number; room: Snapshot }
  | { kind: "invite-loaded"; id: number; info: RoomInfo }
  | { kind: "failed"; id: number; status: number; error: string }
  | { kind: "removed" }
  | { kind: "expired" }
  | { kind: "connection"; text: string }
  | { kind: "error"; text: string }
  | { kind: "select-tile"; id: string }
  | { kind: "place"; row: number; col: number }
  | { kind: "clear-move" }
  | { kind: "exchange" }
  | { kind: "joker-changed"; letter: string }
  | { kind: "joker-confirmed" }
  | { kind: "joker-cancelled" };
export type Transition = { model: Model; commands: Command[] };
const emptyMove = (): Move => ({
  kind: "placement",
  selected: null,
  draft: [],
  joker: "",
  jokerError: "",
});
export function init(): Model {
  return {
    screen: { kind: "loading" },
    move: emptyMove(),
    pending: null,
    loading: null,
    nextId: 1,
    error: "",
    connection: "",
  };
}
export function update(model: Model, message: Message, userId: string): Transition {
  const unchanged: Transition = { model, commands: [] };
  const change = (patch: Partial<Model>, commands: Command[] = []): Transition => ({
    model: { ...model, ...patch },
    commands,
  });
  const room = model.screen.kind === "active" ? model.screen.room : null;
  const terminal = model.screen.kind === "removed" || model.screen.kind === "expired";
  const turn = room?.phase === "playing" && room.turnId === userId;
  const accept = (next: Snapshot): Transition => {
    if (room && next.version <= room.version) return unchanged;
    return change({ screen: { kind: "active", room: next }, move: emptyMove() }, [
      ...(room && next.board.length > room.board.length ? [{ kind: "overview" } as const] : []),
      {
        kind: "approval",
        version: next.version,
        action: !next.pending
          ? "close"
          : next.pending.authorId !== userId &&
              next.pending.words.some(
                (word) => next.pending!.votes[word.id]?.[userId] === undefined,
              )
            ? "show"
            : "keep",
      },
    ]);
  };
  const request = (command: Request): Transition =>
    change({ pending: command, nextId: model.nextId + 1, error: "" }, [command]);
  if (terminal) return unchanged;
  switch (message.kind) {
    case "removed":
      return change(
        {
          screen: { kind: "removed" },
          move: emptyMove(),
          pending: null,
          loading: null,
          connection: "",
          error:
            "This room is no longer available. Old rooms are automatically removed when their creator reaches the 100-room limit.",
        },
        [{ kind: "close-stream" }, { kind: "close-dialogs" }],
      );
    case "expired":
      return change(
        {
          screen: { kind: "expired" },
          move: emptyMove(),
          pending: null,
          loading: null,
          connection: "",
          error: "Your session ended. Sign in again to continue.",
        },
        [{ kind: "close-stream" }, { kind: "close-dialogs" }],
      );
    case "refresh": {
      if (model.loading !== null) return unchanged;
      const command: Request = { kind: "load", id: model.nextId };
      return change({ loading: command.id, nextId: model.nextId + 1 }, [command]);
    }
    case "join":
      return !model.pending &&
        model.screen.kind === "invite" &&
        model.screen.info.phase === "waiting"
        ? request({ kind: "join", id: model.nextId })
        : unchanged;
    case "action":
      return room && !model.pending
        ? request({
            kind: "action",
            id: model.nextId,
            action: message.action,
            version: room.version,
          })
        : unchanged;
    case "loaded": {
      if (message.id !== model.loading && message.id !== model.pending?.id) return unchanged;
      const next = accept(message.room);
      return {
        model: {
          ...next.model,
          loading: message.id === model.loading ? null : model.loading,
          pending: message.id === model.pending?.id ? null : model.pending,
        },
        commands: [...next.commands, { kind: "subscribe" }],
      };
    }
    case "invite-loaded":
      return message.id === model.loading
        ? change({
            ...(room ? {} : { screen: { kind: "invite", info: message.info } as Screen }),
            loading: null,
          })
        : unchanged;
    case "failed": {
      if (message.id !== model.loading && message.id !== model.pending?.id) return unchanged;
      if (message.status === 404) return update(model, { kind: "removed" }, userId);
      if (message.status === 401) return update(model, { kind: "expired" }, userId);
      const next = change({
        loading: message.id === model.loading ? null : model.loading,
        pending: message.id === model.pending?.id ? null : model.pending,
        error: message.error,
      });
      if (message.status !== 409) return next;
      const recovery = update(next.model, { kind: "refresh" }, userId);
      return recovery;
    }
    case "snapshot": {
      const next = accept(message.room);
      return { ...next, model: { ...next.model, connection: "" } };
    }
    case "connection":
      return change({ connection: message.text });
    case "error":
      return change({ error: message.text });
    case "clear-move":
      return !model.pending ? change({ move: emptyMove() }) : unchanged;
    case "exchange":
      return turn &&
        !model.pending &&
        room.bagCount >= 7 &&
        model.move.kind === "placement" &&
        !model.move.draft.length
        ? change({ move: { kind: "exchange", tiles: [] } })
        : unchanged;
    case "select-tile": {
      if (!turn || model.pending) return unchanged;
      const tile = room.you.rack.find((tile) => tile.id === message.id);
      if (!tile) return unchanged;
      if (model.move.kind === "exchange")
        return change({
          error: "",
          move: {
            kind: "exchange",
            tiles: model.move.tiles.includes(tile.id)
              ? model.move.tiles.filter((id) => id !== tile.id)
              : [...model.move.tiles, tile.id],
          },
        });
      const selected = model.move.selected === tile.id ? null : tile.id;
      return change(
        { error: "", move: { ...model.move, selected, jokerError: "" } },
        tile.letter === "*" && selected ? [{ kind: "joker-dialog", open: true }] : [],
      );
    }
    case "place": {
      if (
        !turn ||
        model.pending ||
        model.move.kind !== "placement" ||
        room.board.some((tile) => tile.row === message.row && tile.col === message.col)
      )
        return unchanged;
      const move = model.move;
      const old = move.draft.find((tile) => tile.row === message.row && tile.col === message.col);
      if (old)
        return change({
          move: { ...move, draft: move.draft.filter((tile) => tile !== old), selected: old.tileId },
        });
      const tile = room.you.rack.find((tile) => tile.id === move.selected);
      if (!tile)
        return change({ error: "Select a tile from your rack, then choose a board square." });
      const parsed = letterSchema.safeParse(move.joker);
      if (
        tile.letter === "*" &&
        (!parsed.success ||
          parsed.data === "*" ||
          !room.tileSet.tiles.some((tile) => tile.letter === parsed.data))
      )
        return change({ error: "Choose a letter from this set for your joker." });
      const placement: Placement = {
        tileId: tile.id,
        row: message.row,
        col: message.col,
        ...(tile.letter === "*" && parsed.success ? { letter: parsed.data } : {}),
      };
      return change({
        error: "",
        move: {
          ...move,
          selected: null,
          draft: [...move.draft.filter((value) => value.tileId !== tile.id), placement],
        },
      });
    }
    case "joker-changed":
      return model.move.kind === "placement"
        ? change({ move: { ...model.move, joker: message.letter, jokerError: "" } })
        : unchanged;
    case "joker-cancelled":
      return model.move.kind === "placement"
        ? change({ move: { ...model.move, selected: null } }, [
            { kind: "joker-dialog", open: false },
          ])
        : unchanged;
    case "joker-confirmed": {
      if (!room || model.move.kind !== "placement") return unchanged;
      const parsed = letterSchema.safeParse(model.move.joker);
      return parsed.success &&
        parsed.data !== "*" &&
        room.tileSet.tiles.some((tile) => tile.letter === parsed.data)
        ? change({ move: { ...model.move, joker: parsed.data, jokerError: "" } }, [
            { kind: "joker-dialog", open: false },
          ])
        : change({
            move: {
              ...model.move,
              jokerError: "Choose a letter from this tile set for the joker.",
            },
          });
    }
  }
}
