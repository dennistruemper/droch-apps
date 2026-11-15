import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type { Game } from "../contracts/index.ts";

export const teams = sqliteTable("teams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  club: text("club").notNull(),
  needed: integer("needed").notNull(),
  timezone: text("timezone").notNull(),
  pinDigest: text("pin_digest").notNull(),
  pinBox: text("pin_box").notNull(),
  games: text("games", { mode: "json" }).$type<Game[]>().notNull(),
});

export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});

export const memberships = sqliteTable(
  "memberships",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id),
    userId: text("user_id")
      .notNull()
      .references(() => profiles.id),
    role: text("role", { enum: ["admin", "member"] }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] }), index("memberships_user").on(t.userId)],
);

export const commitments = sqliteTable(
  "commitments",
  {
    userId: text("user_id").notNull(),
    gameId: text("game_id").notNull(),
    revision: integer("revision").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.gameId] })],
);

export const revision = sqliteTable("revision", {
  id: integer("id").primaryKey(),
  value: integer("value").notNull(),
});

export const receipts = sqliteTable(
  "receipts",
  {
    userId: text("user_id").notNull(),
    commandId: text("command_id").notNull(),
    fingerprint: text("fingerprint").notNull(),
    teamId: text("team_id"),
    message: text("message").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.commandId] })],
);

export const attempts = sqliteTable("join_attempts", {
  key: text("key").primaryKey(),
  start: integer("start").notNull(),
  count: integer("count").notNull(),
});

export type AvailabilityChange = {
  playerId: string;
  gameId: string;
  revision: number;
  before: "unanswered" | "yes" | "no" | "maybe";
  after: "yes" | "no" | "maybe";
  actorId: string;
};

export const mailQueue = sqliteTable(
  "mail_queue",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id),
    recipientId: text("recipient_id").notNull(),
    changes: text("changes", { mode: "json" }).$type<AvailabilityChange[]>().notNull(),
    createdAt: integer("created_at").notNull(),
    dueAt: integer("due_at").notNull(),
    status: text("status", { enum: ["pending", "sending", "failed"] }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    leaseUntil: integer("lease_until").notNull().default(0),
  },
  (t) => [
    uniqueIndex("mail_queue_pending")
      .on(t.teamId, t.recipientId)
      .where(sql`${t.status} = 'pending'`),
    index("mail_queue_due").on(t.status, t.dueAt, t.leaseUntil),
  ],
);
