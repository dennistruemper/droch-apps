import { createSignal, onCleanup, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import { createAppStorage } from "../storage/index.ts";

export type SidePanelControls = {
  trigger: () => JSX.Element;
  dismiss: () => void;
};

export function SidePanel(props: {
  appId: string;
  label?: string;
  desktopMinWidth?: number;
  menu: (controls: SidePanelControls) => JSX.Element;
  children: (controls: SidePanelControls) => JSX.Element;
}) {
  const storage = createAppStorage(props.appId, localStorage);
  const media = matchMedia(`(min-width: ${props.desktopMinWidth ?? 1280}px)`);
  const [desktop, setDesktop] = createSignal(media.matches);
  const [expanded, setExpanded] = createSignal(
    media.matches && storage.get("side-panel") !== "collapsed",
  );
  let dialog: HTMLDialogElement | undefined;
  let trigger: HTMLButtonElement | undefined;
  let mounted = true;
  const id = `${props.appId}-side-panel`;
  const label = props.label ?? "Navigation menu";
  function sync(nextExpanded = expanded(), nextDesktop = desktop()) {
    if (!dialog?.isConnected) return;
    dialog.close();
    if (nextExpanded) {
      if (nextDesktop) dialog.open = true;
      else dialog.showModal();
    }
  }
  function close() {
    setExpanded(false);
    if (desktop()) storage.set("side-panel", "collapsed");
    dialog?.close();
    trigger?.focus();
  }
  function toggle() {
    if (expanded()) close();
    else {
      setExpanded(true);
      if (desktop()) storage.set("side-panel", "expanded");
      sync(true);
    }
  }
  const resize = () => {
    const wide = media.matches;
    const open = wide && storage.get("side-panel") !== "collapsed";
    setDesktop(wide);
    setExpanded(open);
    sync(open, wide);
  };
  media.addEventListener("change", resize);
  onCleanup(() => {
    mounted = false;
    media.removeEventListener("change", resize);
    dialog?.close();
  });
  const controls: SidePanelControls = {
    dismiss: () => {
      if (!desktop()) close();
    },
    trigger: () => (
      <button
        data-panel-trigger
        type="button"
        aria-label={`${expanded() ? "Close" : "Open"} ${label.toLowerCase()}`}
        aria-controls={id}
        aria-expanded={expanded() ? "true" : "false"}
        onClick={toggle}
        ref={(element) => {
          trigger = element;
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
          <g fill="none" stroke="currentColor" stroke-width="2">
            <path data-panel-icon="top" d="M4 6h16" />
            <path data-panel-icon="middle" d="M4 12h16" />
            <path data-panel-icon="bottom" d="M4 18h16" />
          </g>
        </svg>
      </button>
    ),
  };
  return (
    <div
      data-side-panel
      data-desktop={desktop() ? "true" : "false"}
      data-expanded={expanded() ? "true" : "false"}
    >
      <dialog
        id={id}
        data-panel-dialog
        aria-label={label}
        ref={(element) => {
          dialog = element;
          queueMicrotask(() => {
            if (mounted) sync();
          });
        }}
        onKeyDown={(event) => {
          if (desktop() && event.key === "Escape") {
            event.preventDefault();
            close();
          }
        }}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget || desktop()) return;
          const box = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < box.left ||
            event.clientX > box.right ||
            event.clientY < box.top ||
            event.clientY > box.bottom
          )
            close();
        }}
      >
        <header data-panel-heading>
          <strong>Menu</strong>
          <Show when={!desktop()}>
            <button type="button" aria-label="Close menu panel" onClick={close}>
              ×
            </button>
          </Show>
        </header>
        {props.menu(controls)}
      </dialog>
      <div data-panel-main>{props.children(controls)}</div>
    </div>
  );
}
