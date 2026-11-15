import type { User } from "@repo/shared/contracts/auth";
export type Screen =
  | { kind: "loading" }
  | { kind: "email"; email: string }
  | { kind: "code"; email: string; length: number; hint: string }
  | { kind: "name"; email: string; code: string }
  | { kind: "signed-in"; user: User };
export type Command = { id: number } & (
  | { kind: "session" }
  | { kind: "code"; email: string }
  | { kind: "verify"; email: string; code: string; name?: string }
  | { kind: "logout" }
);
export type Model = { screen: Screen; pending: Command | null; next: number; error: string };
export type Message =
  | { kind: "submit"; email: string; code: string; name: string }
  | { kind: "logout" }
  | { kind: "back" }
  | { kind: "resend" }
  | ({ id: number } & (
      | { kind: "session"; user: User | null }
      | { kind: "code-sent"; length: number; hint: string }
      | { kind: "verified"; user: User }
      | { kind: "name-needed" }
      | { kind: "logged-out" }
      | { kind: "failed"; error: string }
    ));
export const init = (): Model => ({
  screen: { kind: "loading" },
  pending: { kind: "session", id: 1 },
  next: 2,
  error: "",
});
export function update(m: Model, msg: Message): { model: Model; commands: Command[] } {
  const keep = { model: m, commands: [] };
  const start = (c: Command, screen = m.screen) => ({
    model: { ...m, screen, pending: c, next: m.next + 1, error: "" },
    commands: [c],
  });
  const done = (screen: Screen, error = "") => ({
    model: { ...m, screen, pending: null, error },
    commands: [],
  });
  if (msg.kind === "submit") {
    if (m.pending) return keep;
    if (m.screen.kind === "email")
      return start(
        { kind: "code", id: m.next, email: msg.email.trim() },
        { kind: "email", email: msg.email.trim() },
      );
    if (m.screen.kind === "code")
      return start({ kind: "verify", id: m.next, email: m.screen.email, code: msg.code });
    if (m.screen.kind === "name")
      return start({
        kind: "verify",
        id: m.next,
        email: m.screen.email,
        code: m.screen.code,
        name: msg.name.trim(),
      });
    return keep;
  }
  if (msg.kind === "logout")
    return !m.pending && m.screen.kind === "signed-in"
      ? start({ kind: "logout", id: m.next })
      : keep;
  if (msg.kind === "back")
    return !m.pending && (m.screen.kind === "code" || m.screen.kind === "name")
      ? done({ kind: "email", email: m.screen.email })
      : keep;
  if (msg.kind === "resend")
    return !m.pending && m.screen.kind === "code"
      ? start({ kind: "code", id: m.next, email: m.screen.email })
      : keep;
  if (!m.pending || m.pending.id !== msg.id) return keep;
  if (msg.kind === "failed")
    return done(m.screen.kind === "loading" ? { kind: "email", email: "" } : m.screen, msg.error);
  if (msg.kind === "session" && m.pending.kind === "session")
    return done(msg.user ? { kind: "signed-in", user: msg.user } : { kind: "email", email: "" });
  if (msg.kind === "verified" && m.pending.kind === "verify")
    return done({ kind: "signed-in", user: msg.user });
  if (msg.kind === "code-sent" && m.pending.kind === "code")
    return done({ kind: "code", email: m.pending.email, length: msg.length, hint: msg.hint });
  if (msg.kind === "name-needed" && m.pending.kind === "verify")
    return done({ kind: "name", email: m.pending.email, code: m.pending.code });
  if (msg.kind === "logged-out" && m.pending.kind === "logout")
    return done({ kind: "email", email: "" });
  return keep;
}
