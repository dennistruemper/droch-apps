import { and, asc, eq, lt, notInArray } from "drizzle-orm";
import type { connectDatabase } from "@repo/shared/database";
import { hourStart, oldestHour, recordSlot, slotStart } from "../domain/index.ts";
import { latestSchema, type Latest } from "../contracts/index.ts";
import { hours, latest, monitoring } from "./schema.ts";
import type { Site } from "./sites.ts";

export function createStore(db: ReturnType<typeof connectDatabase>["db"], sites: readonly Site[]) {
  const ids = sites.map((site) => site.id);
  function prune(now: number) {
    db.transaction((tx) => {
      tx.delete(hours)
        .where(lt(hours.hour, oldestHour(now)))
        .run();
      tx.delete(latest)
        .where(lt(latest.slot, oldestHour(now)))
        .run();
      if (ids.length) {
        tx.delete(hours).where(notInArray(hours.siteId, ids)).run();
        tx.delete(latest).where(notInArray(latest.siteId, ids)).run();
      } else {
        tx.delete(hours).run();
        tx.delete(latest).run();
      }
    });
  }
  return {
    prune,
    isActivated() {
      return !!db.select().from(monitoring).where(eq(monitoring.id, 1)).get();
    },
    activate(now: number) {
      return (
        db
          .insert(monitoring)
          .values({ id: 1, activatedAt: now })
          .onConflictDoNothing()
          .returning({ id: monitoring.id })
          .all().length > 0
      );
    },
    hasSlot(siteId: string, time: number) {
      const row = db
        .select()
        .from(hours)
        .where(and(eq(hours.siteId, siteId), eq(hours.hour, hourStart(time))))
        .get();
      const offset = ((slotStart(time) - hourStart(time)) / (5 * 60 * 1000)) * 2;
      return !!row && ((row.slots >>> offset) & 3) !== 0;
    },
    record(siteId: string, input: Latest, now: number) {
      if (!ids.includes(siteId)) throw new Error("Unknown Observo site");
      const result = latestSchema.parse(input);
      if (
        result.slot !== slotStart(result.slot) ||
        result.slot > slotStart(now) ||
        result.slot < oldestHour(now)
      )
        return;
      db.transaction((tx) => {
        const hour = hourStart(result.slot);
        const existing = tx
          .select()
          .from(hours)
          .where(and(eq(hours.siteId, siteId), eq(hours.hour, hour)))
          .get();
        const packed = recordSlot(existing?.slots ?? 0, result.slot, result.outcome);
        if (existing?.slots === packed) return;
        tx.insert(hours)
          .values({ siteId, hour, slots: packed })
          .onConflictDoUpdate({
            target: [hours.siteId, hours.hour],
            set: { slots: packed },
          })
          .run();
        const previous = tx.select().from(latest).where(eq(latest.siteId, siteId)).get();
        if (!previous || previous.slot < result.slot)
          tx.insert(latest)
            .values({ siteId, ...result })
            .onConflictDoUpdate({ target: latest.siteId, set: result })
            .run();
      });
    },
    snapshot(now: number, checksEnabled: boolean) {
      prune(now);
      return {
        generatedAt: now,
        checksEnabled,
        sites: sites.map((site) => {
          const result = db.select().from(latest).where(eq(latest.siteId, site.id)).get();
          return {
            id: site.id,
            name: site.name,
            url: site.url,
            description: site.description,
            latest: result ? latestSchema.parse(result) : null,
            hours: db
              .select({ hour: hours.hour, slots: hours.slots })
              .from(hours)
              .where(eq(hours.siteId, site.id))
              .orderBy(asc(hours.hour))
              .all(),
          };
        }),
      };
    },
  };
}
