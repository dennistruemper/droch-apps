import { z } from "zod";

export const appDefinition = {
  id: "poker",
  title: "Scrum poker",
  description: "Estimate together. No accounts needed.",
  theme: "paper",
} as const;

export const statusSchema = z.object({ app: z.literal("poker"), stage: z.literal("foundation") });
