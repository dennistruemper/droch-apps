import { createSignal, onSettled, Show, For } from "solid-js";
import type { User } from "@repo/shared/contracts/auth";
import { init, update, type Message } from "./lobby-model.ts";
import { execute } from "./lobby-commands.ts";
import { TileEditor } from "./tiles.tsx";
import { message } from "./api.ts";
export function Lobby(props: { user: User }) {
  let current = init();
  const [model, setModel] = createSignal(current);
  const [editing, setEditing] = createSignal(false),
    [showFinished, setShowFinished] = createSignal(false);
  const controller = new AbortController();
  async function dispatch(event: Message, propagateFailure = false): Promise<void> {
    if (controller.signal.aborted) return;
    const transition = update(current, event);
    current = transition.model;
    setModel(current);
    for (const command of transition.commands) {
      if (command.kind === "navigate") {
        location.href = `/vortoj/room/${command.roomId}`;
        continue;
      }
      try {
        const result = await execute(command, controller.signal);
        if (controller.signal.aborted) return;
        if (
          result.kind === "loaded" &&
          (current.collection.kind !== "loading" || current.collection.id !== result.id)
        ) {
          if (propagateFailure)
            throw new Error("A newer collection refresh replaced this request. Please try again.");
          continue;
        }
        await dispatch(result);
      } catch (error) {
        if (controller.signal.aborted) return;
        await dispatch({ kind: "failed", id: command.id, error: message(error) });
        if (propagateFailure) throw error;
      }
    }
  }
  onSettled(() => {
    void dispatch({ kind: "refresh" });
    return () => controller.abort();
  });
  const sets = () => model().collection.data?.sets ?? [];
  const rooms = () => model().collection.data?.rooms ?? [];
  const loading = () => model().collection.kind === "loading";
  const creating = () =>
    model().creating.kind === "pending" || model().creating.kind === "navigating";
  const createError = () => {
    const value = model().creating;
    return value.kind === "failed" ? value.error : "";
  };
  const loadError = () => {
    const value = model().collection;
    return value.kind === "failed" ? value.error : "";
  };
  const visibleRooms = () => rooms().filter((room) => showFinished() || room.phase !== "finished");
  return (
    <>
      <section aria-label="Your rooms">
        <h2>Your rooms</h2>
        <label>
          <input
            type="checkbox"
            checked={showFinished()}
            onChange={(event) => setShowFinished(event.currentTarget.checked)}
          />
          Show finished games
        </label>
        <Show when={loading()}>
          <p role="status">Loading your rooms and tile sets…</p>
        </Show>
        <Show when={loadError()}>
          <p role="alert">{loadError()}</p>
          <button type="button" onClick={() => void dispatch({ kind: "refresh" })}>
            Try loading again
          </button>
        </Show>
        <Show when={model().collection.data}>
          <Show
            when={visibleRooms().length}
            fallback={
              <p>
                {showFinished() ? "No games yet." : "No unfinished games."} Create a room and invite
                someone.
              </p>
            }
          >
            <ul>
              <For each={visibleRooms()}>
                {(room) => (
                  <li>
                    <a href={`/vortoj/room/${room.id}`}>{room.title}</a> ·{" "}
                    {room.phase === "playing" && room.turnId === props.user.id
                      ? "Your turn"
                      : room.phase}
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </Show>
        <Show when={showFinished()}>
          <p>
            You can keep up to 100 rooms you create. When you create another at the limit, the room
            you created that has gone longest without updates is automatically removed for all
            players, even if unfinished. Rooms are listed with the most recently updated first.
            Viewing a game does not count as an update.
          </p>
        </Show>
      </section>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void dispatch({
            kind: "create",
            title: String(data.get("title") ?? ""),
            tileSetId: String(data.get("tiles") ?? ""),
          });
        }}
      >
        <h2>Create a room</h2>
        <label for="room-title">Room name</label>
        <input
          disabled={creating()}
          id="room-title"
          name="title"
          required
          maxlength={80}
          value="Word night"
        />
        <label for="room-tiles">Tile set</label>
        <select disabled={creating()} id="room-tiles" name="tiles" required>
          <For each={sets()}>
            {(set) => (
              <option value={set.id}>
                {set.name} ({set.tiles.reduce((sum, t) => sum + t.count, 0)} tiles)
              </option>
            )}
          </For>
        </select>
        <button disabled={!sets().length || creating()}>
          {creating() ? "Creating room…" : "Create room"}
        </button>
        <p>Share the room link with up to three other players. Everyone signs in before joining.</p>
      </form>
      <section>
        <h2>Your tile sets</h2>
        <p>English and German are ready to use. Save named custom sets for future games.</p>
        <button type="button" onClick={() => setEditing((value) => !value)}>
          {editing() ? "Close tile editor" : "Open tile editor"}
        </button>
        <Show when={editing()}>
          <TileEditor sets={sets()} saved={() => dispatch({ kind: "refresh" }, true)} />
        </Show>
      </section>
      <Show when={createError()}>
        <p role="alert">{createError()}</p>
      </Show>
    </>
  );
}
