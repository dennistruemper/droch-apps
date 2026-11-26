import { emptyDraft, pairs, type Draft, type Side } from "../domain/index.ts";

export type Model = {
  screen: { kind: "loading" } | { kind: "editing"; draft: Draft };
  warning: string;
};

export type Message =
  | { kind: "loaded"; draft: Draft; warning: string }
  | { kind: "edit-player"; index: number; field: "name" | "rating"; value: string }
  | { kind: "doubles"; side: Side; value: string }
  | { kind: "reset" }
  | { kind: "reset-confirmed" }
  | { kind: "storage-failed" };

export type Command = { kind: "load" } | { kind: "save"; draft: Draft } | { kind: "confirm-reset" };

export type Transition = { model: Model; commands: Command[] };

export function init(): Transition {
  return { model: { screen: { kind: "loading" }, warning: "" }, commands: [{ kind: "load" }] };
}

export function update(model: Model, message: Message): Transition {
  const unchanged: Transition = { model, commands: [] };

  const finish = (draft: Draft): Transition => ({
    model: { ...model, screen: { kind: "editing", draft } },
    commands: [{ kind: "save", draft }],
  });

  if (message.kind === "loaded")
    return model.screen.kind === "loading"
      ? {
          model: { screen: { kind: "editing", draft: message.draft }, warning: message.warning },
          commands: [],
        }
      : unchanged;

  if (message.kind === "storage-failed")
    return {
      model: {
        ...model,
        warning:
          "Speichern ist nicht möglich. Deine Eingaben bleiben nur bis zum Schließen oder Neuladen geöffnet.",
      },
      commands: [],
    };

  if (model.screen.kind === "loading") return unchanged;
  const draft = model.screen.draft;

  switch (message.kind) {
    case "reset":
      return { model, commands: [{ kind: "confirm-reset" }] };
    case "reset-confirmed":
      return finish(emptyDraft());
    case "edit-player": {
      if (!Number.isInteger(message.index) || !draft.players[message.index]) return unchanged;

      const players = draft.players.map((p, i) =>
        i === message.index
          ? { ...p, [message.field]: message.value.slice(0, message.field === "name" ? 64 : 5) }
          : p,
      );

      return finish({ ...draft, players });
    }

    case "doubles": {
      const value = pairs.find((p) => p === message.value) ?? null;
      const doubles: Draft["doubles"] = [draft.doubles[0], draft.doubles[1]];
      doubles[message.side] = value;

      return finish({ ...draft, doubles });
    }
  }
}
