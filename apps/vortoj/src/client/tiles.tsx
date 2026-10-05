import { createSignal, Show, For } from "solid-js";
import { tileSetSchema, savedTileSetSchema, type TileSet } from "../contracts/index.ts";
import { api, message } from "./api.ts";
export type SavedSet = TileSet & { id: string };
export function TileEditor(props: { sets: SavedSet[]; saved: () => Promise<void> }) {
  type Row = { id: string; letter: string; count: number; points: number };
  const [name, setName] = createSignal("My tile set"),
    [rows, setRows] = createSignal<Row[]>([]),
    [id, setId] = createSignal<string | undefined>(undefined),
    [error, setError] = createSignal(""),
    [notice, setNotice] = createSignal(""),
    [busy, setBusy] = createSignal(false);
  function edit(set: SavedSet, copy: boolean) {
    setName(copy ? `${set.name} copy` : set.name);
    setId(copy ? undefined : set.id);
    setRows(set.tiles.map((tile) => ({ ...tile, id: crypto.randomUUID() })));
    setError("");
    setNotice("");
  }
  return (
    <section aria-label="Tile set editor">
      <div class="tile-editor-actions">
        <For each={props.sets}>
          {(set) => (
            <span>
              <button
                type="button"
                onClick={() => edit(set, set.id === "english" || set.id === "german")}
              >
                {set.id === "english" || set.id === "german"
                  ? `Copy ${set.name}`
                  : `Edit ${set.name}`}
              </button>
              <Show when={set.id !== "english" && set.id !== "german"}>
                <button
                  type="button"
                  onClick={async () => {
                    if (
                      !confirm(
                        `Remove ${set.name} from your collection? Existing games keep their tiles.`,
                      )
                    )
                      return;
                    try {
                      await api(`/tile-sets/${set.id}`, undefined, "DELETE");
                      await props.saved();
                      setId(undefined);
                      setNotice("Tile set removed.");
                    } catch (error) {
                      setError(message(error));
                    }
                  }}
                >
                  Remove {set.name}
                </button>
              </Show>
            </span>
          )}
        </For>
        <button
          type="button"
          onClick={() => {
            setRows([]);
            setId(undefined);
            setName("My tile set");
          }}
        >
          New empty set
        </button>
      </div>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          setNotice("");
          const data = new FormData(event.currentTarget);
          const parsed = tileSetSchema.safeParse({
            name: name(),
            tiles: rows().map((row) => ({
              letter: String(data.get(`letter-${row.id}`) ?? ""),
              count: Number(data.get(`count-${row.id}`)),
              points: Number(data.get(`points-${row.id}`)),
            })),
          });
          if (!parsed.success) {
            setError(parsed.error.issues[0]?.message ?? "Check your tiles");
            return;
          }
          setBusy(true);
          try {
            const saved = savedTileSetSchema.parse(
              await api(id() ? `/tile-sets/${id()}` : "/tile-sets", parsed.data),
            );
            setId(saved.id);
            setName(saved.name);
            setNotice("Tile set saved for your future games.");
            await props.saved();
          } catch (error) {
            setError(message(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label for="set-name">Tile set name</label>
        <input
          id="set-name"
          required
          maxlength={48}
          value={name()}
          onInput={(event) => setName(event.currentTarget.value)}
        />
        <p>
          One letter per entry, including accents and umlauts; * is a zero-point joker. Use 28–500
          tiles so four players can receive seven each.
        </p>
        <div class="tile-editor-rows">
          <div aria-hidden="true">Letter · Quantity · Points</div>
          <For each={rows()}>
            {(row, index) => (
              <div class="tile-editor-row">
                <input
                  aria-label={`Letter ${index() + 1}`}
                  name={`letter-${row.id}`}
                  value={row.letter}
                  maxlength={16}
                  required
                />
                <input
                  aria-label={`Quantity ${index() + 1}`}
                  name={`count-${row.id}`}
                  type="number"
                  min={1}
                  max={100}
                  required
                  value={row.count}
                />
                <input
                  aria-label={`Points ${index() + 1}`}
                  name={`points-${row.id}`}
                  type="number"
                  min={0}
                  max={20}
                  required
                  value={row.points}
                />
                <button
                  type="button"
                  aria-label={`Remove tile ${index() + 1}`}
                  onClick={() => setRows((value) => value.filter((tile) => tile.id !== row.id))}
                >
                  ×
                </button>
              </div>
            )}
          </For>
        </div>
        <button
          type="button"
          onClick={() =>
            setRows((value) => [
              ...value,
              { id: crypto.randomUUID(), letter: "", count: 1, points: 1 },
            ])
          }
        >
          Add letter
        </button>
        <button disabled={busy()}>{busy() ? "Saving…" : "Save tile set"}</button>
        <Show when={error()}>
          <p role="alert">{error()}</p>
        </Show>
        <Show when={notice()}>
          <p role="status">{notice()}</p>
        </Show>
      </form>
    </section>
  );
}
