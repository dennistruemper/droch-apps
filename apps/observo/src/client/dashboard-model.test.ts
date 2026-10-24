import { describe, expect, it } from "vitest";
import { init, update } from "./dashboard-model.ts";
import type { Dashboard } from "../contracts/index.ts";

const data: Dashboard = { generatedAt: 100, checksEnabled: true, sites: [] };
describe("dashboard request recovery", () => {
  it("guards duplicate refreshes and stale completions, retaining data after failure", () => {
    const first = update(init(), { kind: "refresh" });
    expect(update(first.model, { kind: "refresh" }).commands).toEqual([]);
    expect(update(first.model, { kind: "loaded", id: 0, data }).model).toBe(first.model);
    const loaded = update(first.model, { kind: "loaded", id: 1, data }).model;
    const refreshing = update(loaded, { kind: "refresh" }).model;
    const failed = update(refreshing, { kind: "failed", id: 2, error: "offline" }).model;
    expect(failed.data).toEqual(data);
    const retry = update(failed, { kind: "refresh" });
    expect(retry.commands).toEqual([{ kind: "load", id: 3 }]);
    expect(update(retry.model, { kind: "loaded", id: 2, data }).model).toBe(retry.model);
    expect(
      update(retry.model, { kind: "loaded", id: 3, data: { ...data, generatedAt: 99 } }).model,
    ).toMatchObject({ data, request: { kind: "idle" } });
  });
});
