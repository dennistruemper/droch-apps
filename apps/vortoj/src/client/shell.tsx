import { Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { User } from "@repo/shared/contracts/auth";
import { SidePanel } from "@repo/shared/navigation";
import { AppSettings } from "@repo/shared/settings";
import { appDefinition } from "../contracts/index.ts";
import { Rules } from "./rules.tsx";
export function Shell(props: {
  user: () => User | null;
  signOut: () => Promise<void>;
  children: JSX.Element;
}) {
  let openSettings = () => {};
  let openRules = () => {};
  return (
    <>
      <AppSettings
        appId="vortoj"
        defaultTheme={appDefinition.theme}
        trigger={(open) => {
          openSettings = open;
          return null;
        }}
      />
      <Rules
        trigger={(open) => {
          openRules = open;
          return null;
        }}
      />
      <SidePanel
        appId="vortoj"
        label="Vortoj menu"
        menu={(panel) => (
          <nav data-panel-navigation aria-label="Vortoj navigation">
            <button
              type="button"
              onClick={() => {
                panel.dismiss();
                openRules();
              }}
            >
              Rules
            </button>
            <a href="/vortoj/">Your rooms</a>
            <button
              type="button"
              onClick={() => {
                panel.dismiss();
                openSettings();
              }}
            >
              Settings
            </button>
            <Show when={props.user()}>
              <hr />
              <button
                type="button"
                onClick={() => {
                  panel.dismiss();
                  void props.signOut();
                }}
              >
                Sign out
              </button>
            </Show>
            <a data-panel-return href="/">
              ← All apps
            </a>
          </nav>
        )}
      >
        {(panel) => (
          <div class="vortoj-page-shell">
            <div class="vortoj-menu-trigger">{panel.trigger()}</div>
            <header class="vortoj-page-heading">
              <strong>Vortoj</strong>
              <Show when={props.user()} keyed>
                {(person) => <small>Playing as {person.name}</small>}
              </Show>
            </header>
            <main class="vortoj-content">{props.children}</main>
          </div>
        )}
      </SidePanel>
    </>
  );
}
