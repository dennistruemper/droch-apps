import type { Latest, Outcome } from "../contracts/index.ts";

export const interval = 5 * 60 * 1000;
export const hourDuration = 60 * 60 * 1000;
export const retainedHours = 30 * 24;
export const slotStart = (time: number) => Math.floor(time / interval) * interval;
export const hourStart = (time: number) => Math.floor(time / hourDuration) * hourDuration;
export const oldestHour = (now: number) => hourStart(now) - (retainedHours - 1) * hourDuration;
export type Slot = Outcome | "missing";
const codes: readonly Slot[] = ["missing", "available", "unreachable", "not-functional"];
export function readSlots(packed: number): Slot[] {
  return Array.from({ length: 12 }, (_, index) => codes[(packed >>> (index * 2)) & 3]!);
}
// A slot is immutable once recorded, including after restarts or duplicate completions.
export function recordSlot(packed: number, time: number, outcome: Outcome): number {
  const offset = Math.floor((time - hourStart(time)) / interval) * 2;
  if (((packed >>> offset) & 3) !== 0) return packed;
  return packed | (codes.indexOf(outcome) << offset);
}
export function currentStatus(latest: Latest | null, now: number) {
  if (!latest || now - latest.checkedAt >= interval * 2 || latest.checkedAt > now) return "unknown";
  return latest.outcome === "available" ? "available" : "unavailable";
}
export function summarize(packed: number, hour: number, now: number, latest: Latest | null = null) {
  const slots = readSlots(packed);
  const passed = slots.filter((slot) => slot === "available").length;
  const failed = slots.filter((slot) => slot === "unreachable" || slot === "not-functional").length;
  const pending = now >= hour && now < hour + hourDuration;
  const expected = pending ? Math.min(12, Math.floor((now - hour) / interval) + 1) : 12;
  const missing = slots.slice(0, expected).filter((slot) => slot === "missing").length;
  const status = pending
    ? currentStatus(latest, now)
    : missing > 0
      ? "unknown"
      : failed === 0
        ? "available"
        : failed > 6
          ? "mostly-unavailable"
          : "degraded";
  return { slots, passed, failed, missing, expected, status, current: pending } as const;
}
