import { appDefinition } from "../contracts/index.ts";
import { AppAppearance } from "@repo/shared/settings";
import { render } from "@solidjs/web";
import { Errored } from "solid-js";
import { Account } from "./account.tsx";
import { Planner } from "./planner.tsx";
import "@repo/shared/styles";
import "./kunludo.css";
function App() {
  return (
    <Errored
      fallback={(_error, reset) => (
        <main class="zs-main">
          <h1>Etwas ist schiefgegangen.</h1>
          <button onClick={reset}>Erneut versuchen</button>
        </main>
      )}
    >
      <Account>{(user, logout) => <Planner user={user} logout={logout} />}</Account>
    </Errored>
  );
}
const root = document.getElementById("app");
if (!root) throw new Error("Missing app mount");
render(
  () => (
    <AppAppearance appId={appDefinition.id} defaults={appDefinition.themes}>
      <App />
    </AppAppearance>
  ),
  root,
);
