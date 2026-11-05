import { createSignal, For, Show, onSettled } from "solid-js";
import { render } from "@solidjs/web";
import "@repo/shared/styles";
import "./enigmo.css";
import { letters } from "../domain/index.ts";
import { init, update, type Message } from "./puzzle-model.ts";
import { execute, load } from "./puzzle-commands.ts";

function App() {
  let current = init(new URL(window.location.href).searchParams.get("code"), load);
  const [model, setModel] = createSignal(current);
  let disposed = false;
  onSettled(() => () => {
    disposed = true;
  });
  function dispatch(message: Message) {
    if (disposed) return;
    const transition = update(current, message);
    current = transition.model;
    setModel(current);
    for (const command of transition.commands) {
      const result = execute(command);
      if (result) dispatch(result);
    }
  }
  const entry = () => {
    const value = model();
    return value.kind === "entry" ? value : undefined;
  };
  const active = () => {
    const value = model();
    return value.kind === "puzzle" ? value : undefined;
  };
  return (
    <>
      <Show when={entry()}>
        <main class="enigmo-entry">
          <div class="entry-mark" aria-hidden="true">
            ✳
          </div>
          <h1>Enigmo</h1>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              dispatch({ kind: "open" });
            }}
          >
            <label for="code">Dein Rätselcode</label>
            <input
              id="code"
              name="code"
              type="text"
              maxlength={100}
              autocomplete="off"
              autocapitalize="characters"
              spellcheck={false}
              placeholder="Code eingeben"
              value={entry()?.code ?? ""}
              onInput={(event) => dispatch({ kind: "code", value: event.currentTarget.value })}
              required
            />
            <button type="submit" disabled={!entry()?.code.trim()}>
              Rätsel öffnen <span aria-hidden="true">↗</span>
            </button>
          </form>
        </main>
      </Show>
      <Show when={model().kind === "missing"}>
        <main class="enigmo-entry">
          <h1>Keine Spur gefunden.</h1>
          <p>
            Zu diesem Code gibt es kein Rätsel. Prüfe den Code oder frage nach dem richtigen Link.
          </p>
          <a href="/enigmo/">Anderen Code eingeben</a>
        </main>
      </Show>
      <Show when={active()}>
        {(state) => (
          <>
            <header class="enigmo-header">
              <a href="/enigmo/">Enigmo</a>
              <span>Eine kleine Schatzsuche</span>
            </header>
            <main class="enigmo-puzzle">
              <section class="intro">
                <span class="eyebrow">DEINE MISSION</span>
                <h1>{state().puzzle.title}</h1>
                <p>{state().puzzle.introduction}</p>
                <small>
                  Du kannst alle Antworten ändern. Ob alles stimmt, erfährst du erst beim Prüfen des
                  Lösungsworts.
                </small>
              </section>
              <For each={state().puzzle.questions}>
                {(question) => (
                  <fieldset class="question">
                    <legend>
                      <span class="eyebrow">{question.topic}</span>
                      <span class="question-text">{question.text}</span>
                    </legend>
                    <div class="answers">
                      <For each={question.options}>
                        {(option) => (
                          <label
                            class={[
                              "answer",
                              { selected: state().progress.answers[question.id] === option.letter },
                            ]}
                          >
                            <input
                              type="radio"
                              name={question.id}
                              value={option.letter}
                              checked={state().progress.answers[question.id] === option.letter}
                              onChange={() =>
                                dispatch({ kind: "answer", id: question.id, letter: option.letter })
                              }
                            />
                            <span class="answer-letter" aria-hidden="true">
                              {option.letter}
                            </span>
                            <span>
                              <span class="sr-only">Buchstabe {option.letter}: </span>
                              {option.text}
                            </span>
                          </label>
                        )}
                      </For>
                    </div>
                  </fieldset>
                )}
              </For>
              <section class="final-task" aria-labelledby="final-heading">
                <span class="eyebrow">DIE LETZTE AUFGABE</span>
                <h2 id="final-heading">Aus Spuren wird ein Wort.</h2>
                <Show
                  when={letters(state().puzzle, state().progress).includes("_")}
                  fallback={
                    <>
                      <p>{state().puzzle.finalTask}</p>
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          dispatch({ kind: "check" });
                        }}
                      >
                        <label for="solution">Dein Lösungswort</label>
                        <input
                          id="solution"
                          type="text"
                          maxlength={100}
                          autocomplete="off"
                          spellcheck={false}
                          value={state().progress.solution}
                          onInput={(event) =>
                            dispatch({ kind: "solution", value: event.currentTarget.value })
                          }
                          aria-describedby="solution-hint"
                        />
                        <small id="solution-hint">
                          Groß- und Kleinschreibung und Leerzeichen spielen keine Rolle.
                        </small>
                        <button type="submit">Lösung prüfen ↗</button>
                      </form>
                    </>
                  }
                >
                  <p>
                    Sammle zuerst in jeder Frage einen Buchstaben. Danach wartet hier die letzte
                    Aufgabe.
                  </p>
                </Show>
                <Show when={state().feedback === "incorrect"}>
                  <p class="feedback" role="status">
                    Der Schatz bleibt noch verborgen. Prüfe deine Antworten und das Wortspiel – du
                    kannst es beliebig oft versuchen.
                  </p>
                </Show>
                <Show when={state().feedback === "solved"}>
                  <div class="treasure" role="status">
                    <span class="eyebrow">LETZTE SPUR / IN DER ECHTEN WELT</span>
                    <h2>Finde den Schatzmeister.</h2>
                    <p>{state().puzzle.treasure}</p>
                  </div>
                </Show>
              </section>
              <Show when={state().storageFailed}>
                <p role="status">
                  Dein Browser kann den Fortschritt gerade nicht speichern. Du kannst hier weiter
                  rätseln; beim Neuladen könnten Antworten verloren gehen.
                </p>
              </Show>
            </main>
            <aside class="letter-dock" aria-label="Deine gesammelten Buchstaben">
              <div class="dock-caption">
                <strong>Deine Buchstaben</strong>
                <span>
                  {Object.keys(state().progress.answers).length} / {state().puzzle.questions.length}
                </span>
              </div>
              <div
                class="letter-slots"
                role="status"
                aria-live="polite"
                aria-label={letters(state().puzzle, state().progress).join(" ")}
              >
                <For each={letters(state().puzzle, state().progress)} keyed={false}>
                  {(letter) => (
                    <span class={["letter-slot", { empty: letter() === "_" }]}>{letter()}</span>
                  )}
                </For>
              </div>
            </aside>
          </>
        )}
      </Show>
    </>
  );
}
render(() => <App />, document.getElementById("app")!);
