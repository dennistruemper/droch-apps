import { createSignal, onSettled, Show, For } from "solid-js";
import { message } from "./api.ts";
import { init, update, type Message, type SavedSet } from "./tiles-model.ts";
import { execute } from "./tiles-commands.ts";
export type { SavedSet } from "./tiles-model.ts";
export function TileEditor(props: { sets: SavedSet[]; saved: () => Promise<void> }) {
  let current = init();
  const [model, setModel] = createSignal(current);
  const controller = new AbortController();
  onSettled(() => () => controller.abort());
  async function dispatch(event: Message): Promise<void> {
    if (controller.signal.aborted) return;
    const transition = update(current, event);
    current = transition.model;
    setModel(current);
    for (const command of transition.commands) {
      try {
        await dispatch(await execute(command, controller.signal, props.saved));
      } catch (error) {
        await dispatch({ kind: "failed", requestId: command.requestId, error: message(error) });
      }
    }
  }
  const name = () => model().name;
  const rows = () => model().rows;
  const busy = () => model().pending !== null;
  const error = () => model().error;
  const notice = () => model().notice;
  function edit(set: SavedSet, copy: boolean) {
    void dispatch({ kind: "edit", set, copy, rowIds: set.tiles.map(() => crypto.randomUUID()) });
  }
  return (
    <section aria-label="Tile set editor">
      <div class="tile-editor-actions">
        <For each={props.sets}>
          {(set) => (
            <span>
              <button
                type="button"
                disabled={busy()}
                onClick={() => edit(set, set.id === "english" || set.id === "german")}
              >
                {set.id === "english" || set.id === "german"
                  ? `Copy ${set.name}`
                  : `Edit ${set.name}`}
              </button>
              <Show when={set.id !== "english" && set.id !== "german"}>
                <button
                  type="button"
                  disabled={busy()}
                  onClick={() => void dispatch({ kind: "remove", set })}
                >
                  Remove {set.name}
                </button>
              </Show>
            </span>
          )}
        </For>
        <button type="button" disabled={busy()} onClick={() => void dispatch({ kind: "new" })}>
          New empty set
        </button>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void dispatch({ kind: "save" });
        }}
      >
        <label for="set-name">Tile set name</label>
        <input
          disabled={busy()}
          id="set-name"
          required
          maxlength={48}
          value={name()}
          onInput={(event) =>
            void dispatch({ kind: "name-changed", name: event.currentTarget.value })
          }
        />
        <p>
          One letter per entry, including accents and umlauts; * is a zero-point joker. Use 28–500
          tiles so four players can receive seven each.
        </p>
        <div class="tile-editor-rows">
          <div class="tile-editor-head" aria-hidden="true">
            <span>Letter</span>
            <span>Quantity</span>
            <span>Points</span>
          </div>
          <For each={rows()} keyed={(row) => row.id}>
            {(row, index) => (
              <div class="tile-editor-row">
                <input
                  disabled={busy()}
                  aria-label={`Letter ${index() + 1}`}
                  name={`letter-${row().id}`}
                  value={row().letter}
                  onInput={(event) =>
                    void dispatch({
                      kind: "row-changed",
                      id: row().id,
                      field: "letter",
                      value: event.currentTarget.value,
                    })
                  }
                  maxlength={16}
                  required
                />
                <input
                  disabled={busy()}
                  aria-label={`Quantity ${index() + 1}`}
                  name={`count-${row().id}`}
                  type="number"
                  min={1}
                  max={100}
                  required
                  value={row().count}
                  onInput={(event) =>
                    void dispatch({
                      kind: "row-changed",
                      id: row().id,
                      field: "count",
                      value: event.currentTarget.value,
                    })
                  }
                />
                <input
                  disabled={busy()}
                  aria-label={`Points ${index() + 1}`}
                  name={`points-${row().id}`}
                  type="number"
                  min={0}
                  max={20}
                  required
                  value={row().points}
                  onInput={(event) =>
                    void dispatch({
                      kind: "row-changed",
                      id: row().id,
                      field: "points",
                      value: event.currentTarget.value,
                    })
                  }
                />
                <button
                  type="button"
                  disabled={busy()}
                  aria-label={`Remove tile ${index() + 1}`}
                  onClick={() => void dispatch({ kind: "remove-row", id: row().id })}
                >
                  ×
                </button>
              </div>
            )}
          </For>
        </div>
        <button
          type="button"
          disabled={busy()}
          onClick={() => void dispatch({ kind: "add-row", id: crypto.randomUUID() })}
        >
          Add letter
        </button>
        <button disabled={busy()}>
          {busy()
            ? model().pending?.kind === "remove"
              ? "Removing…"
              : "Saving…"
            : "Save tile set"}
        </button>
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
