import { createSignal, For } from "solid-js";
import { createAppStorage } from "../storage/index.ts";

const themes = [
  { value: "paper", label: "Paper" },
  { value: "ink", label: "Ink" },
  { value: "gamegirl", label: "Gamegirl" },
  { value: "ocean", label: "Ocean" },
] as const;

export function AppSettings(props: { appId: string; defaultTheme: string }) {
  const storage = createAppStorage(props.appId, localStorage);
  const saved = storage.get("theme");
  const [theme, setTheme] = createSignal(
    themes.some((choice) => choice.value === saved) ? saved! : props.defaultTheme,
  );
  document.documentElement.dataset.theme = theme();
  let dialog: HTMLDialogElement | undefined;
  const headingId = `${props.appId}-settings-title`;
  const themeId = `${props.appId}-theme`;
  return (
    <>
      <button type="button" onClick={() => dialog?.showModal()}>
        Settings
      </button>
      <dialog
        data-app-settings
        aria-labelledby={headingId}
        ref={(element) => {
          dialog = element;
        }}
      >
        <section>
          <h2 id={headingId}>Settings</h2>
          <section>
            <label for={themeId}>Your theme</label>
            <select
              id={themeId}
              value={theme()}
              onChange={(event) => {
                const next = event.currentTarget.value;
                setTheme(next);
                storage.set("theme", next);
                document.documentElement.dataset.theme = next;
              }}
            >
              <For each={themes}>
                {(choice) => <option value={choice.value}>{choice.label}</option>}
              </For>
            </select>
          </section>
          <button type="button" onClick={() => dialog?.close()}>
            Close settings
          </button>
        </section>
      </dialog>
    </>
  );
}
