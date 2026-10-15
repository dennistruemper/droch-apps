import { z } from "zod";
export const appDefinition = {
  id: "vortoj",
  title: "Vortoj",
  description: "Build words together. Take your turn whenever you’re ready.",
  theme: "antique-paper",
} as const;
export const statusSchema = z.object({ app: z.literal("vortoj"), stage: z.literal("foundation") });
export function normalizeLetter(letter: string) {
  const value = letter.trim().normalize("NFC");
  return value === "ß" ? "ẞ" : value.toUpperCase();
}
export const letterSchema = z
  .string()
  .max(16)
  .transform(normalizeLetter)
  .refine(
    (value) => value === "*" || /^\p{L}\p{M}*$/u.test(value),
    "Use one letter or * for a joker",
  );
export const tileDefinitionSchema = z
  .object({
    letter: letterSchema,
    count: z.number().int().min(1).max(100),
    points: z.number().int().min(0).max(20),
  })
  .refine((tile) => tile.letter !== "*" || tile.points === 0, "Jokers must score zero");
export const tileSetSchema = z
  .object({
    name: z.string().trim().min(1).max(48),
    tiles: z.array(tileDefinitionSchema).min(1).max(80),
  })
  .superRefine((set, ctx) => {
    const total = set.tiles.reduce((sum, tile) => sum + tile.count, 0);
    if (total < 28 || total > 500)
      ctx.addIssue({ code: "custom", message: "A set must contain 28–500 tiles" });
    if (new Set(set.tiles.map((tile) => tile.letter)).size !== set.tiles.length)
      ctx.addIssue({ code: "custom", message: "Each letter may appear only once in the editor" });
    if (!set.tiles.some((tile) => tile.letter !== "*"))
      ctx.addIssue({ code: "custom", message: "Add at least one letter" });
  });
export type TileSet = z.infer<typeof tileSetSchema>;
export const savedTileSetSchema = tileSetSchema.safeExtend({ id: z.string() });
export const createRoomSchema = z.object({
  title: z.string().trim().min(1).max(80),
  tileSetId: z.string().min(1).max(100),
});
export const placementSchema = z.object({
  tileId: z.string().uuid(),
  row: z.number().int().min(0).max(14),
  col: z.number().int().min(0).max(14),
  letter: letterSchema.optional(),
});
export type Placement = z.infer<typeof placementSchema>;
const commandBase = { commandId: z.string().uuid(), version: z.number().int().min(0) };
export const commandSchema = z.discriminatedUnion("kind", [
  z.object({ ...commandBase, kind: z.literal("start") }),
  z.object({
    ...commandBase,
    kind: z.literal("place"),
    placements: z.array(placementSchema).min(1).max(7),
  }),
  z.object({
    ...commandBase,
    kind: z.literal("vote"),
    votes: z
      .array(z.object({ wordId: z.string().max(32), approve: z.boolean() }))
      .min(1)
      .max(8),
  }),
  z.object({ ...commandBase, kind: z.literal("pass") }),
  z.object({
    ...commandBase,
    kind: z.literal("exchange"),
    tileIds: z.array(z.string().uuid()).min(1).max(7),
  }),
]);
export type GameCommand = z.infer<typeof commandSchema>;
export const tileSchema = z.object({
  id: z.string().uuid(),
  letter: letterSchema,
  points: z.number().int().min(0).max(20),
});
export const boardTileSchema = tileSchema.extend({
  row: z.number().int().min(0).max(14),
  col: z.number().int().min(0).max(14),
  blank: z.boolean(),
});
export const formedWordSchema = z.object({ id: z.string(), text: z.string(), points: z.number() });
export const snapshotSchema = z.object({
  id: z.string(),
  title: z.string(),
  ownerId: z.string(),
  version: z.number().int(),
  phase: z.enum(["waiting", "playing", "voting", "finished"]),
  tileSet: tileSetSchema,
  board: z.array(boardTileSchema),
  bagCount: z.number().int(),
  turnId: z.string(),
  players: z.array(
    z.object({ id: z.string(), name: z.string(), score: z.number(), tileCount: z.number().int() }),
  ),
  you: z.object({ id: z.string(), rack: z.array(tileSchema) }),
  pending: z
    .object({
      authorId: z.string(),
      placements: z.array(boardTileSchema),
      words: z.array(formedWordSchema),
      bonus: z.number(),
      votes: z.record(z.string(), z.record(z.string(), z.boolean())),
      requiredApprovals: z.number().int(),
    })
    .nullable(),
  history: z.array(z.object({ text: z.string(), at: z.number() })),
});
export type Snapshot = z.infer<typeof snapshotSchema>;

export const roomInfoSchema = z.object({
  id: z.string(),
  title: z.string(),
  phase: z.enum(["waiting", "playing", "voting", "finished"]),
  playerCount: z.number().int().min(1).max(4),
});
export const roomListSchema = z.array(
  z.object({
    id: z.string(),
    title: z.string(),
    phase: z.enum(["waiting", "playing", "voting", "finished"]),
    turnId: z.string(),
    version: z.number().int(),
    updatedAt: z.number().int(),
  }),
);
export type RoomInfo = z.infer<typeof roomInfoSchema>;
