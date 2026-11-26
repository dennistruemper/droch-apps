import { createAppStorage } from "@repo/shared/storage";
import { emptyDraft, savedSchema } from "../domain/index.ts";
import type { Command, Message } from "./calculator-model.ts";

export function execute(command: Command): Message | null {
  if (command.kind === "confirm-reset")
    return window.confirm("Alle Namen, Live-PZ und Doppel für dieses Pokalspiel zurücksetzen?")
      ? { kind: "reset-confirmed" }
      : null;

  try {
    const storage = createAppStorage("avantago", window.localStorage);

    if (command.kind === "save") {
      storage.set("calculator", JSON.stringify({ version: 1, draft: command.draft }));

      return null;
    }

    const raw = storage.get("calculator");

    if (raw === null) return { kind: "loaded", draft: emptyDraft(), warning: "" };
    const saved = savedSchema.safeParse(JSON.parse(raw));

    if (!saved.success) throw new Error("Invalid save");

    return { kind: "loaded", draft: saved.data.draft, warning: "" };
  } catch {
    return command.kind === "load"
      ? {
          kind: "loaded",
          draft: emptyDraft(),
          warning:
            "Die gespeicherte Aufstellung konnte nicht geladen werden. Du kannst neue Werte eintragen; bitte prüfe, ob dein Browser das Speichern erlaubt.",
        }
      : { kind: "storage-failed" };
  }
}
