import { it, expect } from "vitest";
import { playerReadiness } from "./index.ts";

it("marks enough players green and distinguishes the exact two-week boundary", () => {
  const now = Date.parse("2026-11-14T12:00Z");
  const boundary = now + 14 * 86400000;
  expect(playerReadiness(4, 4, now, now).icon).toBe("✅");
  expect(playerReadiness(5, 4, boundary, now).icon).toBe("✅");
  expect(playerReadiness(3, 4, boundary, now).icon).toBe("⚠️");
  expect(playerReadiness(3, 4, boundary - 1, now).icon).toBe("❗");
});
