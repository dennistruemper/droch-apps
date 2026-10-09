import { createSignal, onSettled, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { User } from "@repo/shared/contracts/auth";
import { init, update, type Message, type Transition } from "./account-model.ts";
import { execute } from "./account-commands.ts";
import { message } from "./api.ts";
export function Account(props: {
  children: (user: User, signOut: () => Promise<void>) => JSX.Element;
  layout: (
    user: () => User | null,
    signOut: () => Promise<void>,
    content: JSX.Element,
  ) => JSX.Element;
}) {
  const initial = init();
  let current = initial.model;
  const [model, setModel] = createSignal(current);
  const controller = new AbortController();

  function dispatch(event: Message): Promise<void> {
    if (controller.signal.aborted) return Promise.resolve();
    return apply(update(current, event));
  }
  async function apply(transition: Transition): Promise<void> {
    // Keep transition ordering synchronous even when Solid batches rendering.
    current = transition.model;
    setModel(current);
    for (const command of transition.commands) {
      try {
        await dispatch(await execute(command, controller.signal));
      } catch (error) {
        await dispatch({ kind: "failed", id: command.id, error: message(error) });
      }
    }
  }
  const screen = () => model().screen;
  const user = () => {
    const value = screen();
    return value.kind === "signed-in" ? value.user : null;
  };
  const email = () => {
    const value = screen();
    return value.kind === "email" || value.kind === "code" ? value.email : "";
  };
  const sent = () => screen().kind === "code";
  const instructions = () => {
    const value = screen();
    return value.kind === "code" ? value.instructions : { codeLength: 6, message: "" };
  };
  const busy = () => model().pending !== null;
  const error = () => model().error;
  const signOut = () => dispatch({ kind: "sign-out" });
  onSettled(() => {
    void apply(initial);
    return () => controller.abort();
  });
  const content = (
    <Show when={screen().kind !== "loading"} fallback={<p>Loading your account…</p>}>
      <Show
        when={user()}
        keyed
        fallback={
          <section aria-label="Sign in">
            <h2>Sign in to play</h2>
            <p>Sign in with a code. No passwords.</p>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                await dispatch({
                  kind: "submit",
                  email: String(form.get("email") ?? email()),
                  code: String(form.get("code") ?? ""),
                  name: String(form.get("name") ?? ""),
                });
              }}
            >
              <label for="email">Email address</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autocomplete="email"
                value={email()}
                readonly={sent()}
              />
              <Show when={sent()}>
                <p>{instructions().message}</p>
                <label for="code">Sign-in code</label>
                <input
                  id="code"
                  name="code"
                  inputmode="numeric"
                  pattern={`[0-9]{${instructions().codeLength}}`}
                  maxlength={instructions().codeLength}
                  autocomplete="one-time-code"
                  required
                />
                <label for="account-name">Your name</label>
                <input
                  id="account-name"
                  name="name"
                  maxlength={32}
                  autocomplete="nickname"
                  required
                />
                <small class="account-note">
                  Your display name is shared with room members. Your email stays private.
                </small>
              </Show>
              <div class="account-actions">
                <button disabled={busy()}>
                  {busy() ? "Please wait…" : sent() ? "Sign in" : "Send sign-in code"}
                </button>
                <Show when={sent()}>
                  <button
                    type="button"
                    disabled={busy()}
                    onClick={() => void dispatch({ kind: "resend" })}
                  >
                    Request another code
                  </button>
                  <button
                    type="button"
                    disabled={busy()}
                    onClick={() => void dispatch({ kind: "change-email" })}
                  >
                    Change email
                  </button>
                </Show>
              </div>
            </form>
            <Show when={error()}>
              <p role="alert">{error()}</p>
            </Show>
          </section>
        }
      >
        {(person) => (
          <>
            <Show when={error()}>
              <p role="alert">{error()}</p>
            </Show>
            {props.children(person, signOut)}
          </>
        )}
      </Show>
    </Show>
  );
  return props.layout(user, signOut, content);
}
