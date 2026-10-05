import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core";
import type { Game } from "../domain/index.ts";
import type { TileSet } from "../contracts/index.ts";
export const tileSets = sqliteTable(
  "tile_sets",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    tiles: text("tiles", { mode: "json" }).$type<TileSet["tiles"]>().notNull(),
  },
  (t) => [index("tile_sets_owner").on(t.ownerId)],
);
export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  title: text("title").notNull(),
  createdAt: integer("created_at").notNull(),
  tileSet: text("tile_set", { mode: "json" }).$type<TileSet>().notNull(),
  state: text("state", { mode: "json" }).$type<Game>().notNull(),
});
export const members = sqliteTable(
  "members",
  {
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.roomId, t.userId] }), index("members_user").on(t.userId)],
);
export const commands = sqliteTable(
  "commands",
  {
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    commandId: text("command_id").notNull(),
    digest: text("digest").notNull(),
  },
  (t) => [primaryKey({ columns: [t.roomId, t.userId, t.commandId] })],
);
