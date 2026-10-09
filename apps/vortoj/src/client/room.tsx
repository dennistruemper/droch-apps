import { createSignal, onSettled, Show, For } from "solid-js";
import type { User } from "@repo/shared/contracts/auth";
import { snapshotSchema } from "../contracts/index.ts";
import { init, update, type Action, type Message } from "./room-model.ts";
import { execute } from "./room-commands.ts";
import { premium, evaluateMove } from "../domain/index.ts";
import { message, RequestError } from "./api.ts";
export function Room(props: { id: string; user: User }) {
  let state = init();
  const [model, setModel] = createSignal(state);
  // Geometry and focus belong to the browser, not the game model.
  const [zoomed, setZoomed] = createSignal(false),
    [cell, setCell] = createSignal(20),
    [fits, setFits] = createSignal(false),
    [boardFocus, setBoardFocus] = createSignal(112);
  const room = () => {
    const screen = model().screen;
    return screen.kind === "active" ? screen.room : null;
  };
  const info = () => {
    const screen = model().screen;
    return screen.kind === "invite" ? screen.info : null;
  };
  const error = () => model().error;
  const busy = () => model().pending !== null;
  const connection = () => model().connection;
  const removed = () => model().screen.kind === "removed";
  const draft = () => {
    const move = model().move;
    return move.kind === "placement" ? move.draft : [];
  };
  const selected = () => {
    const move = model().move;
    return move.kind === "placement" ? move.selected : null;
  };
  const joker = () => {
    const move = model().move;
    return move.kind === "placement" ? move.joker : "";
  };
  const jokerError = () => {
    const move = model().move;
    return move.kind === "placement" ? move.jokerError : "";
  };
  const exchange = () => {
    const move = model().move;
    return move.kind === "exchange" ? move.tiles : [];
  };
  const exchangeMode = () => model().move.kind === "exchange";
  const controller = new AbortController();
  let events: EventSource | null = null;
  const unavailable = () => state.screen.kind === "removed" || state.screen.kind === "expired";
  async function dispatch(event: Message): Promise<void> {
    if (controller.signal.aborted) return;
    const transition = update(state, event, props.user.id);
    state = transition.model;
    setModel(state);
    for (const effect of transition.commands) {
      switch (effect.kind) {
        case "load":
        case "join":
        case "action":
          try {
            await dispatch(await execute(effect, props.id, controller.signal));
          } catch (error) {
            await dispatch({
              kind: "failed",
              id: effect.id,
              status: error instanceof RequestError ? error.status : 0,
              error: message(error),
            });
          }
          break;
        case "subscribe":
          subscribe();
          break;
        case "close-stream":
          events?.close();
          events = null;
          break;
        case "close-dialogs":
          cancelAnimationFrame(approvalFrame);
          for (const dialog of [approvalDialog, actionsDialog, detailsDialog, jokerDialog])
            dialog?.close();
          break;
        case "overview":
          overview();
          break;
        case "joker-dialog":
          if (effect.open) {
            if (jokerDialog?.isConnected && !jokerDialog.open) jokerDialog.showModal();
          } else jokerDialog?.close();
          break;
        case "approval":
          if (effect.action === "close") approvalDialog?.close();
          cancelAnimationFrame(approvalFrame);
          if (effect.action === "show")
            approvalFrame = requestAnimationFrame(() => {
              if (state.screen.kind !== "active" || state.screen.room.version !== effect.version)
                return;
              detailsDialog?.close();
              document.querySelector<HTMLDialogElement>("#vortoj-rules")?.close();
              actionsDialog?.close();
              if (approvalDialog?.isConnected && !approvalDialog.open) approvalDialog.showModal();
            });
          break;
      }
    }
  }
  let viewport: HTMLDivElement | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let detailsDialog: HTMLDialogElement | undefined;
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
  function subscribe() {
    if (events || unavailable()) return;
    events = new EventSource(`/api/vortoj/rooms/${props.id}/events`);
    events.addEventListener("snapshot", (event) => {
      try {
        void dispatch({
          kind: "snapshot",
          room: snapshotSchema.parse(JSON.parse((event as MessageEvent<string>).data)),
        });
      } catch {
        void dispatch({
          kind: "error",
          text: "Could not read this game update. Refresh to recover.",
        });
      }
    });
    events.addEventListener("removed", () => void dispatch({ kind: "removed" }));
    events.addEventListener("expired", () => void dispatch({ kind: "expired" }));
    events.onerror = () =>
      void dispatch({
        kind: "connection",
        text: "Connection interrupted. Your game is saved; reconnecting…",
      });
  }
  const load = () => dispatch({ kind: "refresh" });
  const command = (action: Action) => dispatch({ kind: "action", action });
  onSettled(() => {
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && state.screen.kind === "active") void load();
    }, 10000);
    const visibility = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      controller.abort();
      cancelAnimationFrame(approvalFrame);
      cancelAnimationFrame(measureFrame);
      cancelAnimationFrame(cameraFrame);
      resizeObserver?.disconnect();
      pointer.removeEventListener("change", pointerChange);
      events?.close();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  });
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
  function selectTile(id: string) {
    void dispatch({ kind: "select-tile", id });
  }
  function navigateBoard(event: KeyboardEvent, row: number, col: number) {
    let nextRow = row,
      nextCol = col;
    switch (event.key) {
      case "ArrowUp":
        nextRow = Math.max(0, row - 1);
        break;
      case "ArrowDown":
        nextRow = Math.min(14, row + 1);
        break;
      case "ArrowLeft":
        nextCol = Math.max(0, col - 1);
        break;
      case "ArrowRight":
        nextCol = Math.min(14, col + 1);
        break;
      case "Home":
        nextCol = 0;
        if (event.ctrlKey) nextRow = 0;
        break;
      case "End":
        nextCol = 14;
        if (event.ctrlKey) nextRow = 14;
        break;
      default:
        return;
    }
    event.preventDefault();
    const square =
      viewport?.querySelectorAll<HTMLButtonElement>(".game-board button")[nextRow * 15 + nextCol];
    square?.focus({ preventScroll: true });
    square?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  function squareClick(row: number, col: number) {
    focus = { row, col };
    if (!zoomed() && !fits()) {
      zoomTo(row, col);
      return;
    }
    void dispatch({ kind: "place", row, col });
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
              onClick={() => void dispatch({ kind: "join" })}
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
                  void dispatch({ kind: "connection", text: "Invitation copied." });
                } catch {
                  void dispatch({
                    kind: "connection",
                    text: "Select and copy the invitation link to share it.",
                  });
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
                <small class="game-player">Playing as {props.user.name}</small>
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
              </nav>
            </header>
            <section class="board-workspace" aria-label="Game board">
              <Show when={!fits()}>
                <div class="board-tools">
                  <small>
                    {zoomed() ? "Swipe to explore · tap to place" : "Whole board · tap to zoom"}
                  </small>
                  <button
                    type="button"
                    onClick={() => (zoomed() ? overview() : zoomTo(focus.row, focus.col))}
                  >
                    {zoomed() ? "Whole board" : "Zoom in"}
                  </button>
                  <button type="button" aria-label="Centre board" onClick={() => zoomTo(7, 7)}>
                    Centre
                  </button>
                </div>
              </Show>
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
                          tabindex={boardFocus() === index ? 0 : -1}
                          onFocus={() => {
                            setBoardFocus(index);
                            focus = { row, col };
                          }}
                          onKeyDown={(event) => navigateBoard(event, row, col)}
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
                      onClick={() => selectTile(tile.id)}
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
                    onClick={() => void dispatch({ kind: "clear-move" })}
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
              void dispatch({ kind: "exchange" });
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
          onCancel={() => void dispatch({ kind: "joker-cancelled" })}
        >
          <div class="dialog-heading">
            <h2>Choose a joker letter</h2>
            <button
              type="button"
              aria-label="Close joker letter"
              onClick={() => {
                void dispatch({ kind: "joker-cancelled" });
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
            onInput={(event) =>
              void dispatch({ kind: "joker-changed", letter: event.currentTarget.value })
            }
          />
          <Show when={jokerError()}>
            <p role="alert">{jokerError()}</p>
          </Show>
          <button type="button" onClick={() => void dispatch({ kind: "joker-confirmed" })}>
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
                <Show when={error()}>
                  <p role="alert">{error()}</p>
                </Show>
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
        <Show
          when={removed()}
          fallback={
            <button type="button" onClick={() => location.reload()}>
              Refresh / sign in again
            </button>
          }
        >
          <a href="/vortoj/">Back to your rooms</a>
        </Show>
      </Show>
      <Show when={connection() && (!room() || current().phase === "waiting")}>
        <small role="status">{connection()}</small>
      </Show>
    </>
  );
}
