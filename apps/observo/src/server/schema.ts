import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { Outcome, Reason } from "../contracts/index.ts";

export const hours = sqliteTable(
  "hours",
  {
    siteId: text("site_id").notNull(),
    hour: integer("hour").notNull(),
    slots: integer("slots").notNull(),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.hour] })],
);
export const latest = sqliteTable("latest", {
  siteId: text("site_id").primaryKey(),
  slot: integer("slot").notNull(),
  checkedAt: integer("checked_at").notNull(),
  outcome: text("outcome").$type<Outcome>().notNull(),
  reason: text("reason").$type<Reason>().notNull(),
  statusCode: integer("status_code"),
  durationMs: integer("duration_ms").notNull(),
});
