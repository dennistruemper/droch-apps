import { z } from "zod";

export const appDefinition = {
  id: "poker",
  title: "Scrum poker",
  description: "Estimate together. No accounts needed.",
  theme: "paper",
} as const;
export const deck = ["0", "1", "2", "3", "5", "8", "13", "21", "?", "☕"] as const;
export const voteSchema = z.enum(deck);
export const roomIdSchema = z.string().regex(/^[a-f0-9]{24}$/);
export const nameSchema = z.string().trim().min(1).max(32);
export const createRoomSchema = z.object({
  name: nameSchema,
  title: z.string().trim().min(1).max(100),
});
export const joinRoomSchema = z.object({ name: nameSchema });
export const voteCommandSchema = z.object({
  round: z.number().int().positive(),
  vote: voteSchema.nullable(),
});
export const roundCommandSchema = z.object({ round: z.number().int().positive() });
export const statusSchema = z.object({ app: z.literal("poker"), stage: z.literal("foundation") });
export const roomInfoSchema = z.object({
  id: roomIdSchema,
  title: z.string(),
  participantCount: z.number().int(),
});
export const roomSnapshotSchema = z.object({
  id: roomIdSchema,
  title: z.string(),
  round: z.number().int().positive(),
  version: z.number().int().positive(),
  revealed: z.boolean(),
  participants: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      isCreator: z.boolean(),
      hasVoted: z.boolean(),
      vote: voteSchema.nullable(),
    }),
  ),
  you: z.object({ id: z.string(), isCreator: z.boolean(), vote: voteSchema.nullable() }),
});
export type Vote = z.infer<typeof voteSchema>;
export type RoomSnapshot = z.infer<typeof roomSnapshotSchema>;
export type RoomInfo = z.infer<typeof roomInfoSchema>;
