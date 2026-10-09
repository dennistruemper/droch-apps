import { render } from "@solidjs/web";
import type { JSX } from "@solidjs/web";
import type { User } from "@repo/shared/contracts/auth";
import { createRouter, useParams } from "@solidjs/router";
import { Show } from "solid-js";
import { appDefinition } from "../contracts/index.ts";
import { Account } from "./account.tsx";
import { Lobby } from "./lobby.tsx";
import { Room } from "./room.tsx";
import { Shell } from "./shell.tsx";
import "@repo/shared/styles";
import "./vortoj.css";
function layout(user: () => User | null, signOut: () => Promise<void>, content: JSX.Element) {
  return (
    <Shell user={user} signOut={signOut}>
      {content}
    </Shell>
  );
}
function Home() {
  return (
    <Account
      layout={(user, signOut, content) =>
        layout(
          user,
          signOut,
          <>
            <section>
              <h1>Your next word can wait.</h1>
              <p>{appDefinition.description}</p>
            </section>
            {content}
          </>,
        )
      }
    >
      {(user) => <Lobby user={user} />}
    </Account>
  );
}
function RoomRoute() {
  const params = useParams<{ id: string }>();
  return (
    <Account layout={layout}>
      {(user) => (
        <div class="room-page">
          <Show when={params.id} keyed>
            {(id) => <Room id={id} user={user} />}
          </Show>
        </div>
      )}
    </Account>
  );
}
function NotFound() {
  return (
    <Account
      layout={(user, signOut) =>
        layout(
          user,
          signOut,
          <>
            <h1>Page not found</h1>
            <a href="/vortoj/">Back to Vortoj</a>
          </>,
        )
      }
    >
      {() => null}
    </Account>
  );
}
function App() {
  const Router = createRouter({
    base: "/vortoj",
    routes: [
      { path: "/", component: Home },
      { path: "/room/:id", component: RoomRoute },
      { path: "*404", component: NotFound },
    ],
  });
  return <Router />;
}
const element = document.getElementById("app");
if (!element) throw new Error("Missing app mount element");
render(() => <App />, element);
