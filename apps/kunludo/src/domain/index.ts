import type { Game, MatchInput } from "../contracts/index.ts";

// Reuse ICU formatters on snapshot/import hot paths without retaining every supplied zone.
const dateFormats = new Map<string, Intl.DateTimeFormat>();

function dateFormat(locale: string, options: Intl.DateTimeFormatOptions) {
  const key = JSON.stringify([locale, options]);
  const existing = dateFormats.get(key);

  if (existing) return existing;
  const formatter = new Intl.DateTimeFormat(locale, options);

  if (dateFormats.size >= 64) dateFormats.delete(dateFormats.keys().next().value!);
  dateFormats.set(key, formatter);

  return formatter;
}

export function overlaps(a: MatchInput["window"], b: MatchInput["window"]) {
  return (
    a.start - a.buffer * 60000 < b.end + b.buffer * 60000 &&
    b.start - b.buffer * 60000 < a.end + a.buffer * 60000
  );
}

export function formatWindow(w: MatchInput["window"], tz: string) {
  const date = dateFormat("de-DE", {
    timeZone: tz,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(w.start);

  const time = (t: number) =>
    dateFormat("de-DE", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(t);

  return `${date} · ${time(w.start)}`;
}

export function localDay(time: number, timezone: string) {
  return dateFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(time);
}

export function localInput(time: number, timezone: string) {
  const parts = dateFormat("sv-SE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(time);

  return parts.replace(" ", "T");
}

/** Reject missing and ambiguous DST wall times instead of silently moving a game. */
export function instant(local: string, timezone: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw new Error("Datum und Uhrzeit fehlen.");
  const approximate = Date.parse(local + ":00Z");
  const hits: number[] = [];

  for (let offset = -14 * 60; offset <= 14 * 60; offset += 15) {
    const value = approximate + offset * 60000;

    if (localInput(value, timezone) === local) hits.push(value);
  }

  if (hits.length !== 1)
    throw new Error(
      "Diese Ortszeit ist ungültig oder durch die Zeitumstellung mehrdeutig. Bitte wähle eine eindeutige Uhrzeit.",
    );

  return hits[0]!;
}

export type CalendarEvent = {
  uid: string;
  cancelled?: boolean;
  summary: string;
  home: string;
  away: string;
  venue: string;
  start: number;
  end: number;
};

const unescapeText = (s: string) => s.replace(/\\[nN]/g, "\n").replace(/\\([,;\\])/g, "$1");

function icsTime(key: string, value: string, timezone: string) {
  if (/VALUE=DATE(?:;|$)/i.test(key) || !/^\d{8}T\d{6}Z?$/.test(value))
    throw new Error("Ganztägige oder ungültige Kalendertermine werden nicht unterstützt.");
  const local = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}`;

  if (value.endsWith("Z")) {
    const t = Date.parse(local + ":" + value.slice(13, 15) + "Z");

    if (!Number.isFinite(t) || localInput(t, "UTC") !== local)
      throw new Error("Ungültiges Kalenderdatum.");

    return t;
  }

  const tz = key.match(/TZID=([^;:]+)/i)?.[1]?.replace(/^"|"$/g, "") ?? timezone;

  return instant(local, tz);
}

export function parseCalendar(text: string, timezone: string): CalendarEvent[] {
  if (text.length > 500000 || !text.trimStart().startsWith("BEGIN:VCALENDAR"))
    throw new Error("Bitte eine iCalendar-Datei (.ics, maximal 500 KB) wählen.");

  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("\n");

  const result: CalendarEvent[] = [];
  let event: Record<string, { key: string; value: string }> | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      if (event) throw new Error("Ungültiger Kalender.");
      event = {};
      continue;
    }

    if (line === "END:VEVENT") {
      if (!event) throw new Error("Ungültiger Kalender.");
      const e = event;
      event = null;

      if (!e.UID || !e.DTSTART || !e.SUMMARY)
        throw new Error("Jedes Spiel benötigt UID, Beginn und Titel.");
      const summary = unescapeText(e.SUMMARY.value);
      const names = summary.replace(/\s*\([^)]*\)\s*$/, "").split(" - ");

      if (names.length !== 2 || !names[0]?.trim() || !names[1]?.trim())
        throw new Error("Spielnamen müssen als Heimteam - Gastteam vorliegen.");
      const start = icsTime(e.DTSTART.key, e.DTSTART.value, timezone);
      const end = e.DTEND ? icsTime(e.DTEND.key, e.DTEND.value, timezone) : start + 150 * 60000;

      if (end <= start || end - start > 86400000) throw new Error("Ungültige Spieldauer.");
      const uid = e.UID.value.trim();

      if (!uid || uid.length > 300 || result.some((v) => v.uid === uid))
        throw new Error("Fehlende oder doppelte Kalender-UID.");
      result.push({
        uid,
        cancelled:
          e.STATUS?.value.toUpperCase() === "CANCELLED" ||
          lines.some((line) => line.toUpperCase() === "METHOD:CANCEL"),
        summary,
        home: names[0]!.trim(),
        away: names[1]!.trim(),
        venue: unescapeText(e.LOCATION?.value ?? ""),
        start,
        end,
      });

      if (result.length > 500) throw new Error("Maximal 500 Spiele pro Datei.");
      continue;
    }

    if (event) {
      const colon = line.indexOf(":");

      if (colon < 0) continue;

      const key = line.slice(0, colon),
        field = key.split(";")[0]!.toUpperCase();

      if (["RRULE", "RECURRENCE-ID", "RDATE", "EXDATE"].includes(field))
        throw new Error("Wiederholende Kalendertermine bitte als einzelne Spiele exportieren.");
      event[field] = { key, value: line.slice(colon + 1).trim() };
    }
  }

  if (event || !lines.some((l) => l.trim() === "END:VCALENDAR") || !result.length)
    throw new Error("Keine vollständigen Spiele im Kalender gefunden.");

  return result;
}

export function importGame(event: CalendarEvent, ownName: string): MatchInput {
  if (event.home !== ownName && event.away !== ownName)
    throw new Error("Das gewählte Team kommt in diesem Spiel nicht vor.");

  return {
    opponent: event.home === ownName ? event.away : event.home,
    home: event.home === ownName,
    venue: event.venue,
    window: { start: event.start, end: event.end, buffer: 30 },
  };
}

export function changedSchedule(a: Game, b: MatchInput) {
  return (
    a.window.start !== b.window.start ||
    a.window.end !== b.window.end ||
    a.window.buffer !== b.window.buffer ||
    a.venue !== b.venue
  );
}

export function playerReadiness(ready: number, needed: number, start: number, now: number) {
  if (ready >= needed) return { icon: "✅", label: "Genug Spieler verfügbar" };

  if (start - now < 14 * 86400000)
    return { icon: "❗", label: "Spieler fehlen · weniger als zwei Wochen" };

  return { icon: "⚠️", label: "Spieler fehlen · mindestens zwei Wochen Zeit" };
}
