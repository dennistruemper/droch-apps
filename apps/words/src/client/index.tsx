import { render } from "@solidjs/web";
import { createRouter } from "@solidjs/router";
import { createSignal, onCleanup } from "solid-js";
import { AppSettings } from "@repo/shared/settings";
import { appDefinition, statusSchema } from "../contracts/index.ts";
import "@repo/shared/styles";

function Home() {
  const [status, setStatus] = createSignal("Connecting…");
  const controller = new AbortController();
  onCleanup(() => controller.abort());
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
    <main>
      <section>
        <small>{status()}</small>
        <h1>Your next word can wait.</h1>
        <p>{appDefinition.description}</p>
      </section>
      <article>
        <h2>Play together, or days apart</h2>
        <p>Durable matches and email-code accounts are planned. No turn deadline, no passwords.</p>
      </article>
    </main>
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
render(
  () => (
    <>
      <header>
        <strong>{appDefinition.title}</strong>
        <nav aria-label="App navigation">
          <a href="/">All apps</a>
          <AppSettings appId={appDefinition.id} defaultTheme={appDefinition.theme} />
        </nav>
      </header>
      <Router />
      <footer>
        <small>Droch apps · Foundation preview</small>
      </footer>
    </>
  ),
  element,
);
