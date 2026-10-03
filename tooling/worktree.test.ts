import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { worktreeIdentity } from "./worktree.ts";

describe("worktree resource identity", () => {
  it("is stable for a checkout and distinct for two checkouts", async () => {
    const first = await mkdtemp(resolve(tmpdir(), "droch-worktree-"));
    const second = await mkdtemp(resolve(tmpdir(), "droch-worktree-"));
    try {
      const a = worktreeIdentity(first);
      const b = worktreeIdentity(second);
      expect(worktreeIdentity(first)).toEqual(a);
      expect(a.projectName).not.toBe(b.projectName);
      expect(a.cookieName).not.toBe(b.cookieName);
    } finally {
      await Promise.all([rm(first, { recursive: true }), rm(second, { recursive: true })]);
    }
  });
});
