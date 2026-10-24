import { describe, expect, it } from "vitest";
import { hourDuration, interval, oldestHour, readSlots, recordSlot, summarize } from "./index.ts";

const hour = Date.UTC(2026, 9, 24, 10);
function filled(failures: number) {
  let packed = 0;
  for (let index = 0; index < 12; index++)
    packed = recordSlot(
      packed,
      hour + index * interval,
      index < failures ? "not-functional" : "available",
    );
  return packed;
}
describe("compact hourly observations", () => {
  it("keeps twelve independent outcomes in 24 bits, including the last slot", () => {
    const packed = recordSlot(
      recordSlot(0, hour, "unreachable"),
      hour + 11 * interval,
      "not-functional",
    );
    expect(readSlots(packed)).toEqual([
      "unreachable",
      ...Array(10).fill("missing"),
      "not-functional",
    ]);
    expect(recordSlot(packed, hour, "available")).toBe(packed);
    expect(packed).toBeLessThanOrEqual(0xffffff);
  });
  it.each([
    [0, "available"],
    [1, "degraded"],
    [6, "degraded"],
    [7, "mostly-unavailable"],
    [12, "mostly-unavailable"],
  ] as const)("classifies %i failures as %s", (failures, status) => {
    expect(summarize(filled(failures), hour, hour + hourDuration).status).toBe(status);
  });
  it("never calls incomplete coverage available, and distinguishes the running hour", () => {
    const packed = recordSlot(0, hour, "available");
    expect(summarize(packed, hour, hour + hourDuration)).toMatchObject({
      status: "unknown",
      passed: 1,
      failed: 0,
      missing: 11,
    });
    expect(summarize(packed, hour, hour + 2 * interval)).toMatchObject({
      status: "in-progress",
      expected: 3,
      missing: 2,
    });
    expect(oldestHour(hour + 59 * 60_000)).toBe(hour - 719 * hourDuration);
  });
});
