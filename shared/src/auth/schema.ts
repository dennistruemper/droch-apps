import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  createdAt: integer("created_at").notNull(),
});
export const codes = sqliteTable("codes", {
  email: text("email").primaryKey(),
  digest: text("digest").notNull(),
  expiresAt: integer("expires_at").notNull(),
  sentAt: integer("sent_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  requests: integer("requests").notNull().default(1),
  windowStart: integer("window_start").notNull(),
});
export const sessions = sqliteTable(
  "sessions",
  {
    digest: text("digest").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [index("session_expiry").on(table.expiresAt)],
);
