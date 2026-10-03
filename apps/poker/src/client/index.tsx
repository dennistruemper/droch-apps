import { render } from "@solidjs/web";
import { createRouter } from "@solidjs/router";
import { createSignal, onCleanup } from "solid-js";
import { createAppStorage } from "@repo/shared/storage";
import { appDefinition, statusSchema } from "../contracts/index.ts";
import "@repo/shared/styles";

function Home() {
  const storage = createAppStorage(appDefinition.id, localStorage);
  const [theme, setTheme] = createSignal(storage.get("theme") ?? appDefinition.theme);
  const [status, setStatus] = createSignal("Connecting…");
  const controller = new AbortController();
  onCleanup(() => controller.abort());
  document.documentElement.dataset.theme = theme();
  void fetch(`/api/${appDefinition.id}/status`, { signal: controller.signal })
    .then(async (response) => {
      if (!response.ok) throw new Error("API unavailable");
      statusSchema.parse(await response.json());
      setStatus("Backend connected");
    })
    .catch(() => {
      if (!controller.signal.aborted) setStatus("Backend unavailable");
    });

  return (
    <>
      <header>
        <strong>{appDefinition.title}</strong>
        <a href="/">All apps</a>
      </header>
      <main>
        <section>
          <small>{status()}</small>
          <h1>A shared estimate starts here.</h1>
          <p>{appDefinition.description}</p>
        </section>
        <article>
          <h2>Room for everyone</h2>
          <p>
            Room creation, private voting, and live reveals are the next implementation milestone.
          </p>
        </article>
        <section>
          <label for="theme">Your theme</label>
          <select
            id="theme"
            value={theme()}
            onChange={(event) => {
              const nextTheme = event.currentTarget.value;
              setTheme(nextTheme);
              storage.set("theme", nextTheme);
              document.documentElement.dataset.theme = nextTheme;
            }}
          >
            <option value="paper">Paper</option>
            <option value="ink">Ink</option>
            <option value="gamegirl">Gamegirl</option>
            <option value="ocean">Ocean</option>
          </select>
        </section>
      </main>
      <footer>
        <small>Droch apps · Foundation preview</small>
      </footer>
    </>
  );
}

function NotFound() {
  return (
    <main>
      <h1>Page not found</h1>
      <a href={`/${appDefinition.id}/`}>Back to {appDefinition.title}</a>
    </main>
  );
}

const element = document.getElementById("app");
if (!element) throw new Error("Missing app mount element");
const Router = createRouter({
  base: `/${appDefinition.id}`,
  routes: [
    { path: "/", component: Home },
    { path: "*404", component: NotFound },
  ],
});
render(() => <Router />, element);
