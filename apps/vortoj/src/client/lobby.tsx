import { createSignal, onCleanup, Show, For } from "solid-js";
import type { User } from "@repo/shared/contracts/auth";
import { snapshotSchema, roomListSchema, savedTileSetSchema } from "../contracts/index.ts";
import { TileEditor, type SavedSet } from "./tiles.tsx";
import { api, message } from "./api.ts";
export function Lobby(props: { user: User }) {
  const [sets, setSets] = createSignal<SavedSet[]>([]),
    [rooms, setRooms] = createSignal<
      { id: string; title: string; phase: string; turnId: string; version: number }[]
    >([]),
    [error, setError] = createSignal(""),
    [editing, setEditing] = createSignal(false);
  const controller = new AbortController();
  onCleanup(() => controller.abort());
  async function load() {
    try {
      const [collection, games] = await Promise.all([
        api("/tile-sets", undefined, "GET", controller.signal),
        api("/rooms", undefined, "GET", controller.signal),
      ]);
      setSets(savedTileSetSchema.array().parse(collection));
      setRooms(roomListSchema.parse(games));
    } catch (error) {
      if (!controller.signal.aborted) setError(message(error));
    }
  }
  void load();
  return (
    <>
      <section>
        <h2>Your rooms</h2>
        <Show
          when={rooms().length}
          fallback={<p>No games yet. Create a room and invite someone.</p>}
        >
          <ul>
            <For each={rooms()}>
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
      </section>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          const data = new FormData(event.currentTarget);
          try {
            const room = snapshotSchema.parse(
              await api("/rooms", {
                title: String(data.get("title")),
                tileSetId: String(data.get("tiles")),
              }),
            );
            location.href = `/vortoj/room/${room.id}`;
          } catch (error) {
            setError(message(error));
          }
        }}
      >
        <h2>Create a room</h2>
        <label for="room-title">Room name</label>
        <input id="room-title" name="title" required maxlength={80} value="Word night" />
        <label for="room-tiles">Tile set</label>
        <select id="room-tiles" name="tiles" required>
          <For each={sets()}>
            {(set) => (
              <option value={set.id}>
                {set.name} ({set.tiles.reduce((sum, t) => sum + t.count, 0)} tiles)
              </option>
            )}
          </For>
        </select>
        <button disabled={!sets().length}>Create room</button>
        <p>Share the room link with up to three other players. Everyone signs in before joining.</p>
      </form>
      <section>
        <h2>Your tile sets</h2>
        <p>English and German are ready to use. Save named custom sets for future games.</p>
        <button type="button" onClick={() => setEditing((value) => !value)}>
          {editing() ? "Close tile editor" : "Open tile editor"}
        </button>
        <Show when={editing()}>
          <TileEditor
            sets={sets()}
            saved={async () => {
              await load();
            }}
          />
        </Show>
      </section>
      <Show when={error()}>
        <p role="alert">{error()}</p>
      </Show>
    </>
  );
}
