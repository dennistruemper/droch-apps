import type { User } from "@repo/shared/contracts/auth";

export type Instructions = { codeLength: 4 | 6; message: string };
export type Screen =
  | { kind: "loading" }
  | { kind: "email"; email: string }
  | { kind: "code"; email: string; instructions: Instructions }
  | { kind: "signed-in"; user: User };
export type Command = { id: number } & (
  | { kind: "load-session" }
  | { kind: "send-code"; email: string }
  | { kind: "verify"; email: string; code: string; name: string }
  | { kind: "sign-out" }
);
export type Model = {
  screen: Screen;
  pending: Command | null;
  nextId: number;
  error: string;
};
export type Message =
  | { kind: "submit"; email: string; code: string; name: string }
  | { kind: "resend" }
  | { kind: "change-email" }
  | { kind: "sign-out" }
  | { kind: "session-loaded"; id: number; user: User | null }
  | { kind: "code-sent"; id: number; instructions: Instructions }
  | { kind: "verified"; id: number; user: User }
  | { kind: "signed-out"; id: number }
  | { kind: "failed"; id: number; error: string };
export type Transition = { model: Model; commands: Command[] };

export function init(): Transition {
  const command: Command = { kind: "load-session", id: 1 };
  return {
    model: { screen: { kind: "loading" }, pending: command, nextId: 2, error: "" },
    commands: [command],
  };
}

/** Pure transitions describe effects; the component's runner executes them. */
export function update(model: Model, message: Message): Transition {
  const unchanged = { model, commands: [] };
  const start = (command: Command, screen = model.screen): Transition => ({
    model: { screen, pending: command, nextId: model.nextId + 1, error: "" },
    commands: [command],
  });
  const finish = (screen: Screen, error = ""): Transition => ({
    model: { ...model, screen, pending: null, error },
    commands: [],
  });
  switch (message.kind) {
    case "submit": {
      if (model.pending) return unchanged;
      if (model.screen.kind === "email") {
        const email = message.email.trim();
        return start({ kind: "send-code", id: model.nextId, email }, { kind: "email", email });
      }
      if (model.screen.kind === "code")
        return start({
          kind: "verify",
          id: model.nextId,
          email: model.screen.email,
          code: message.code,
          name: message.name,
        });
      return unchanged;
    }
    case "change-email":
      return !model.pending && model.screen.kind === "code"
        ? finish({ kind: "email", email: model.screen.email })
        : unchanged;
    case "resend":
      return !model.pending && model.screen.kind === "code"
        ? start({ kind: "send-code", id: model.nextId, email: model.screen.email })
        : unchanged;
    case "sign-out":
      return !model.pending && model.screen.kind === "signed-in"
        ? start({ kind: "sign-out", id: model.nextId })
        : unchanged;
    default:
      if (!model.pending || message.id !== model.pending.id) return unchanged;
      switch (message.kind) {
        case "session-loaded":
          return model.pending.kind === "load-session"
            ? finish(
                message.user
                  ? { kind: "signed-in", user: message.user }
                  : { kind: "email", email: "" },
              )
            : unchanged;
        case "code-sent":
          return model.pending.kind === "send-code"
            ? finish({
                kind: "code",
                email: model.pending.email,
                instructions: message.instructions,
              })
            : unchanged;
        case "verified":
          return model.pending.kind === "verify"
            ? finish({ kind: "signed-in", user: message.user })
            : unchanged;
        case "signed-out":
          return model.pending.kind === "sign-out"
            ? finish({ kind: "email", email: "" })
            : unchanged;
        case "failed":
          return finish(
            model.screen.kind === "loading" ? { kind: "email", email: "" } : model.screen,
            message.error,
          );
      }
  }
}
