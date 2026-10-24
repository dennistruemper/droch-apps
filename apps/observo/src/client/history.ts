import {
  hourDuration,
  hourStart,
  interval,
  readSlots,
  recordSlot,
  summarize,
} from "../domain/index.ts";
import type { Latest } from "../contracts/index.ts";

// Calendar arithmetic preserves local midnight across daylight-saving transitions.
export function localDays(now: number) {
  return Array.from({ length: 30 }, (_, offset) => {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - offset);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return {
      start: start.getTime(),
      end: end.getTime(),
      hours: Array.from(
        { length: (end.getTime() - start.getTime()) / hourDuration },
        (_, index) => start.getTime() + index * hourDuration,
      ),
    };
  });
}

// Reassemble local hours from UTC slots, including timezones with half-hour offsets.
export function localSummary(
  hours: ReadonlyMap<number, number>,
  hour: number,
  now: number,
  latest: Latest | null,
) {
  let packed = 0;
  for (let index = 0; index < 12; index++) {
    const time = hour + index * interval;
    const source = hours.get(hourStart(time)) ?? 0;
    const outcome = readSlots(source)[Math.floor((time - hourStart(time)) / interval)]!;
    if (outcome !== "missing") packed = recordSlot(packed, index * interval, outcome);
  }
  return summarize(packed, hour, now, latest);
}
