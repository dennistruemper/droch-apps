import { describe, expect, it } from "vitest";
import { createAppStorage } from "./index.ts";

function memoryStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    key: (index) => [...entries.keys()][index] ?? null,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
    removeItem: (key) => {
      entries.delete(key);
    },
    clear: () => entries.clear(),
  };
}

describe("app-scoped storage", () => {
  it("clears all of one app's keys without touching another app or unrelated data", () => {
    const storage = memoryStorage();
    const poker = createAppStorage("poker", storage);
    const words = createAppStorage("words", storage);
    poker.set("theme", "paper");
    poker.set("room", "room-1");
    words.set("theme", "gamegirl");
    storage.setItem("other", "untouched");
    poker.clearAppData();
    expect(poker.get("theme")).toBeNull();
    expect(poker.get("room")).toBeNull();
    expect(words.get("theme")).toBe("gamegirl");
    expect(storage.getItem("other")).toBe("untouched");
  });
});
