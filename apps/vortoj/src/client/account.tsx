import { createSignal, onCleanup, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import { sessionSchema, codeInstructionsSchema, type User } from "@repo/shared/contracts/auth";
import { request, message } from "./api.ts";
export function Account(props: { children: (user: User) => JSX.Element }) {
  const [user, setUser] = createSignal<User | null>(null),
    [loaded, setLoaded] = createSignal(false),
    [email, setEmail] = createSignal(""),
    [sent, setSent] = createSignal(false),
    [instructions, setInstructions] = createSignal({ codeLength: 6, message: "" }),
    [busy, setBusy] = createSignal(false),
    [error, setError] = createSignal("");
  const controller = new AbortController();
  onCleanup(() => controller.abort());
  void request("/api/auth/session", undefined, "GET", controller.signal)
    .then((data) => setUser(sessionSchema.parse(data).user))
    .catch((error) => {
      if (!controller.signal.aborted) setError(message(error));
    })
    .finally(() => setLoaded(true));
  return (
    <Show when={loaded()} fallback={<p>Loading your account…</p>}>
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
                setBusy(true);
                setError("");
                const form = new FormData(event.currentTarget);
                try {
                  const address = String(form.get("email") ?? email()).trim();
                  setEmail(address);
                  if (sent()) {
                    const data = await request("/api/auth/verify", {
                      email: address,
                      code: String(form.get("code") ?? ""),
                      name: String(form.get("name") ?? ""),
                    });
                    setUser(sessionSchema.parse(data).user);
                  } else {
                    setInstructions(
                      codeInstructionsSchema.parse(
                        await request("/api/auth/code", { email: address }),
                      ),
                    );
                    setSent(true);
                  }
                } catch (error) {
                  setError(message(error));
                } finally {
                  setBusy(false);
                }
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
              <button disabled={busy()}>
                {busy() ? "Please wait…" : sent() ? "Sign in" : "Send sign-in code"}
              </button>
              <Show when={sent()}>
                <button
                  type="button"
                  disabled={busy()}
                  onClick={() => {
                    setSent(false);
                    setError("");
                  }}
                >
                  Request another code
                </button>
              </Show>
            </form>
            <Show when={error()}>
              <p role="alert">{error()}</p>
            </Show>
          </section>
        }
      >
        {(person) => (
          <>
            <div class="account-bar">
              <small>Playing as {person.name}</small>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await request("/api/auth/logout", {});
                    setUser(null);
                    setSent(false);
                  } catch (error) {
                    setError(message(error));
                  }
                }}
              >
                Sign out
              </button>
            </div>
            <Show when={error()}>
              <p role="alert">{error()}</p>
            </Show>
            {props.children(person)}
          </>
        )}
      </Show>
    </Show>
  );
}
