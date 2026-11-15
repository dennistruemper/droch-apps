import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { instant, overlaps, parseCalendar, importGame } from "../domain/index.ts";
describe("planning rules and real calendar files", () => {
  it("imports both real TSV schedules with UTC windows and stable UIDs", () => {
    for (const n of [3, 4]) {
      const events = parseCalendar(
        readFileSync(`e2e/fixtures/rendsburger-tsv-${n}.ics`, "utf8"),
        "Europe/Berlin",
      );
      expect(events).toHaveLength(20);
      expect(new Set(events.map((e) => e.uid)).size).toBe(20);
      const games = events.map((e) => importGame(e, `Rendsburger TSV ${n}`));
      expect(games.some((g) => g.home)).toBe(true);
      expect(games.some((g) => !g.home)).toBe(true);
      expect(games.every((g) => g.window.end > g.window.start)).toBe(true);
    }
  });
  it("uses buffer-aware half-open windows and rejects invalid/ambiguous wall times", () => {
    expect(
      overlaps({ start: 0, end: 60000, buffer: 0 }, { start: 60000, end: 120000, buffer: 0 }),
    ).toBe(false);
    expect(
      overlaps({ start: 0, end: 60000, buffer: 1 }, { start: 60000, end: 120000, buffer: 0 }),
    ).toBe(true);
    expect(instant("2026-11-20T20:00", "Europe/Berlin")).toBe(Date.parse("2026-11-20T19:00Z"));
    expect(() => instant("2026-03-29T02:30", "Europe/Berlin")).toThrow(/mehrdeutig/);
    expect(() => instant("2026-10-25T02:30", "Europe/Berlin")).toThrow(/mehrdeutig/);
    expect(() => instant("2026-02-30T18:00", "Europe/Berlin")).toThrow();
  });
  it("rejects recurrence and incomplete calendars rather than inventing games", () => {
    const text = readFileSync("e2e/fixtures/rendsburger-tsv-3.ics", "utf8");
    expect(() =>
      parseCalendar(
        text.replace("BEGIN:VEVENT", "BEGIN:VEVENT\nRRULE:FREQ=WEEKLY"),
        "Europe/Berlin",
      ),
    ).toThrow(/einzelne Spiele/);
    expect(() => parseCalendar(text.replace(/END:VCALENDAR/, ""), "Europe/Berlin")).toThrow();
    expect(() => importGame(parseCalendar(text, "Europe/Berlin")[0]!, "Wrong club")).toThrow();
  });
});

it("retains explicit cancellation status instead of treating it as a scheduled match", () => {
  const calendar = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:cancelled-match",
    "DTSTART:20300101T180000Z",
    "SUMMARY:Our team - Visitors",
    "STATUS:CANCELLED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\n");
  expect(parseCalendar(calendar, "Europe/Berlin")[0]).toMatchObject({ cancelled: true });
  const methodCancellation = calendar
    .replace("BEGIN:VCALENDAR", "BEGIN:VCALENDAR\nMETHOD:CANCEL")
    .replace("STATUS:CANCELLED\n", "");
  expect(parseCalendar(methodCancellation, "Europe/Berlin")[0]).toMatchObject({ cancelled: true });
});
