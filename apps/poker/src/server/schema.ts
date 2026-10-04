import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { Vote } from "../contracts/index.ts";

export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  creatorId: text("host_id").notNull(),
  round: integer("round").notNull().default(1),
  version: integer("version").notNull().default(1),
  revealed: integer("revealed", { mode: "boolean" }).notNull().default(false),
  lastActivity: integer("last_activity").notNull(),
});
export const participants = sqliteTable(
  "participants",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    name: text("name").notNull(),
    vote: text("vote").$type<Vote>(),
    joinedAt: integer("joined_at").notNull(),
  },
  (table) => [uniqueIndex("participant_room_token").on(table.roomId, table.tokenHash)],
);
