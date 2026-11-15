import { createSignal, onSettled, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import { sessionSchema, codeInstructionsSchema, type User } from "@repo/shared/contracts/auth";
import { init, update, type Message, type Command } from "./account-model.ts";
import { request, ApiError, errorText } from "./api.ts";

export function Account(props: { children: (user: User, logout: () => void) => JSX.Element }) {
  let current = init();
  const [model, setModel] = createSignal(current);
  const controller = new AbortController();

  function dispatch(msg: Message) {
    if (controller.signal.aborted) return;
    const next = update(current, msg);
    current = next.model;
    setModel(current);

    for (const command of next.commands) void execute(command);
  }

  async function execute(c: Command) {
    try {
      if (c.kind === "session")
        dispatch({
          kind: "session",
          id: c.id,
          user: sessionSchema.parse(await request("/api/auth/session", controller.signal)).user,
        });

      if (c.kind === "code") {
        const v = codeInstructionsSchema.parse(
          await request("/api/auth/code", controller.signal, { email: c.email }),
        );

        dispatch({
          kind: "code-sent",
          id: c.id,
          length: v.codeLength,
          hint:
            v.codeLength === 4
              ? "Zum lokalen Testen: 9999."
              : "Gib den Code aus deiner E-Mail ein.",
        });
      }

      if (c.kind === "verify") {
        const v = sessionSchema.parse(
          await request("/api/auth/verify", controller.signal, {
            email: c.email,
            code: c.code,
            ...(c.name ? { name: c.name } : {}),
          }),
        );

        if (!v.user) throw new Error("Anmeldung fehlgeschlagen.");
        dispatch({ kind: "verified", id: c.id, user: v.user });
      }

      if (c.kind === "logout") {
        await request("/api/auth/logout", controller.signal, {});
        dispatch({ kind: "logged-out", id: c.id });
      }
    } catch (error) {
      dispatch(
        error instanceof ApiError && error.status === 422
          ? { kind: "name-needed", id: c.id }
          : { kind: "failed", id: c.id, error: errorText(error) },
      );
    }
  }

  onSettled(() => {
    void execute(current.pending!);

    return () => controller.abort();
  });

  const user = () => {
    const s = model().screen;

    return s.kind === "signed-in" ? s.user : null;
  };

  const email = () => {
    const s = model().screen;

    return "email" in s ? s.email : "";
  };

  const hint = () => {
    const s = model().screen;

    return s.kind === "code" ? s.hint : "";
  };

  return (
    <Show
      when={user()}
      keyed
      fallback={
        <section class="zs-login">
          <span class="zs-eyebrow">Gemeinsam planen</span>
          <h1>
            Deine Teams.
            <br />
            Ein Spielplan.
          </h1>
          <Show when={model().screen.kind !== "loading"} fallback={<p>Lädt…</p>}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);

                const text = (key: string, fallback = "") => {
                  const value = f.get(key);

                  return typeof value === "string" ? value : fallback;
                };

                dispatch({
                  kind: "submit",
                  email: text("email", email()),
                  code: text("code", ""),
                  name: text("name", ""),
                });
              }}
            >
              <Show when={model().screen.kind === "email"}>
                <label for="zs-email">E-Mail</label>
                <input
                  id="zs-email"
                  name="email"
                  type="email"
                  autocomplete="email"
                  required
                  value={email()}
                  disabled={!!model().pending}
                />
                <button disabled={!!model().pending}>Anmeldecode senden</button>
              </Show>
              <Show when={model().screen.kind === "code"}>
                <p>{email()}</p>
                <label for="zs-code">Anmeldecode</label>
                <input
                  id="zs-code"
                  name="code"
                  autocomplete="one-time-code"
                  inputmode="numeric"
                  required
                  pattern="[0-9]{4,6}"
                  disabled={!!model().pending}
                />
                <small>{hint()}</small>
                <button disabled={!!model().pending}>Anmelden</button>
                <button
                  type="button"
                  disabled={!!model().pending}
                  onClick={() => dispatch({ kind: "resend" })}
                >
                  Code erneut senden
                </button>
              </Show>
              <Show when={model().screen.kind === "name"}>
                <h2>Wie heißt du?</h2>
                <label for="zs-name">Anzeigename</label>
                <input
                  id="zs-name"
                  name="name"
                  autocomplete="nickname"
                  maxlength="32"
                  required
                  disabled={!!model().pending}
                />
                <small>Dieser Name gilt für alle deine Teams.</small>
                <button disabled={!!model().pending}>Konto erstellen</button>
              </Show>
              <Show when={model().screen.kind === "code" || model().screen.kind === "name"}>
                <button
                  type="button"
                  disabled={!!model().pending}
                  onClick={() => dispatch({ kind: "back" })}
                >
                  Andere E-Mail
                </button>
              </Show>
            </form>
          </Show>
          <Show when={model().error}>
            <p role="alert">{model().error}</p>
          </Show>
        </section>
      }
    >
      {(u) => props.children(u, () => dispatch({ kind: "logout" }))}
    </Show>
  );
}
