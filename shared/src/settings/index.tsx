import { createSignal, For, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import { createAppStorage } from "../storage/index.ts";

const fonts = [
  {
    value: "sans",
    label: "System sans-serif",
    stack: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  },
  {
    value: "serif",
    label: "Serif",
    stack: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
  },
  {
    value: "mono",
    label: "Monospace",
    stack: 'ui-monospace, "Cascadia Mono", Menlo, Consolas, monospace',
  },
] as const;
type Font = (typeof fonts)[number]["value"];
type CustomTheme = { background: string; foreground: string; font: Font };
const defaultCustomTheme: CustomTheme = {
  background: "#ffffff",
  foreground: "#111111",
  font: "sans",
};
const validColor = (value: unknown): value is string =>
  typeof value === "string" && /^#[a-f0-9]{6}$/i.test(value);
function readCustomTheme(value: string | null): CustomTheme | null {
  try {
    const data: unknown = JSON.parse(value ?? "null");
    if (
      data &&
      typeof data === "object" &&
      "background" in data &&
      "foreground" in data &&
      validColor(data.background) &&
      validColor(data.foreground)
    )
      return {
        background: data.background,
        foreground: data.foreground,
        font: fonts.find((choice) => "font" in data && choice.value === data.font)?.value ?? "sans",
      };
  } catch {
    /* Ignore malformed browser preferences. */
  }
  return null;
}
function nativeScheme(background: string) {
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(background.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
  return luminance < 0.179 ? "dark" : "light";
}
const themes = [
  { value: "paper", label: "Paper" },
  { value: "antique-paper", label: "Antique paper" },
  { value: "ink", label: "Ink" },
  { value: "gamegirl", label: "Gamegirl" },
  { value: "ocean", label: "Ocean" },
  { value: "custom", label: "Custom" },
] as const;

export function AppSettings(props: {
  appId: string;
  defaultTheme: string;
  trigger?: (open: () => void) => JSX.Element;
}) {
  const storage = createAppStorage(props.appId, localStorage);
  const saved = storage.get("theme");
  let savedCustomTheme = readCustomTheme(storage.get("custom-theme"));
  const [customTheme, setCustomTheme] = createSignal(savedCustomTheme ?? defaultCustomTheme);
  const [theme, setTheme] = createSignal(
    themes.some((choice) => choice.value === saved) ? saved! : props.defaultTheme,
  );
  const root = document.documentElement;
  function applyTheme(next: string, palette = customTheme()) {
    root.dataset.theme = next;
    if (next === "custom") {
      root.style.setProperty("--color-bg", palette.background);
      root.style.setProperty("--color-fg", palette.foreground);
      root.style.setProperty(
        "--font-body",
        fonts.find((choice) => choice.value === palette.font)!.stack,
      );
      root.style.colorScheme = nativeScheme(palette.background);
    } else {
      root.style.removeProperty("--color-bg");
      root.style.removeProperty("--color-fg");
      root.style.removeProperty("--font-body");
      root.style.removeProperty("color-scheme");
    }
  }
  function saveCustomTheme(next: CustomTheme) {
    savedCustomTheme = next;
    setCustomTheme(next);
    storage.set("custom-theme", JSON.stringify(next));
    applyTheme("custom", next);
  }
  function chooseTheme(next: string) {
    if (next === "custom" && !savedCustomTheme) {
      const style = getComputedStyle(root);
      // Production CSS minification shortens hex colors; color inputs need six digits.
      const presetColor = (property: string) =>
        style
          .getPropertyValue(property)
          .trim()
          .replace(/^#([a-f\d])([a-f\d])([a-f\d])$/i, "#$1$1$2$2$3$3");
      const background = presetColor("--color-bg");
      const foreground = presetColor("--color-fg");
      const currentFont = style.fontFamily;
      const font: Font = currentFont.includes("monospace")
        ? "mono"
        : currentFont.includes("serif") && !currentFont.includes("sans-serif")
          ? "serif"
          : "sans";
      saveCustomTheme(
        validColor(background) && validColor(foreground)
          ? { background, foreground, font }
          : defaultCustomTheme,
      );
    }
    setTheme(next);
    storage.set("theme", next);
    applyTheme(next);
  }
  applyTheme(theme());
  let dialog: HTMLDialogElement | undefined;
  const headingId = `${props.appId}-settings-title`;
  const themeId = `${props.appId}-theme`;
  return (
    <>
      {props.trigger ? (
        props.trigger(() => dialog?.showModal())
      ) : (
        <button type="button" onClick={() => dialog?.showModal()}>
          Settings
        </button>
      )}
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
              onChange={(event) => chooseTheme(event.currentTarget.value)}
            >
              <For each={themes}>
                {(choice) => <option value={choice.value}>{choice.label}</option>}
              </For>
            </select>
          </section>
          <Show when={theme() === "custom"}>
            <fieldset data-custom-theme>
              <legend>Custom theme</legend>
              <label for={`${props.appId}-background`}>Background color</label>
              <input
                id={`${props.appId}-background`}
                type="color"
                value={customTheme().background}
                onInput={(event) =>
                  saveCustomTheme({ ...customTheme(), background: event.currentTarget.value })
                }
              />
              <label for={`${props.appId}-foreground`}>Text and border color</label>
              <input
                id={`${props.appId}-foreground`}
                type="color"
                value={customTheme().foreground}
                onInput={(event) =>
                  saveCustomTheme({ ...customTheme(), foreground: event.currentTarget.value })
                }
              />
              <label for={`${props.appId}-font`}>Font</label>
              <select
                id={`${props.appId}-font`}
                value={customTheme().font}
                onChange={(event) => {
                  const font = fonts.find((choice) => choice.value === event.currentTarget.value);
                  if (font) saveCustomTheme({ ...customTheme(), font: font.value });
                }}
              >
                <For each={fonts}>{(font) => <option value={font.value}>{font.label}</option>}</For>
              </select>
              <small>
                Changes preview immediately and are saved for this app. Buttons use the same two
                colors.
              </small>
              <button type="button" onClick={() => chooseTheme(props.defaultTheme)}>
                Use app default
              </button>
            </fieldset>
          </Show>
          <button type="button" onClick={() => dialog?.close()}>
            Close settings
          </button>
        </section>
      </dialog>
    </>
  );
}
