import { render } from "@solidjs/web";
import { createSignal, For, Show, onSettled } from "solid-js";
import {
  slots,
  schedule,
  pairs,
  pairIndices,
  playerName,
  teamNames,
  rating,
  pairing,
  type Draft,
  type Side,
  type Pairing,
} from "../domain/index.ts";
import { init, update, type Message } from "./calculator-model.ts";
import { execute } from "./calculator-commands.ts";
import "@repo/shared/styles";
import "./style.css";

const sides = [0, 1] as const;
const indices = [0, 1, 2] as const;
const gameIndices = schedule.map((_, i) => i);

const handicapRows = [
  "0–50",
  "51–150",
  "151–250",
  "251–350",
  "351–450",
  "451–550",
  "551–650",
  "651–750",
  "Über 750",
];

function Team(props: { draft: Draft; side: Side; dispatch: (message: Message) => void }) {
  const index = (i: number) => i + props.side * 3;

  return (
    <fieldset class="team">
      <legend>{teamNames[props.side]}</legend>
      <div class="column-labels" aria-hidden="true">
        <span>Position & Name</span>
        <span>Live-PZ</span>
      </div>
      <For each={indices}>
        {(i) => (
          <div class="player-row">
            <span class="slot" aria-hidden="true">
              {slots[index(i)]}
            </span>
            <label class="sr-only" for={`name-${index(i)}`}>
              Name {slots[index(i)]}
            </label>
            <input
              id={`name-${index(i)}`}
              placeholder={`Spieler/in ${slots[index(i)]}`}
              maxlength={64}
              autocomplete="off"
              value={props.draft.players[index(i)]!.name}
              onInput={(event) =>
                props.dispatch({
                  kind: "edit-player",
                  index: index(i),
                  field: "name",
                  value: event.currentTarget.value,
                })
              }
            />
            <label class="sr-only" for={`rating-${index(i)}`}>
              Live-PZ {slots[index(i)]}
            </label>
            <input
              id={`rating-${index(i)}`}
              class="rating"
              type="text"
              inputmode="numeric"
              placeholder="z. B. 1250"
              maxlength={5}
              aria-describedby={`rating-error-${index(i)}`}
              aria-invalid={
                props.draft.players[index(i)]!.rating !== "" &&
                rating(props.draft.players[index(i)]!.rating) === null
                  ? "true"
                  : "false"
              }
              value={props.draft.players[index(i)]!.rating}
              onInput={(event) =>
                props.dispatch({
                  kind: "edit-player",
                  index: index(i),
                  field: "rating",
                  value: event.currentTarget.value,
                })
              }
            />
            <Show
              when={
                props.draft.players[index(i)]!.rating !== "" &&
                rating(props.draft.players[index(i)]!.rating) === null
              }
            >
              <small id={`rating-error-${index(i)}`} class="field-error" role="alert">
                Live-PZ: ganze Zahl von 0 bis 10000.
              </small>
            </Show>
          </div>
        )}
      </For>
      <div class="double-select">
        <label for={`double-${props.side}`}>Doppel</label>
        <select
          id={`double-${props.side}`}
          value={props.draft.doubles[props.side] ?? ""}
          onChange={(event) =>
            props.dispatch({ kind: "doubles", side: props.side, value: event.currentTarget.value })
          }
        >
          <option value="">Noch offen</option>
          <For each={pairs}>
            {(pair) => (
              <option value={pair}>
                {pairIndices[pair].map((i) => playerName(props.draft, index(i))).join(" / ")}
              </option>
            )}
          </For>
        </select>
      </div>
    </fieldset>
  );
}

function Game(props: { draft: Draft; index: number }) {
  const game = () => pairing(props.draft, props.index)!;

  const ready = (): Extract<Pairing, { kind: "ready" }> | null => {
    const value = game();

    return value.kind === "ready" ? value : null;
  };

  const recipient = () => {
    const value = ready();

    if (!value) return "";

    return value.start[0] > 0 ? value.names[0] : value.start[1] > 0 ? value.names[1] : "";
  };

  const pendingReason = () => {
    const value = game();

    return value.kind === "pending" ? value.reason : "";
  };

  return (
    <li class={["game", { "double-game": props.index === 3 }]}>
      <div class="game-order">
        <span class="game-number">{props.index + 1}</span>
        <strong>{game().label}</strong>
      </div>
      <div class="game-players">
        <span>{game().names[0]}</span>
        <span class="versus">gegen</span>
        <span>{game().names[1]}</span>
        <Show when={ready()}>
          {(value) => (
            <small class="rating-detail">
              Live-PZ {value().ratings[0]} : {value().ratings[1]} · Differenz{" "}
              {Math.abs(value().ratings[0] - value().ratings[1])}
            </small>
          )}
        </Show>
      </div>
      <div class="game-handicap">
        <Show
          when={ready()}
          fallback={
            <>
              <strong class="pending-score">— : —</strong>
              <small>{pendingReason()}</small>
            </>
          }
        >
          {(value) => (
            <>
              <strong
                class="start-score"
                aria-label={`Satzstart ${value().start[0]} zu ${value().start[1]}`}
              >
                {value().start[0]} : {value().start[1]}
              </strong>
              <small>{recipient() ? `Vorgabe für ${recipient()}` : "Ohne Vorgabe"}</small>
            </>
          )}
        </Show>
      </div>
    </li>
  );
}

function App() {
  const initial = init();

  let current = initial.model,
    disposed = false;

  const [model, setModel] = createSignal(current);

  function dispatch(message: Message) {
    if (disposed) return;
    const transition = update(current, message);
    current = transition.model;
    setModel(current);

    for (const command of transition.commands) {
      const response = execute(command);

      if (response) dispatch(response);
    }
  }

  onSettled(() => {
    for (const command of initial.commands) {
      const response = execute(command);

      if (response) dispatch(response);
    }

    return () => {
      disposed = true;
    };
  });

  const draft = () => {
    const screen = model().screen;

    return screen.kind === "editing" ? screen.draft : null;
  };

  const calculated = () => {
    const value = draft();

    return value ? gameIndices.filter((i) => pairing(value, i)?.kind === "ready").length : 0;
  };

  return (
    <>
      <header>
        <a class="brand" href="/avantago/">
          Avantaĝo
        </a>
        <a href="/">Alle Apps</a>
      </header>
      <main>
        <Show when={model().warning}>
          <p role="alert" class="storage-warning">
            {model().warning}
          </p>
        </Show>
        <Show when={draft()} fallback={<p>Aufstellung wird geladen…</p>}>
          {(value) => (
            <>
              <section class="lineup" aria-labelledby="lineup-title">
                <div class="section-heading">
                  <h1 id="lineup-title">Aufstellung</h1>
                  <button class="quiet" type="button" onClick={() => dispatch({ kind: "reset" })}>
                    Zurücksetzen
                  </button>
                </div>
                <div class="teams">
                  <For each={sides}>
                    {(side) => <Team draft={value()} side={side} dispatch={dispatch} />}
                  </For>
                </div>
              </section>
              <section aria-labelledby="schedule-title">
                <div class="section-heading">
                  <h2 id="schedule-title">Spielplan</h2>
                  <span role="status" class="progress">
                    {calculated()} / 10 berechnet
                  </span>
                </div>
                <p class="section-note">
                  Satzstart · <strong>Heim : Gast</strong>
                </p>
                <ol class="games">
                  <For each={gameIndices}>{(index) => <Game draft={value()} index={index} />}</For>
                </ol>
              </section>
            </>
          )}
        </Show>
        <details class="rules">
          <summary>Vorgabetabelle & Spielregeln</summary>
          <div class="rules-content">
            <div>
              <h2>Die Vorgabe pro Satz</h2>
              <p>
                Die schwächere Seite startet mit den Vorgabepunkten, die stärkere bei 0. Bis
                einschließlich 50 Punkten Differenz gibt es keine Vorgabe.
              </p>
              <table>
                <caption>Live-PZ-Differenz und Vorgabepunkte</caption>
                <thead>
                  <tr>
                    <th scope="col">Differenz</th>
                    <th scope="col">Vorgabe</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={handicapRows}>
                    {(row, i) => (
                      <tr>
                        <th scope="row">{row}</th>
                        <td>{i()}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
            <div>
              <h2>Vor dem ersten Aufschlag</h2>
              <p>
                Jede Mannschaft legt die aktuelle, bei tt-live veröffentlichte Live-PZ ihrer
                Spieler/innen vor Spielbeginn vor.
              </p>
              <p>
                Im Einzel zählt die jeweilige Live-PZ. Im Doppel zählt je Seite die höhere Live-PZ,
                kein Durchschnitt.
              </p>
              <p>Der Aufschlag wird ausgelost.</p>
              <p>
                Die Aufstellung ist frei wählbar. Das Doppel kann nach den ersten drei Einzeln
                aufgestellt werden.
              </p>
              <h2>Wann ist Schluss?</h2>
              <p>
                Wer zuerst 6 Spiele gewinnt, gewinnt das Pokalspiel. Bei 5 : 5 entscheidet das
                bessere Satzverhältnis. Ist auch dieses gleich, entscheidet das gewonnene Doppel.
              </p>
              <p class="source-note">
                Grundlage: bereitgestellter Kreispokal-Regelauszug, Stand Juni 2014.
              </p>
            </div>
          </div>
        </details>
      </main>
    </>
  );
}

const element = document.getElementById("app");

if (!element) throw new Error("Missing app mount element");

render(() => <App />, element);
