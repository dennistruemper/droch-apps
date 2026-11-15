import { z } from "zod";
export const appDefinition = {
  id: "kunludo",
  title: "Kunludo",
  description: "Deine Teams. Ein Spielplan.",
  themes: { light: "paper", dark: "ink" },
} as const;
const id = z.string().min(1).max(80);
const name = z.string().trim().min(1).max(100);
export const answerSchema = z.enum(["yes", "maybe", "no"]);
export type Answer = z.infer<typeof answerSchema>;
export const windowSchema = z
  .object({
    start: z.number().int().min(0).max(4102444800000),
    end: z.number().int().min(0).max(4102444800000),
    buffer: z.number().int().min(0).max(360),
  })
  .refine(
    (v) => v.end > v.start && v.end - v.start <= 86400000,
    "Ende muss nach Beginn liegen (maximal 24 Stunden).",
  );
export const matchInputSchema = z.object({
  opponent: name,
  venue: z.string().trim().max(200),
  home: z.boolean(),
  window: windowSchema,
});
export type MatchInput = z.infer<typeof matchInputSchema>;
export const responseSchema = z.object({ answer: answerSchema, revision: z.number().int() });
export const proposalSchema = z.object({
  id,
  window: windowSchema,
  votes: z.record(z.string(), answerSchema),
  by: id,
});
export const gameSchema = matchInputSchema.extend({
  id,
  revision: z.number().int(),
  cancelled: z.boolean(),
  responses: z.record(z.string(), responseSchema),
  proposals: z.array(proposalSchema),
  reserves: z.array(id),
  sourceUid: z.string().nullable(),
  sourceName: z.string().nullable(),
  notice: z.string(),
});
export type Game = z.infer<typeof gameSchema>;
export type Proposal = z.infer<typeof proposalSchema>;
export const teamDataSchema = z.object({ games: z.array(gameSchema) });
export const teamInputSchema = z
  .object({
    name,
    club: z.string().trim().max(100),
    needed: z.number().int().min(1).max(100),
    timezone: z
      .string()
      .max(80)
      .refine((v) => {
        try {
          new Intl.DateTimeFormat("de", { timeZone: v });
          return true;
        } catch {
          return false;
        }
      }, "Ungültige Zeitzone"),
  })
  .strict();
export type TeamInput = z.infer<typeof teamInputSchema>;
const actionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("create-team"), team: teamInputSchema }),
  z.object({
    kind: z.literal("join"),
    teamId: id,
    pin: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{6}$/),
  }),
  z.object({ kind: z.literal("settings"), teamId: id, team: teamInputSchema }),
  z.object({ kind: z.literal("promote"), teamId: id, userId: id }),
  z.object({ kind: z.literal("remove"), teamId: id, userId: id }),
  z.object({ kind: z.literal("rotate"), teamId: id }),
  z.object({ kind: z.literal("create-game"), teamId: id, game: matchInputSchema }),
  z.object({ kind: z.literal("edit-game"), teamId: id, gameId: id, game: matchInputSchema }),
  z.object({ kind: z.literal("cancel"), teamId: id, gameId: id }),
  z.object({ kind: z.literal("answer"), teamId: id, gameId: id, answer: answerSchema }),
  z.object({
    kind: z.literal("set-answer"),
    teamId: id,
    gameId: id,
    userId: id,
    answer: answerSchema,
  }),
  z.object({ kind: z.literal("commit"), teamId: id, gameId: id }),
  z.object({ kind: z.literal("release"), teamId: id, gameId: id }),
  z.object({ kind: z.literal("propose"), teamId: id, gameId: id, window: windowSchema }),
  z.object({
    kind: z.literal("vote"),
    teamId: id,
    gameId: id,
    proposalId: id,
    answer: answerSchema,
  }),
  z.object({ kind: z.literal("adopt"), teamId: id, gameId: id, proposalId: id }),
  z.object({ kind: z.literal("reserve"), teamId: id, gameId: id, userId: id, add: z.boolean() }),
  z.object({
    kind: z.literal("import"),
    teamId: id,
    calendar: z.string().max(500000),
    ownName: name,
    selected: z.array(z.string().max(300)).min(1).max(500),
  }),
]);
export type Action = z.infer<typeof actionSchema>;
export const commandSchema = z.object({
  commandId: z.string().uuid(),
  version: z.number().int().nonnegative(),
  action: actionSchema,
});
export type Command = z.infer<typeof commandSchema>;
export const memberSchema = z.object({ id, name, role: z.enum(["admin", "member"]) });
export const teamSchema = teamInputSchema.extend({
  id,
  role: z.enum(["admin", "member"]),
  members: z.array(memberSchema),
});
export type Team = z.infer<typeof teamSchema>;
export const stateSchema = z.enum([
  "unanswered",
  "yes",
  "no",
  "maybe",
  "stale",
  "pending",
  "elsewhere",
  "committed",
]);
export const gameViewSchema = z.object({
  id,
  teamId: id,
  opponent: name,
  venue: z.string(),
  home: z.boolean(),
  window: windowSchema,
  revision: z.number(),
  cancelled: z.boolean(),
  notice: z.string(),
  imported: z.boolean(),
  calendarUid: z.string().nullable(),
  mine: stateSchema,
  conflicts: z.array(id),
  sameDay: z.array(id),
  committed: z.boolean(),
  ready: z.number(),
  uncertain: z.number(),
  needed: z.number(),
  members: z.array(memberSchema.extend({ state: stateSchema, reserve: z.boolean() })),
  proposals: z.array(
    z.object({
      id,
      window: windowSchema,
      mine: answerSchema.nullable(),
      yes: z.number(),
      maybe: z.number(),
      no: z.number(),
    }),
  ),
});
export type GameView = z.infer<typeof gameViewSchema>;
export const snapshotSchema = z.object({
  version: z.number().int(),
  teams: z.array(teamSchema),
  games: z.array(gameViewSchema),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export const resultSchema = z.object({
  snapshot: snapshotSchema,
  teamId: z.string().optional(),
  message: z.string(),
});
export const codeSchema = z.object({
  teamId: id,
  pin: z.string().regex(/^[A-Z0-9]{6}$/),
  version: z.number().int().nonnegative(),
});
