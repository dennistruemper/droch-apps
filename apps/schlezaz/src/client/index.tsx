import { createSignal, For, Show, onSettled } from "solid-js";
import { render } from "@solidjs/web";
import "@repo/shared/styles";
import "./schlezaz.css";
import { modes, validOptions } from "../domain/index.ts";
import { init, update, busy, type Message } from "./generator-model.ts";
import { execute } from "./generator-commands.ts";

function App() {
  let current = init();
  const [model, setModel] = createSignal(current);
  const controller = new AbortController();
  onSettled(() => () => controller.abort());
  function dispatch(message: Message) {
    if (controller.signal.aborted) return;
    const transition = update(current, message);
    current = transition.model;
    setModel(current);
    for (const command of transition.commands) {
      void execute(command, controller.signal)
        .then(dispatch)
        .catch(() => dispatch({ kind: "failed", requestId: command.requestId }));
    }
  }
  const ready = () => validOptions(model().rows.map((row) => row.value)).length >= 2;
  const result = () => {
    const phase = model().phase;
    return phase.kind === "result" ? phase : null;
  };
  return (
    <>
      <header class="site-header">
        <a href="/">← Alle Apps</a>
        <span>Entscheidungen mit fragwürdigem Ausgang.</span>
      </header>
      <main class="schlezaz">
        <section class="opening" aria-labelledby="title">
          <span class="eyebrow">100% SCHLECHT GARANTIERT</span>
          <h1 id="title">
            Schle<span>ZaZ</span>
            <span class="title-star" aria-hidden="true">
              ✦
            </span>
          </h1>
          <p>
            Schlechtester Zufallsgenerator <em>aller Zeiten.</em>
          </p>
          <div class="warning">ACHTUNG! Kann Spuren von Zufall enthalten.</div>
        </section>
        <div class="generator-layout">
          <section class="mode-section" aria-labelledby="mode-heading">
            <h2 id="mode-heading">
              <span class="step">01</span> Wähle dein Übel.
            </h2>
            <div class="modes">
              <For each={modes}>
                {(mode) => (
                  <button
                    type="button"
                    class={["mode", { selected: model().mode === mode.id }]}
                    aria-pressed={model().mode === mode.id ? "true" : "false"}
                    disabled={busy(model())}
                    onClick={() => dispatch({ kind: "mode", mode: mode.id })}
                  >
                    <span class="mode-icon" aria-hidden="true">
                      {mode.icon}
                    </span>
                    <span>
                      <strong>{mode.name}</strong>
                      <small>{mode.subtitle}</small>
                    </span>
                    <span class="mode-indicator" aria-hidden="true">
                      {model().mode === mode.id ? "●" : "○"}
                    </span>
                  </button>
                )}
              </For>
            </div>
            <p class="mode-description">
              {modes.find((mode) => mode.id === model().mode)?.description}
            </p>
          </section>
          <section class="options-section" aria-labelledby="options-heading">
            <h2 id="options-heading">
              <span class="step">02</span> Deine Optionen.
            </h2>
            <p class="muted">Große Fragen. Kleine Entscheidungen. Mindestens zwei.</p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                dispatch({ kind: "generate" });
              }}
            >
              <div class="option-list">
                <For each={model().rows} keyed={(row) => row.id}>
                  {(row, index) => (
                    <div class="option-row">
                      <label for={`option-${row().id}`} class="option-number">
                        {String(index() + 1).padStart(2, "0")}
                        <span class="sr-only">. Option</span>
                      </label>
                      <input
                        id={`option-${row().id}`}
                        aria-label={`Option ${index() + 1}`}
                        type="text"
                        placeholder={`Option ${index() + 1}`}
                        value={row().value}
                        disabled={busy(model())}
                        onInput={(event) =>
                          dispatch({ kind: "edit", id: row().id, value: event.currentTarget.value })
                        }
                      />
                      <button
                        class="remove-option"
                        type="button"
                        aria-label={`Option ${index() + 1} entfernen`}
                        disabled={busy(model()) || model().rows.length <= 2}
                        onClick={() => dispatch({ kind: "remove", id: row().id })}
                      >
                        ×
                      </button>
                    </div>
                  )}
                </For>
              </div>
              <button
                class="add-option"
                type="button"
                disabled={busy(model())}
                onClick={() => dispatch({ kind: "add" })}
              >
                + Weitere Option hinzufügen
              </button>
              <button class="generate" type="submit" disabled={!ready() || busy(model())}>
                {busy(model()) ? "Wird zufällig …" : "JETZT GENERIEREN!"}
                <span aria-hidden="true">↗</span>
              </button>
              <Show when={!ready()}>
                <p class="input-hint">Bitte mindestens zwei ausgefüllte Optionen eingeben.</p>
              </Show>
            </form>
          </section>
        </div>
        <section
          class={["result", { "has-result": !!result() }]}
          aria-label="Auslosung"
          aria-live="polite"
          aria-atomic="true"
          aria-busy={busy(model()) ? "true" : "false"}
        >
          <Show when={busy(model())}>
            <div class="loading-reel" aria-hidden="true">
              ✦
            </div>
            <h2>WIRD ZUFÄLLIG …</h2>
            <p>Spannung braucht Zeit. Zwischen 2 und 10 Sekunden, um genau zu sein.</p>
            <div class="loading-track" aria-hidden="true">
              <span />
            </div>
          </Show>
          <Show when={result()}>
            {(value) => (
              <>
                <span class="eyebrow">SENSATIONELL! DAS ERGEBNIS:</span>
                <h2 class="result-value">{value().value}</h2>
                <p>{modes.find((mode) => mode.id === value().mode)?.name}</p>
                <button type="button" onClick={() => dispatch({ kind: "clear" })}>
                  Ergebnis ausblenden
                </button>
              </>
            )}
          </Show>
          <Show when={!busy(model()) && !result()}>
            <span class="standby-star" aria-hidden="true">
              ✳
            </span>
            <h2>Hier könnte dein Zufall stehen.</h2>
            <p>Keine Garantie. Außer auf schlechte Unterhaltung.</p>
          </Show>
        </section>
        <Show when={model().error}>
          <p role="alert">{model().error}</p>
        </Show>
        <footer class="schlezaz-footer">
          <strong>Inspiriert von SchleFaZ.</strong>
          <span>Die schlechtesten Filme aller Zeiten. Jetzt auch als Entscheidungshilfe.</span>
          <small>
            Mit Liebe und furchtbaren Entscheidungen gemacht. Deine Optionen bleiben in diesem Tab.
          </small>
        </footer>
      </main>
    </>
  );
}
render(() => <App />, document.getElementById("app")!);
