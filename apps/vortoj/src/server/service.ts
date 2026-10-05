import { and, eq } from "drizzle-orm";
import { randomInt, randomUUID, createHash } from "node:crypto";
import type { connectDatabase } from "@repo/shared/database";
import type { User } from "@repo/shared/auth";
import { tileSets, rooms, members, commands } from "./schema.ts";
import { decideGame, newGame, projectGame, presets, RuleError } from "../domain/index.ts";
import type { GameCommand, TileSet } from "../contracts/index.ts";
export class VortojError extends Error {
  constructor(
    message: string,
    public status: 400 | 401 | 403 | 404 | 409 | 429,
  ) {
    super(message);
  }
}
export function createVortojService(
  db: ReturnType<typeof connectDatabase>["db"],
  effects = { now: Date.now, draw: randomInt, id: randomUUID },
) {
  const room = (id: string) => {
    const row = db.select().from(rooms).where(eq(rooms.id, id)).get();
    if (!row) throw new VortojError("Room not found. Check the invitation link.", 404);
    return row;
  };
  const membership = (id: string, user: User) => {
    if (
      !db
        .select()
        .from(members)
        .where(and(eq(members.roomId, id), eq(members.userId, user.id)))
        .get()
    )
      throw new VortojError("Join this room before viewing the game.", 403);
  };
  const snapshot = (id: string, user: User) => {
    const row = room(id);
    membership(id, user);
    return projectGame(row.state, user.id, row);
  };
  const ownedSet = (id: string, user: User) => {
    const set = db
      .select()
      .from(tileSets)
      .where(and(eq(tileSets.id, id), eq(tileSets.ownerId, user.id)))
      .get();
    if (!set) throw new VortojError("Tile set not found in your collection.", 404);
    return set;
  };
  return {
    snapshot,
    sets(user: User) {
      return [
        ...presets,
        ...db
          .select({ id: tileSets.id, name: tileSets.name, tiles: tileSets.tiles })
          .from(tileSets)
          .where(eq(tileSets.ownerId, user.id))
          .all(),
      ];
    },
    saveSet(user: User, value: TileSet, id?: string) {
      if (id) {
        ownedSet(id, user);
        db.update(tileSets).set(value).where(eq(tileSets.id, id)).run();
        return { id, ...value };
      }
      if (db.select().from(tileSets).where(eq(tileSets.ownerId, user.id)).all().length >= 50)
        throw new VortojError("Your collection is full. Edit or remove a saved set first.", 429);
      const nextId = effects.id();
      db.insert(tileSets)
        .values({ id: nextId, ownerId: user.id, ...value })
        .run();
      return { id: nextId, ...value };
    },
    deleteSet(user: User, id: string) {
      ownedSet(id, user);
      db.delete(tileSets).where(eq(tileSets.id, id)).run();
    },
    list(user: User) {
      return db
        .select({ id: rooms.id, title: rooms.title, state: rooms.state })
        .from(rooms)
        .innerJoin(members, eq(rooms.id, members.roomId))
        .where(eq(members.userId, user.id))
        .all()
        .map((row) => ({
          id: row.id,
          title: row.title,
          phase: row.state.phase,
          turnId: row.state.players[row.state.turn]!.id,
          version: row.state.version,
        }));
    },
    create(user: User, title: string, tileSetId: string) {
      const set = presets.find((p) => p.id === tileSetId) ?? ownedSet(tileSetId, user),
        id = effects.id();
      db.transaction(() => {
        db.insert(rooms)
          .values({
            id,
            ownerId: user.id,
            title,
            tileSet: { name: set.name, tiles: set.tiles },
            createdAt: effects.now(),
            state: newGame(user),
          })
          .run();
        db.insert(members).values({ roomId: id, userId: user.id }).run();
      });
      return snapshot(id, user);
    },
    info(id: string) {
      const row = room(id);
      return {
        id,
        title: row.title,
        phase: row.state.phase,
        playerCount: row.state.players.length,
      };
    },
    join(id: string, user: User) {
      db.transaction(() => {
        const row = room(id);
        if (row.state.players.some((p) => p.id === user.id)) return;
        if (row.state.phase !== "waiting")
          throw new VortojError(
            "This game has already started. Ask for a new room invitation.",
            409,
          );
        if (row.state.players.length >= 4)
          throw new VortojError("This room already has four players.", 409);
        const state = structuredClone(row.state);
        state.players.push({ ...user, score: 0, rack: [] });
        state.version++;
        db.insert(members).values({ roomId: id, userId: user.id }).run();
        db.update(rooms).set({ state }).where(eq(rooms.id, id)).run();
      });
      return snapshot(id, user);
    },
    command(id: string, user: User, command: GameCommand) {
      try {
        db.transaction(() => {
          const row = room(id);
          membership(id, user);
          const digest = createHash("sha256").update(JSON.stringify(command)).digest("hex"),
            old = db
              .select()
              .from(commands)
              .where(
                and(
                  eq(commands.roomId, id),
                  eq(commands.userId, user.id),
                  eq(commands.commandId, command.commandId),
                ),
              )
              .get();
          if (old) {
            if (old.digest !== digest)
              throw new VortojError("This request ID was already used for another action.", 409);
            return;
          }
          const state = decideGame(row.state, row.ownerId, user.id, command, row.tileSet, {
            now: effects.now(),
            draw: effects.draw,
            id: effects.id,
          });
          db.update(rooms).set({ state }).where(eq(rooms.id, id)).run();
          db.insert(commands)
            .values({ roomId: id, userId: user.id, commandId: command.commandId, digest })
            .run();
        });
      } catch (error) {
        if (error instanceof RuleError) throw new VortojError(error.message, 409);
        throw error;
      }
      return snapshot(id, user);
    },
  };
}
