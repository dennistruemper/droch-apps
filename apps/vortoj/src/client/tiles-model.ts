import { tileSetSchema, type TileSet } from "../contracts/index.ts";
export type SavedSet = TileSet & { id: string };
export type Row = { id: string; letter: string; count: string; points: string };
export type Command = { requestId: number } & (
  | { kind: "save"; setId: string | undefined; value: TileSet }
  | { kind: "remove"; set: SavedSet }
  | { kind: "reload"; notice: string }
);
export type Model = {
  name: string;
  rows: Row[];
  setId: string | undefined;
  pending: Command | null;
  nextId: number;
  error: string;
  notice: string;
};
export type Message =
  | { kind: "edit"; set: SavedSet; copy: boolean; rowIds: readonly string[] }
  | { kind: "new" }
  | { kind: "name-changed"; name: string }
  | { kind: "add-row"; id: string }
  | { kind: "remove-row"; id: string }
  | { kind: "save" }
  | { kind: "row-changed"; id: string; field: "letter" | "count" | "points"; value: string }
  | { kind: "remove"; set: SavedSet }
  | { kind: "saved"; requestId: number; set: SavedSet }
  | { kind: "removed"; requestId: number }
  | { kind: "reloaded"; requestId: number }
  | { kind: "cancelled"; requestId: number }
  | { kind: "failed"; requestId: number; error: string };
export type Transition = { model: Model; commands: Command[] };
export function init(): Model {
  return {
    name: "My tile set",
    rows: [],
    setId: undefined,
    pending: null,
    nextId: 1,
    error: "",
    notice: "",
  };
}
export function update(model: Model, message: Message): Transition {
  const unchanged: Transition = { model, commands: [] };
  const change = (patch: Partial<Model>): Transition => ({
    model: { ...model, ...patch },
    commands: [],
  });
  const start = (command: Command): Transition => ({
    model: { ...model, pending: command, nextId: model.nextId + 1, error: "", notice: "" },
    commands: [command],
  });
  const reload = (patch: Partial<Model>, notice: string): Transition => {
    const command: Command = { kind: "reload", requestId: model.pending!.requestId, notice };
    return { model: { ...model, ...patch, pending: command }, commands: [command] };
  };
  switch (message.kind) {
    case "saved":
    case "removed":
    case "reloaded":
    case "cancelled":
    case "failed": {
      if (!model.pending || model.pending.requestId !== message.requestId) return unchanged;
      if (message.kind === "failed") return change({ pending: null, error: message.error });
      if (message.kind === "reloaded")
        return model.pending.kind === "reload"
          ? change({ pending: null, notice: model.pending.notice })
          : unchanged;
      if (message.kind === "cancelled") return change({ pending: null });
      if (message.kind === "saved")
        return model.pending.kind === "save"
          ? reload(
              { setId: message.set.id, name: message.set.name },
              "Tile set saved for your future games.",
            )
          : unchanged;
      return model.pending.kind === "remove"
        ? reload(
            { setId: model.setId === model.pending.set.id ? undefined : model.setId },
            "Tile set removed.",
          )
        : unchanged;
    }
    default:
      if (model.pending) return unchanged;
      switch (message.kind) {
        case "edit":
          return change({
            name: message.copy ? `${message.set.name} copy` : message.set.name,
            setId: message.copy ? undefined : message.set.id,
            rows: message.set.tiles.map((tile, index) => ({
              letter: tile.letter,
              count: String(tile.count),
              points: String(tile.points),
              id: message.rowIds[index]!,
            })),
            error: "",
            notice: "",
          });
        case "new":
          return change({ name: "My tile set", rows: [], setId: undefined, error: "", notice: "" });
        case "name-changed":
          return change({ name: message.name });
        case "add-row":
          return change({
            rows: [...model.rows, { id: message.id, letter: "", count: "1", points: "1" }],
          });
        case "row-changed":
          return change({
            rows: model.rows.map((row) =>
              row.id === message.id ? { ...row, [message.field]: message.value } : row,
            ),
          });
        case "remove-row":
          return change({ rows: model.rows.filter((row) => row.id !== message.id) });
        case "remove":
          return start({ kind: "remove", requestId: model.nextId, set: message.set });
        case "save": {
          const parsed = tileSetSchema.safeParse({
            name: model.name,
            tiles: model.rows.map((row) => ({
              letter: row.letter,
              count: Number(row.count),
              points: Number(row.points),
            })),
          });
          return parsed.success
            ? start({
                kind: "save",
                requestId: model.nextId,
                setId: model.setId,
                value: parsed.data,
              })
            : change({ error: parsed.error.issues[0]?.message ?? "Check your tiles", notice: "" });
        }
      }
  }
}
