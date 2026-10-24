import { afterEach, describe, expect, it } from "vitest";
import { localDays, localSummary } from "./history.ts";
import { hourStart, interval, recordSlot } from "../domain/index.ts";
const originalTimezone = process.env.TZ;
afterEach(() => {
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
});
describe("local calendar history", () => {
  it("shows midnight to midnight across both clock changes without losing repeated hours", () => {
    process.env.TZ = "Europe/Berlin";
    for (const [date, count] of [
      ["2026-03-29T12:00:00Z", 23],
      ["2026-10-25T12:00:00Z", 25],
    ] as const) {
      const days = localDays(Date.parse(date));
      expect(days).toHaveLength(30);
      expect(days[0]!.hours).toHaveLength(count);
      expect(new Date(days[0]!.start).getHours()).toBe(0);
      expect(new Date(days[0]!.end).getHours()).toBe(0);
      expect(new Set(days[0]!.hours).size).toBe(count);
      expect(days[1]!.end).toBe(days[0]!.start);
    }
  });
  it("reassembles local hourly checks across UTC buckets in fractional-offset timezones", () => {
    process.env.TZ = "Asia/Kolkata";
    const hour = localDays(Date.parse("2026-10-24T12:00:00Z"))[0]!.start;
    const observations = new Map<number, number>();
    for (let i = 0; i < 12; i++) {
      const slot = hour + i * interval;
      observations.set(
        hourStart(slot),
        recordSlot(observations.get(hourStart(slot)) ?? 0, slot, "available"),
      );
    }
    expect(localSummary(observations, hour, hour + 12 * interval, null)).toMatchObject({
      passed: 12,
      failed: 0,
      status: "available",
    });
    const latest = {
      slot: hour,
      checkedAt: hour,
      durationMs: 1,
      reason: "ok",
      statusCode: 200,
      outcome: "available",
    } as const;
    expect(localSummary(observations, hour, hour + interval, latest)).toMatchObject({
      current: true,
      status: "available",
    });
    expect(localSummary(observations, hour, hour + 2 * interval, latest).status).toBe("unknown");
  });
});
