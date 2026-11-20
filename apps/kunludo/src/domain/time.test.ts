import { describe, expect, it, vi } from "vitest";
import { formatWindow, instant, localDay, localInput } from "./index.ts";

describe("planner date formatting", () => {
  it("reuses formatters during local-time conversion and repeated snapshots", () => {
    const constructor = vi.spyOn(Intl, "DateTimeFormat");

    try {
      const time = instant("2026-07-12T18:30", "Europe/Berlin");
      expect(time).toBe(Date.parse("2026-07-12T16:30:00Z"));
      const firstDay = localDay(time, "Europe/Berlin");

      for (let i = 0; i < 200; i++) {
        expect(localInput(time, "Europe/Berlin")).toBe("2026-07-12T18:30");
        expect(localDay(time, "Europe/Berlin")).toBe(firstDay);
      }

      expect(constructor.mock.calls.length).toBeLessThanOrEqual(2);
    } finally {
      constructor.mockRestore();
    }
  });

  it("preserves native formatting across zones and cache eviction", () => {
    const time = Date.parse("2026-01-01T00:15:00Z");
    localDay(time, "Pacific/Kiritimati");
    const zones = ["UTC", ...Intl.supportedValuesOf("timeZone").slice(0, 80)];

    for (const zone of [...zones, "UTC"]) {
      expect(localDay(time, zone)).toBe(
        new Intl.DateTimeFormat("en-CA", {
          timeZone: zone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(time),
      );
      expect(localInput(time, zone)).toBe(
        new Intl.DateTimeFormat("sv-SE", {
          timeZone: zone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        })
          .format(time)
          .replace(" ", "T"),
      );
    }

    const constructor = vi.spyOn(Intl, "DateTimeFormat");

    try {
      // The old zone must be evicted, then reused again after reinsertion.
      localDay(time, "Pacific/Kiritimati");
      localDay(time, "Pacific/Kiritimati");
      expect(constructor).toHaveBeenCalledTimes(1);
    } finally {
      constructor.mockRestore();
    }
  });

  it("still rejects invalid zones and missing or ambiguous DST wall times", () => {
    expect(() => localInput(0, "Not/A_Zone")).toThrow(RangeError);
    expect(() => instant("2026-03-29T02:30", "Europe/Berlin")).toThrow(/mehrdeutig/);
    expect(() => instant("2026-10-25T02:30", "Europe/Berlin")).toThrow(/mehrdeutig/);
    expect(localInput(instant("2026-10-25T03:30", "Europe/Berlin"), "Europe/Berlin")).toBe(
      "2026-10-25T03:30",
    );
  });
});

describe("planner display dates", () => {
  it("reuses display formatters across repeated match rendering", () => {
    const window = {
      start: Date.parse("2026-07-12T16:30Z"),
      end: Date.parse("2026-07-12T18:30Z"),
      buffer: 30,
    };

    const constructor = vi.spyOn(Intl, "DateTimeFormat");

    try {
      const expected = formatWindow(window, "Pacific/Tongatapu");

      for (let i = 0; i < 200; i++)
        expect(formatWindow(window, "Pacific/Tongatapu")).toBe(expected);
      expect(constructor.mock.calls.length).toBeLessThanOrEqual(2);
    } finally {
      constructor.mockRestore();
    }
  });

  it("preserves German start-date labels across timezones and DST", () => {
    for (const zone of ["UTC", "Europe/Berlin", "America/New_York"]) {
      for (const start of [Date.parse("2026-01-01T00:15Z"), Date.parse("2026-07-12T16:30Z")]) {
        const date = new Intl.DateTimeFormat("de-DE", {
          timeZone: zone,
          weekday: "short",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }).format(start);

        const time = new Intl.DateTimeFormat("de-DE", {
          timeZone: zone,
          hour: "2-digit",
          minute: "2-digit",
        }).format(start);

        expect(formatWindow({ start, end: start + 7200000, buffer: 30 }, zone)).toBe(
          `${date} · ${time}`,
        );
      }
    }
  });
});
