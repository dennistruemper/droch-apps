import { render } from "@solidjs/web";
import { createRouter, useParams } from "@solidjs/router";
import { Show } from "solid-js";
import { AppSettings } from "@repo/shared/settings";
import { appDefinition } from "../contracts/index.ts";
import { Account } from "./account.tsx";
import { Lobby } from "./lobby.tsx";
import { Room } from "./room.tsx";
import "@repo/shared/styles";
import "./vortoj.css";
function Home() {
  return (
    <main>
      <section>
        <h1>Your next word can wait.</h1>
        <p>{appDefinition.description}</p>
      </section>
      <Account>{(user) => <Lobby user={user} />}</Account>
    </main>
  );
}
function RoomRoute() {
  const params = useParams<{ id: string }>();
  return (
    <main class="room-page">
      <Account>
        {(user) => (
          <Show when={params.id} keyed>
            {(id) => <Room id={id} user={user} />}
          </Show>
        )}
      </Account>
    </main>
  );
}
function NotFound() {
  return (
    <main>
      <h1>Page not found</h1>
      <a href="/vortoj/">Back to Vortoj</a>
    </main>
  );
}
const Router = createRouter({
  base: "/vortoj",
  routes: [
    { path: "/", component: Home },
    { path: "/room/:id", component: RoomRoute },
    { path: "*404", component: NotFound },
  ],
});
function App() {
  return (
    <>
      <header>
        <strong>Vortoj</strong>
        <nav aria-label="App navigation">
          <a href="/">All apps</a>
          <AppSettings appId="vortoj" defaultTheme={appDefinition.theme} />
        </nav>
      </header>
      <Router />
      <footer>
        <small>Droch apps · Vortoj</small>
      </footer>
    </>
  );
}
const element = document.getElementById("app");
if (!element) throw new Error("Missing app mount element");
render(() => <App />, element);
