import { render } from "@solidjs/web";
import { createRouter, useParams } from "@solidjs/router";
import { createSignal, onCleanup, Show, For } from "solid-js";
import { AppSettings } from "@repo/shared/settings";
import { createAppStorage } from "@repo/shared/storage";
import {
  appDefinition,
  deck,
  roomInfoSchema,
  roomSnapshotSchema,
  type RoomSnapshot,
  type RoomInfo,
  type Vote,
} from "../contracts/index.ts";
import "@repo/shared/styles";
import "./poker.css";

const storage = createAppStorage("poker", localStorage);
class RequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
async function request(path: string, body?: unknown, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(`/api/poker${path}`, {
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
    ...(signal ? { signal } : {}),
  }).catch((cause: unknown) => {
    if (signal?.aborted) throw cause;
    throw new RequestError(
      "Cannot reach the poker server. Check your connection and try again.",
      0,
    );
  });
  const data: unknown = await response.json().catch(() => {
    throw new RequestError(
      "The poker server returned an unreadable response. Refresh the page and try again.",
      response.status,
    );
  });
  if (!response.ok) {
    const message =
      typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
        ? data.error
        : "Request failed";
    throw new RequestError(message, response.status);
  }
  return data;
}
const message = (error: unknown) =>
  error instanceof RequestError
    ? error.message
    : "Could not read the room update. Refresh the page and try again.";
function saveName(form: HTMLFormElement) {
  const name = String(new FormData(form).get("name") ?? "").trim();
  storage.set("name", name);
  return name;
}
function NameField() {
  return (
    <>
      <label for="name">Your name</label>
      <input
        id="name"
        name="name"
        required
        maxlength={32}
        autocomplete="nickname"
        value={storage.get("name") ?? ""}
      />
    </>
  );
}

function Home() {
  let defaultTitle = true;
  const [busy, setBusy] = createSignal(false),
    [error, setError] = createSignal("");
  const controller = new AbortController();
  onCleanup(() => controller.abort());
  return (
    <main>
      <section>
        <h1>A shared estimate starts here.</h1>
        <p>{appDefinition.description}</p>
      </section>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          setBusy(true);
          setError("");
          try {
            const room = roomSnapshotSchema.parse(
              await request(
                "/rooms",
                { title: String(new FormData(form).get("title")), name: saveName(form) },
                controller.signal,
              ),
            );
            window.location.assign(`/poker/room/${room.id}`);
          } catch (cause) {
            if (!controller.signal.aborted) {
              setError(message(cause));
              setBusy(false);
            }
          }
        }}
      >
        <h2>Bring your team together</h2>
        <label for="title">Room name</label>
        <input
          id="title"
          name="title"
          required
          maxlength={100}
          value="Sprint planning"
          onFocus={(event) => {
            if (defaultTitle) {
              event.currentTarget.value = "";
              defaultTitle = false;
            }
          }}
          onInput={() => {
            defaultTitle = false;
          }}
        />
        <NameField />
        <button type="submit" disabled={busy()}>
          {busy() ? "Creating…" : "Create room"}
        </button>
        <Show when={error()}>
          <p role="alert">{error()}</p>
        </Show>
      </form>
      <p>
        Already invited? Open your team's room link to join. Anyone in the room can reveal votes or
        start a new round.
      </p>
    </main>
  );
}

function Room(props: { id: string }) {
  const id = props.id;
  const [room, setRoom] = createSignal<RoomSnapshot | null>(null),
    [info, setInfo] = createSignal<RoomInfo | null>(null);
  const [joining, setJoining] = createSignal(false),
    [busy, setBusy] = createSignal(false),
    [error, setError] = createSignal("");
  const [connection, setConnection] = createSignal("Connecting…"),
    [copied, setCopied] = createSignal(false);
  const controller = new AbortController();
  let events: EventSource | undefined;
  const apply = (data: unknown) => {
    const next = roomSnapshotSchema.parse(data);
    if (!room() || next.version >= room()!.version) setRoom(next);
  };
  const connect = () => {
    events?.close();
    events = new EventSource(`/api/poker/rooms/${id}/events`);
    events.addEventListener("snapshot", (event) => {
      try {
        apply(JSON.parse((event as MessageEvent<string>).data));
        setConnection("Live updates connected");
      } catch {
        setConnection("Unable to read live updates");
      }
    });
    events.addEventListener("expired", () => {
      events?.close();
      setRoom(null);
      setJoining(false);
      setError("This room has expired.");
      setConnection("Room expired");
    });
    events.onerror = () => setConnection("Connection lost. Reconnecting…");
  };
  const refresh = async () => {
    try {
      apply(await request(`/rooms/${id}`, undefined, controller.signal));
    } catch (cause) {
      if (!controller.signal.aborted) setError(message(cause));
    }
  };
  const resume = () => {
    if (!document.hidden && room()) void refresh();
  };
  document.addEventListener("visibilitychange", resume);
  onCleanup(() => {
    controller.abort();
    events?.close();
    document.removeEventListener("visibilitychange", resume);
  });
  void (async () => {
    try {
      setInfo(
        roomInfoSchema.parse(await request(`/rooms/${id}/info`, undefined, controller.signal)),
      );
      try {
        apply(await request(`/rooms/${id}`, undefined, controller.signal));
        connect();
      } catch (cause) {
        if (cause instanceof RequestError && cause.status === 401) setJoining(true);
        else throw cause;
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(message(cause));
    }
  })();
  const command = async (kind: "vote" | "reveal" | "reset", vote?: Vote | null) => {
    const current = room();
    if (!current || busy()) return;
    setBusy(true);
    setError("");
    try {
      apply(
        await request(
          `/rooms/${id}/${kind}`,
          { round: current.round, ...(kind === "vote" ? { vote } : {}) },
          controller.signal,
        ),
      );
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(message(cause));
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  };
  const invite = new URL(`/poker/room/${id}`, window.location.origin).href;
  return (
    <main>
      <section>
        <a href="/poker/">All poker rooms</a>
        <h1>{room()?.title ?? info()?.title ?? "Your room"}</h1>
        <Show when={room()}>
          <small aria-live="polite">{connection()}</small>
        </Show>
      </section>
      <Show when={error()}>
        <p role="alert">{error()}</p>
      </Show>
      <Show when={joining()}>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const name = saveName(event.currentTarget);
            setBusy(true);
            setError("");
            try {
              apply(await request(`/rooms/${id}/join`, { name }, controller.signal));
              setJoining(false);
              connect();
            } catch (cause) {
              if (!controller.signal.aborted) setError(message(cause));
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>Join the team</h2>
          <NameField />
          <button disabled={busy()} type="submit">
            Join room
          </button>
        </form>
      </Show>
      <Show when={room()}>
        <section>
          <div class="room-heading">
            <h2>Round {room()?.round}</h2>
            <strong>{room()?.revealed ? "Votes revealed" : "Voting in progress"}</strong>
          </div>
          <p>
            {room()?.participants.filter((person) => person.hasVoted).length} of{" "}
            {room()?.participants.length} people have voted.
          </p>
          <table>
            <caption>Team votes</caption>
            <thead>
              <tr>
                <th scope="col">Participant</th>
                <th scope="col">Vote</th>
              </tr>
            </thead>
            <tbody>
              <For each={room()?.participants}>
                {(person) => (
                  <tr>
                    <th scope="row">
                      {person.name}
                      {person.isCreator ? " · Creator" : ""}
                      {person.id === room()?.you.id ? " · You" : ""}
                    </th>
                    <td>
                      {room()?.revealed
                        ? (person.vote ?? "—")
                        : person.hasVoted
                          ? "Ready"
                          : "Thinking"}
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </section>
        <Show when={!room()?.revealed}>
          <section>
            <h2>Your estimate</h2>
            <p>Your vote stays private until someone reveals the round.</p>
            <div class="voting-deck" role="group" aria-label="Choose an estimate">
              <For each={deck}>
                {(value) => (
                  <button
                    type="button"
                    aria-label={value === "☕" ? "Vote for a break" : `Vote ${value}`}
                    title={value === "☕" ? "Break" : `Estimate ${value}`}
                    aria-pressed={room()?.you.vote === value ? "true" : "false"}
                    disabled={busy()}
                    onClick={() => void command("vote", value)}
                  >
                    {value}
                  </button>
                )}
              </For>
            </div>
            <p>
              Your vote: <strong>{room()?.you.vote ?? "Not selected"}</strong>
            </p>
            <Show when={room()?.you.vote !== null}>
              <button type="button" disabled={busy()} onClick={() => void command("vote", null)}>
                Clear my vote
              </button>
            </Show>
          </section>
        </Show>
        <section class="round-controls" aria-label="Round controls">
          <Show when={!room()?.revealed}>
            <button
              type="button"
              disabled={busy() || !room()?.participants.some((person) => person.hasVoted)}
              onClick={() => void command("reveal")}
            >
              Reveal votes
            </button>
          </Show>
          <button type="button" disabled={busy()} onClick={() => void command("reset")}>
            Start next round
          </button>
        </section>
        <section>
          <label for="invite">Invite link</label>
          <input
            id="invite"
            readonly
            value={invite}
            onFocus={(event) => event.currentTarget.select()}
          />
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(invite);
                setCopied(true);
              } catch {
                setError("Select the invite link and copy it to share.");
              }
            }}
          >
            {copied() ? "Link copied" : "Copy invite link"}
          </button>
          <small>
            Rooms expire after 30 days without activity. Keep this browser's site data to retain
            your guest identity.
          </small>
        </section>
      </Show>
    </main>
  );
}
function RoomRoute() {
  const params = useParams<{ id: string }>();
  return (
    <Show when={params.id} keyed>
      {(id) => <Room id={id} />}
    </Show>
  );
}
function NotFound() {
  return (
    <main>
      <h1>Page not found</h1>
      <a href="/poker/">Back to Scrum poker</a>
    </main>
  );
}
const element = document.getElementById("app");
if (!element) throw new Error("Missing app mount element");
const Router = createRouter({
  base: "/poker",
  routes: [
    { path: "/", component: Home },
    { path: "/room/:id", component: RoomRoute },
    { path: "*404", component: NotFound },
  ],
});
function App() {
  return (
    <>
      <header>
        <strong>Scrum poker</strong>
        <nav aria-label="App navigation">
          <a href="/">All apps</a>
          <AppSettings appId={appDefinition.id} defaultTheme={appDefinition.theme} />
        </nav>
      </header>
      <Router />
      <footer>
        <small>Droch apps · Scrum poker</small>
      </footer>
    </>
  );
}
render(() => <App />, element);
