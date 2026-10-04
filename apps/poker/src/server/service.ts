import { and, eq, lte } from "drizzle-orm";
import { randomBytes, randomUUID } from "node:crypto";
import type { connectDatabase } from "@repo/shared/database";
import { decideCommand, projectRoom, type Command } from "../domain/index.ts";
import { participants, rooms } from "./schema.ts";

export const inactivityPeriod = 30 * 24 * 60 * 60 * 1000;
const ruleMessages = {
  "stale-round": "A new round has started. Your room has been refreshed; choose your vote again.",
  "already-revealed": "Votes have already been revealed. Start a new round to vote again.",
  "no-votes": "No votes to reveal yet. Ask someone to choose an estimate first.",
};
export class PokerError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: 401 | 403 | 404 | 409,
  ) {
    super(code);
  }
}
export function createPokerService(
  db: ReturnType<typeof connectDatabase>["db"],
  now = Date.now,
  random = { roomId: () => randomBytes(12).toString("hex"), participantId: randomUUID },
) {
  function cleanup() {
    db.delete(rooms)
      .where(lte(rooms.lastActivity, now() - inactivityPeriod))
      .run();
  }
  function room(id: string) {
    cleanup();
    const found = db.select().from(rooms).where(eq(rooms.id, id)).get();
    if (!found)
      throw new PokerError(
        "This room does not exist or expired after 30 days without activity. Check your invite link or create a new room.",
        404,
      );
    return found;
  }
  function members(id: string) {
    return db.select().from(participants).where(eq(participants.roomId, id)).all();
  }
  function member(id: string, hash: string) {
    const found = db
      .select()
      .from(participants)
      .where(and(eq(participants.roomId, id), eq(participants.tokenHash, hash)))
      .get();
    if (!found)
      throw new PokerError(
        "Join this room with your name before viewing votes or taking part.",
        401,
      );
    return found;
  }
  function snapshot(id: string, hash: string) {
    const current = room(id),
      viewer = member(id, hash);
    return projectRoom(current, members(id), viewer);
  }
  return {
    snapshot,
    info(id: string) {
      const current = room(id);
      return { id, title: current.title, participantCount: members(id).length };
    },
    create(title: string, name: string, hash: string) {
      cleanup();
      const id = random.roomId(),
        creatorId = random.participantId();
      db.transaction((tx) => {
        tx.insert(rooms).values({ id, title, creatorId, lastActivity: now() }).run();
        tx.insert(participants)
          .values({ id: creatorId, roomId: id, tokenHash: hash, name, joinedAt: now() })
          .run();
      });
      return snapshot(id, hash);
    },
    join(id: string, name: string, hash: string) {
      cleanup();
      db.transaction(() => {
        const current = room(id);
        if (members(id).some((person) => person.tokenHash === hash)) {
          db.update(rooms).set({ lastActivity: now() }).where(eq(rooms.id, id)).run();
          return;
        }
        if (members(id).length >= 50) throw new PokerError("Room is full", 409);
        db.insert(participants)
          .values({
            id: random.participantId(),
            roomId: id,
            tokenHash: hash,
            name,
            joinedAt: now(),
          })
          .run();
        db.update(rooms)
          .set({ version: current.version + 1, lastActivity: now() })
          .where(eq(rooms.id, id))
          .run();
      });
      return snapshot(id, hash);
    },
    command(id: string, hash: string, command: Command) {
      cleanup();
      db.transaction(() => {
        const current = room(id),
          actor = member(id, hash);
        const decision = decideCommand(current, members(id), command);
        if (!decision.ok) throw new PokerError(ruleMessages[decision.error], 409);
        if (command.kind === "vote")
          db.update(participants)
            .set({ vote: command.vote })
            .where(eq(participants.id, actor.id))
            .run();
        if (command.kind === "reset")
          db.update(participants).set({ vote: null }).where(eq(participants.roomId, id)).run();
        db.update(rooms)
          .set({
            round: decision.next.round,
            version: decision.next.version,
            revealed: decision.next.revealed,
            lastActivity: now(),
          })
          .where(eq(rooms.id, id))
          .run();
      });
      return snapshot(id, hash);
    },
  };
}
