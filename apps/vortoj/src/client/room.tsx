import { createSignal, onCleanup, Show, For } from "solid-js";
import type { User } from "@repo/shared/contracts/auth";
import {
  snapshotSchema,
  roomInfoSchema,
  letterSchema,
  type Snapshot,
  type Placement,
  type RoomInfo,
  type GameCommand,
} from "../contracts/index.ts";
import { premium, evaluateMove } from "../domain/index.ts";
import { api, message, RequestError } from "./api.ts";
export function Room(props: { id: string; user: User }) {
  const [room, setRoom] = createSignal<Snapshot | null>(null),
    [info, setInfo] = createSignal<RoomInfo | null>(null),
    [error, setError] = createSignal(""),
    [busy, setBusy] = createSignal(false),
    [selected, setSelected] = createSignal<string | null>(null),
    [draft, setDraft] = createSignal<Placement[]>([]),
    [joker, setJoker] = createSignal(""),
    [exchange, setExchange] = createSignal<string[]>([]),
    [connection, setConnection] = createSignal(""),
    [zoomed, setZoomed] = createSignal(false),
    [cell, setCell] = createSignal(20),
    [fits, setFits] = createSignal(false),
    [exchangeMode, setExchangeMode] = createSignal(false),
    [jokerError, setJokerError] = createSignal("");
  const controller = new AbortController();
  let events: EventSource | null = null;
  let viewport: HTMLDivElement | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let detailsDialog: HTMLDialogElement | undefined;
  let rulesDialog: HTMLDialogElement | undefined;
  let actionsDialog: HTMLDialogElement | undefined;
  let approvalDialog: HTMLDialogElement | undefined;
  let jokerDialog: HTMLDialogElement | undefined;
  let cameraFrame = 0;
  let measureFrame = 0;
  let approvalFrame = 0;
  let focus = { row: 7, col: 7 };
  const pointer = matchMedia("(pointer: fine)");
  function measureBoard(detail = zoomed()) {
    if (!viewport?.isConnected) return;
    const whole = Math.max(
      8,
      Math.floor(Math.min(viewport.clientWidth - 6, viewport.clientHeight - 6, 900) / 15),
    );
    const complete = whole >= (pointer.matches ? 32 : 44);
    setFits(complete);
    if (complete) setZoomed(false);
    setCell(!complete && detail ? 44 : whole);
  }
  function attachViewport(element: HTMLDivElement) {
    resizeObserver?.disconnect();
    viewport = element;
    resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(measureFrame);
      measureFrame = requestAnimationFrame(() => measureBoard());
    });
    resizeObserver.observe(element);
    cancelAnimationFrame(cameraFrame);
    cameraFrame = requestAnimationFrame(() => measureBoard());
  }
  function overview() {
    setZoomed(false);
    measureBoard(false);
  }
  function zoomTo(row: number, col: number) {
    focus = { row, col };
    if (fits()) return;
    setZoomed(true);
    measureBoard(true);
    cancelAnimationFrame(cameraFrame);
    cameraFrame = requestAnimationFrame(() => {
      if (!viewport?.isConnected) return;
      viewport.scrollLeft = col * 44 + 22 - viewport.clientWidth / 2;
      viewport.scrollTop = row * 44 + 22 - viewport.clientHeight / 2;
    });
  }
  const pointerChange = () => measureBoard();
  pointer.addEventListener("change", pointerChange);
  function receive(data: unknown) {
    const next = snapshotSchema.parse(data),
      old = room();
    if (old && next.version <= old.version) return;
    if (!old || next.version !== old.version) {
      setDraft([]);
      setSelected(null);
      setExchange([]);
      setExchangeMode(false);
    }
    if (old && next.board.length > old.board.length) overview();
    if (!next.pending) approvalDialog?.close();
    setRoom(next);
    setInfo(null);
    cancelAnimationFrame(approvalFrame);
    approvalFrame = requestAnimationFrame(() => {
      if (
        room()?.version === next.version &&
        next.pending &&
        next.pending.authorId !== props.user.id &&
        next.pending.words.some(
          (word) => next.pending!.votes[word.id]?.[props.user.id] === undefined,
        )
      ) {
        detailsDialog?.close();
        rulesDialog?.close();
        actionsDialog?.close();
        if (approvalDialog?.isConnected && !approvalDialog.open) approvalDialog.showModal();
      }
    });
  }
  function subscribe() {
    if (events) return;
    events = new EventSource(`/api/vortoj/rooms/${props.id}/events`);
    events.addEventListener("snapshot", (event) => {
      try {
        receive(JSON.parse((event as MessageEvent<string>).data));
        setConnection("");
      } catch {
        setError("Could not read this game update. Refresh to recover.");
      }
    });
    events.addEventListener("expired", () => {
      events?.close();
      events = null;
      setRoom(null);
      setError("Your session ended. Sign in again to continue.");
    });
    events.onerror = () =>
      setConnection("Connection interrupted. Your game is saved; reconnecting…");
  }
  async function load() {
    try {
      receive(await api(`/rooms/${props.id}`, undefined, "GET", controller.signal));
      subscribe();
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof RequestError && error.status === 403) {
        try {
          setInfo(roomInfoSchema.parse(await api(`/rooms/${props.id}/info`)));
        } catch (error) {
          setError(message(error));
        }
      } else {
        if (error instanceof RequestError && error.status === 401) {
          events?.close();
          events = null;
          setRoom(null);
          setDraft([]);
        }
        setError(message(error));
      }
    }
  }
  void load();
  const timer = setInterval(() => {
    if (document.visibilityState === "visible" && room()) void load();
  }, 10000);
  const visibility = () => {
    if (document.visibilityState === "visible") void load();
  };
  document.addEventListener("visibilitychange", visibility);
  onCleanup(() => {
    controller.abort();
    cancelAnimationFrame(approvalFrame);
    cancelAnimationFrame(measureFrame);
    resizeObserver?.disconnect();
    cancelAnimationFrame(cameraFrame);
    pointer.removeEventListener("change", pointerChange);
    events?.close();
    clearInterval(timer);
    document.removeEventListener("visibilitychange", visibility);
  });
  type Action = GameCommand extends infer Command
    ? Command extends GameCommand
      ? Omit<Command, "version" | "commandId">
      : never
    : never;
  async function command(action: Action) {
    const current = room();
    if (!current || busy()) return;
    setBusy(true);
    setError("");
    try {
      receive(
        await api(`/rooms/${props.id}/command`, {
          ...action,
          version: current.version,
          commandId: crypto.randomUUID(),
        }),
      );
    } catch (error) {
      setError(message(error));
      if (error instanceof RequestError && [401, 409].includes(error.status)) await load();
    } finally {
      setBusy(false);
    }
  }
  const turn = () => room()?.phase === "playing" && room()?.turnId === props.user.id;
  const invite = `${location.origin}/vortoj/room/${props.id}`;
  const preview = () => {
    const current = room();
    if (!current || !draft().length) return { move: null, error: "" };
    try {
      return {
        move: evaluateMove(
          current.board,
          current.you.rack,
          draft(),
          current.tileSet.tiles.filter((t) => t.letter !== "*").map((t) => t.letter),
        ),
        error: "",
      };
    } catch (error) {
      return { move: null, error: message(error) };
    }
  };
  function selectTile(id: string, letter: string) {
    setError("");
    if (exchangeMode()) {
      setExchange((ids) => (ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]));
      return;
    }
    const next = selected() === id ? null : id;
    setSelected(next);
    if (letter === "*" && next === id) {
      setJokerError("");
      jokerDialog?.showModal();
    }
  }
  function squareClick(row: number, col: number) {
    focus = { row, col };
    if (!zoomed() && !fits()) {
      zoomTo(row, col);
      return;
    }
    if (room()?.board.some((tile) => tile.row === row && tile.col === col)) return;
    if (exchangeMode()) return;
    place(row, col);
  }
  function place(row: number, col: number) {
    const current = room();
    if (!current || !turn() || busy()) return;
    const old = draft().find((p) => p.row === row && p.col === col);
    if (old) {
      setDraft((value) => value.filter((p) => p !== old));
      setSelected(old.tileId);
      return;
    }
    const tile = current.you.rack.find((t) => t.id === selected());
    if (!tile) {
      setError("Select a tile from your rack, then choose a board square.");
      return;
    }
    let letter: string | undefined;
    if (tile.letter === "*") {
      const parsed = letterSchema.safeParse(joker());
      if (
        !parsed.success ||
        parsed.data === "*" ||
        !current.tileSet.tiles.some((t) => t.letter === parsed.data)
      ) {
        setError("Choose a letter from this set for your joker.");
        return;
      }
      letter = parsed.data;
    }
    setDraft((value) => [
      ...value.filter((p) => p.tileId !== tile.id),
      { tileId: tile.id, row, col, ...(letter ? { letter } : {}) },
    ]);
    setSelected(null);
    setError("");
  }
  const current = () => room()!;
  const phaseText = () =>
    current().phase === "waiting"
      ? "Invite your players, then start."
      : current().phase === "finished"
        ? "Game finished"
        : current().phase === "voting"
          ? "Words waiting for approval"
          : current().turnId === props.user.id
            ? "Your turn"
            : `${current().players.find((player) => player.id === current().turnId)?.name}’s turn`;
  return (
    <>
      <Show when={info()} keyed>
        {(details) => (
          <section>
            <a href="/vortoj/">Your rooms and tile sets</a>
            <h1>{details.title}</h1>
            <p>
              {details.playerCount} of 4 players · {details.phase}
            </p>
            <button
              type="button"
              disabled={busy() || details.phase !== "waiting"}
              onClick={async () => {
                setBusy(true);
                try {
                  receive(await api(`/rooms/${props.id}/join`, {}));
                  subscribe();
                } catch (error) {
                  setError(message(error));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Join room
            </button>
            <Show when={details.phase !== "waiting"}>
              <p>This game has started. Ask the creator for a new room.</p>
            </Show>
          </section>
        )}
      </Show>
      <Show when={room()}>
        <Show when={current().phase === "waiting"}>
          <section class="room-lobby">
            <a href="/vortoj/">Your rooms and tile sets</a>
            <h1>{current().title}</h1>
            <p>{phaseText()}</p>
            <ul>
              <For each={current().players}>{(player) => <li>{player.name}</li>}</For>
            </ul>
            <label for="invite">Room invitation</label>
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
                  setConnection("Invitation copied.");
                } catch {
                  setConnection("Select and copy the invitation link to share it.");
                }
              }}
            >
              Copy invite link
            </button>
            <Show when={current().ownerId === props.user.id}>
              <button
                type="button"
                disabled={busy() || current().players.length < 2}
                onClick={() => void command({ kind: "start" })}
              >
                Start game
              </button>
            </Show>
            <p>
              Two to four players. The creator takes the first turn. Tile settings are fixed for
              this room.
            </p>
          </section>
        </Show>
        <Show when={current().phase !== "waiting"}>
          <div class="game-shell">
            <header class="game-heading">
              <div>
                <h1 title={current().title}>{current().title}</h1>
                <p>{phaseText()}</p>
              </div>
              <nav class="game-heading-actions" aria-label="Game information">
                <button
                  type="button"
                  aria-label="Players, scores and game details"
                  onClick={() => detailsDialog?.showModal()}
                >
                  <small>Your score</small>
                  <strong>
                    {current().players.find((player) => player.id === props.user.id)?.score} points
                  </strong>
                </button>
                <button type="button" onClick={() => rulesDialog?.showModal()}>
                  Rules
                </button>
              </nav>
            </header>
            <section class="board-workspace" aria-label="Game board">
              <div class="board-tools">
                <small>
                  {fits()
                    ? "Whole board · place directly"
                    : zoomed()
                      ? "Swipe to explore · tap to place"
                      : "Whole board · tap to zoom"}
                </small>
                <Show when={!fits()}>
                  <button
                    type="button"
                    onClick={() => (zoomed() ? overview() : zoomTo(focus.row, focus.col))}
                  >
                    {zoomed() ? "Whole board" : "Zoom in"}
                  </button>
                  <button type="button" aria-label="Centre board" onClick={() => zoomTo(7, 7)}>
                    Centre
                  </button>
                </Show>
              </div>
              <div class={`board-scroll ${zoomed() ? "" : "board-overview"}`} ref={attachViewport}>
                <div
                  class={`game-board ${zoomed() || fits() ? "" : "small-board"}`}
                  style={`--board-cell: ${cell()}px`}
                  role="group"
                  aria-label="15 by 15 word board"
                >
                  <For each={Array.from({ length: 225 }, (_, index) => index)}>
                    {(index) => {
                      const row = Math.floor(index / 15),
                        col = index % 15,
                        bonus = premium(row, col),
                        multiplier = bonus ? (bonus.startsWith("D") ? "2×" : "3×") : "",
                        bonusDescription = bonus
                          ? `${multiplier} ${bonus.endsWith("W") ? "word" : "letter"} bonus`
                          : "";
                      const committed = () =>
                        current().board.find((tile) => tile.row === row && tile.col === col);
                      const pending = () =>
                        current().pending?.placements.find(
                          (tile) => tile.row === row && tile.col === col,
                        );
                      const placement = () =>
                        draft().find((tile) => tile.row === row && tile.col === col);
                      const tile = () => committed() ?? pending();
                      const rackTile = () =>
                        current().you.rack.find((tile) => tile.id === placement()?.tileId);
                      const letter = () =>
                        tile()?.letter ?? placement()?.letter ?? rackTile()?.letter;
                      return (
                        <button
                          type="button"
                          data-premium={bonus}
                          data-proposed={pending() || placement() ? "true" : "false"}
                          data-filled={committed() ? "true" : "false"}
                          aria-disabled={
                            (zoomed() || fits()) && (!turn() || Boolean(committed()) || busy())
                              ? "true"
                              : "false"
                          }
                          aria-label={`Row ${row + 1}, column ${col + 1}, ${letter() ?? "empty"}${bonusDescription ? `, ${bonusDescription}` : ""}${row === 7 && col === 7 ? ", starting square" : ""}`}
                          onClick={() => squareClick(row, col)}
                        >
                          <Show
                            when={letter()}
                            fallback={
                              <>
                                <span class="premium-label" aria-hidden="true">
                                  {multiplier}
                                </span>
                                <Show when={row === 7 && col === 7}>
                                  <span class="start-square" aria-hidden="true">
                                    ★
                                  </span>
                                </Show>
                              </>
                            }
                          >
                            <span>{letter()}</span>
                            <small>{tile()?.points ?? rackTile()?.points}</small>
                          </Show>
                        </button>
                      );
                    }}
                  </For>
                </div>
              </div>
            </section>
            <section class="game-dock" aria-label="Your rack">
              <div class="rack-heading">
                <h2>Your tiles</h2>
                <a href="/vortoj/">Rooms</a>
              </div>
              <div class="rack">
                <For each={current().you.rack}>
                  {(tile) => (
                    <button
                      type="button"
                      aria-pressed={
                        (exchangeMode() ? exchange().includes(tile.id) : selected() === tile.id)
                          ? "true"
                          : "false"
                      }
                      aria-label={`Tile ${tile.letter}, ${tile.points} points`}
                      data-used={
                        draft().some((place) => place.tileId === tile.id) ? "true" : "false"
                      }
                      disabled={!turn() || busy()}
                      onClick={() => selectTile(tile.id, tile.letter)}
                    >
                      <strong>{tile.letter}</strong>
                      <small>{tile.points}</small>
                    </button>
                  )}
                </For>
              </div>
              <div class="move-feedback" aria-live="polite">
                <Show when={error()}>
                  <p role="alert">
                    {error()}{" "}
                    <button type="button" onClick={() => location.reload()}>
                      Refresh / sign in again
                    </button>
                  </p>
                </Show>
                <Show when={connection()}>
                  <small>{connection()}</small>
                </Show>
                <Show when={turn()}>
                  <Show
                    when={exchangeMode()}
                    fallback={
                      <>
                        <Show when={preview().error}>
                          <p>{preview().error}</p>
                        </Show>
                        <Show when={preview().move} keyed>
                          {(move) => (
                            <p>
                              {move.words.map((word) => `${word.text} (${word.points})`).join(", ")}
                              {move.bonus ? " + 50-point rack bonus" : ""}
                            </p>
                          )}
                        </Show>
                        <Show when={!draft().length}>
                          <p>
                            {selected()
                              ? "Tap an empty square to place your tile."
                              : "Choose a tile, then a board square."}
                          </p>
                        </Show>
                      </>
                    }
                  >
                    <p>Select the tiles to exchange ({exchange().length} selected).</p>
                  </Show>
                </Show>
              </div>
              <Show when={turn()}>
                <div class="game-actions">
                  <button
                    type="button"
                    aria-label={exchangeMode() ? "Cancel" : "Clear placement"}
                    disabled={!draft().length && !exchangeMode()}
                    onClick={() => {
                      setDraft([]);
                      setSelected(null);
                      setExchange([]);
                      setExchangeMode(false);
                    }}
                  >
                    {exchangeMode() ? "Cancel" : "Clear"}
                  </button>
                  <Show
                    when={exchangeMode()}
                    fallback={
                      <button
                        type="button"
                        class="submit-move"
                        aria-label="Submit words for approval"
                        disabled={!preview().move || busy()}
                        onClick={() => void command({ kind: "place", placements: draft() })}
                      >
                        Submit word
                      </button>
                    }
                  >
                    <button
                      type="button"
                      class="submit-move"
                      disabled={!exchange().length || busy() || current().bagCount < 7}
                      onClick={() => void command({ kind: "exchange", tileIds: exchange() })}
                    >
                      Exchange selected tiles
                    </button>
                  </Show>
                  <button
                    type="button"
                    aria-label="More game actions"
                    onClick={() => actionsDialog?.showModal()}
                  >
                    ⋯
                  </button>
                </div>
              </Show>
              <Show when={current().pending}>
                <button
                  class="review-words"
                  type="button"
                  onClick={() => approvalDialog?.showModal()}
                >
                  {current().pending?.authorId === props.user.id
                    ? "View word approval"
                    : "Review words"}
                </button>
              </Show>
              <Show when={current().phase === "finished"}>
                <div class="final-scores">
                  <h2>Final scores</h2>
                  <p>
                    {current()
                      .players.filter(
                        (player) =>
                          player.score === Math.max(...current().players.map((p) => p.score)),
                      )
                      .map((player) => player.name)
                      .join(" and ")}{" "}
                    finished with the highest score.
                  </p>
                  <a href="/vortoj/">Create another game</a>
                </div>
              </Show>
            </section>
          </div>
        </Show>
        <dialog
          class="game-dialog"
          ref={(element) => {
            detailsDialog = element;
          }}
        >
          <div class="dialog-heading">
            <h2>Players and scores</h2>
            <button
              type="button"
              aria-label="Close game details"
              onClick={() => detailsDialog?.close()}
            >
              ×
            </button>
          </div>
          <ul class="player-list">
            <For each={current().players}>
              {(player) => (
                <li aria-current={current().turnId === player.id ? "true" : undefined}>
                  <strong>
                    {player.name}
                    {player.id === props.user.id ? " (you)" : ""}
                  </strong>
                  <span>· {player.score} points</span>
                  <span
                    class="player-tile-count"
                    role="img"
                    aria-label={`${player.name}: ${player.tileCount} ${player.tileCount === 1 ? "tile" : "tiles"} remaining`}
                  >
                    <For each={Array.from({ length: player.tileCount }, (_, index) => index)}>
                      {() => <span class="tile-back" aria-hidden="true" />}
                    </For>
                    <Show when={player.tileCount === 0}>
                      <span aria-hidden="true">No tiles left</span>
                    </Show>
                  </span>
                </li>
              )}
            </For>
          </ul>
          <p>
            {current().tileSet.name} · {current().bagCount} tiles in the bag · No turn deadline
          </p>
          <details>
            <summary>Game history</summary>
            <ol class="game-history">
              <For each={current().history}>{(entry) => <li>{entry.text}</li>}</For>
            </ol>
          </details>
        </dialog>
        <dialog
          class="game-dialog"
          aria-labelledby="game-rules-title"
          ref={(element) => {
            rulesDialog = element;
          }}
        >
          <div class="dialog-heading">
            <h2 id="game-rules-title">Game rules</h2>
            <button
              type="button"
              aria-label="Close game rules"
              onClick={() => rulesDialog?.close()}
            >
              ×
            </button>
          </div>
          <h3>Place a word</h3>
          <p>
            Choose a tile, then an empty square. Place one to seven tiles in a single row or column
            without gaps; existing tiles can connect them. Every word must contain at least two
            letters. The first word covers the ★ square; later moves connect to the board. On small
            screens, tap the board to zoom and swipe to explore.
          </p>
          <h3>Bonus squares</h3>
          <div class="bonus-key">
            <For
              each={[
                { bonus: "DW", text: "2×", description: "Whole word" },
                { bonus: "TW", text: "3×", description: "Whole word" },
                { bonus: "DL", text: "2×", description: "New letter" },
                { bonus: "TL", text: "3×", description: "New letter" },
              ]}
            >
              {(example) => (
                <div class="bonus-key-item">
                  <span class="bonus-key-square" data-premium={example.bonus} aria-hidden="true">
                    <span class="premium-label">{example.text}</span>
                  </span>
                  <span>
                    {example.text} {example.description.toLowerCase()}
                  </span>
                </div>
              )}
            </For>
          </div>
          <p>
            Large labels multiply the whole word; half-size labels multiply the new letter. Bonuses
            apply only when a tile is first played. Letter bonuses apply before word bonuses, and
            word bonuses multiply together. Playing all seven tiles adds 50 points.
          </p>
          <h3>Word approval and turns</h3>
          <p>
            There is no dictionary check. Opponents vote on every new word, including cross-words.
            At least half the opponents must approve each word, rounded up. An accepted move scores
            and refills your rack. A rejected move returns your tiles and ends your turn. Turns and
            votes have no deadline.
          </p>
          <h3>Jokers, passing and exchanges</h3>
          <p>
            A * joker stands for a letter from this tile set and scores zero. Its letter stays fixed
            once accepted. You can pass, or exchange selected tiles when at least seven remain in
            the bag; either action ends your turn.
          </p>
          <h3>Finishing the game</h3>
          <p>
            The game ends when someone empties their rack with an empty bag, or after everyone takes
            two consecutive turns without scoring. Remaining tile points are deducted. A player who
            empties their rack also receives the opponents’ remaining tile points. The highest score
            wins.
          </p>
        </dialog>
        <dialog
          class="game-dialog"
          ref={(element) => {
            actionsDialog = element;
          }}
        >
          <div class="dialog-heading">
            <h2>More actions</h2>
            <button
              type="button"
              aria-label="Close game actions"
              onClick={() => actionsDialog?.close()}
            >
              ×
            </button>
          </div>
          <button
            type="button"
            disabled={busy() || !turn() || draft().length > 0}
            onClick={() => {
              actionsDialog?.close();
              void command({ kind: "pass" });
            }}
          >
            Pass
          </button>
          <button
            type="button"
            disabled={busy() || !turn() || draft().length > 0 || current().bagCount < 7}
            onClick={() => {
              actionsDialog?.close();
              setSelected(null);
              setExchangeMode(true);
            }}
          >
            Exchange tiles
          </button>
          <p>At least seven tiles must remain in the bag to exchange.</p>
        </dialog>
        <dialog
          class="game-dialog"
          ref={(element) => {
            jokerDialog = element;
          }}
          onCancel={() => setSelected(null)}
        >
          <div class="dialog-heading">
            <h2>Choose a joker letter</h2>
            <button
              type="button"
              aria-label="Close joker letter"
              onClick={() => {
                setSelected(null);
                jokerDialog?.close();
              }}
            >
              ×
            </button>
          </div>
          <label for="joker-letter">Joker letter</label>
          <input
            id="joker-letter"
            aria-invalid={jokerError() ? "true" : "false"}
            maxlength={16}
            value={joker()}
            onInput={(event) => {
              setJoker(event.currentTarget.value);
              setJokerError("");
            }}
          />
          <Show when={jokerError()}>
            <p role="alert">{jokerError()}</p>
          </Show>
          <button
            type="button"
            onClick={() => {
              const value = letterSchema.safeParse(joker());
              if (
                !value.success ||
                value.data === "*" ||
                !current().tileSet.tiles.some((tile) => tile.letter === value.data)
              ) {
                setJokerError("Choose a letter from this tile set for the joker.");
                return;
              }
              setJoker(value.data);
              jokerDialog?.close();
            }}
          >
            Use this letter
          </button>
          <p>Jokers score zero.</p>
        </dialog>
        <dialog
          class="game-dialog"
          ref={(element) => {
            approvalDialog = element;
          }}
        >
          <div class="dialog-heading">
            <h2>Approve the words</h2>
            <button
              type="button"
              aria-label="Close word approval"
              onClick={() => approvalDialog?.close()}
            >
              ×
            </button>
          </div>
          <Show when={current().pending} keyed>
            {(pending) => (
              <section aria-label="Word approval">
                <p>
                  Each word needs {pending.requiredApprovals} opponent approval
                  {pending.requiredApprovals === 1 ? "" : "s"}. Jokers score zero.
                </p>
                <For each={pending.words}>
                  {(word) => (
                    <article>
                      <h3>
                        {word.text} · {word.points} points
                      </h3>
                      <p>
                        {
                          Object.values(pending.votes[word.id] ?? {}).filter((value) => value)
                            .length
                        }{" "}
                        approvals
                      </p>
                      <Show
                        when={pending.authorId !== props.user.id}
                        fallback={<p>Waiting for your opponents.</p>}
                      >
                        <Show
                          when={pending.votes[word.id]?.[props.user.id] === undefined}
                          fallback={
                            <p>
                              Your vote:{" "}
                              {pending.votes[word.id]?.[props.user.id] ? "Accept" : "Reject"}
                            </p>
                          }
                        >
                          <button
                            type="button"
                            disabled={busy()}
                            onClick={() =>
                              void command({
                                kind: "vote",
                                votes: [{ wordId: word.id, approve: true }],
                              })
                            }
                          >
                            Accept {word.text}
                          </button>
                          <button
                            type="button"
                            disabled={busy()}
                            onClick={() =>
                              void command({
                                kind: "vote",
                                votes: [{ wordId: word.id, approve: false }],
                              })
                            }
                          >
                            Reject {word.text}
                          </button>
                        </Show>
                      </Show>
                    </article>
                  )}
                </For>
              </section>
            )}
          </Show>
        </dialog>
      </Show>
      <Show when={error() && (!room() || current().phase === "waiting")}>
        <p role="alert">{error()}</p>
        <button type="button" onClick={() => location.reload()}>
          Refresh / sign in again
        </button>
      </Show>
      <Show when={connection() && (!room() || current().phase === "waiting")}>
        <small role="status">{connection()}</small>
      </Show>
    </>
  );
}
