import { z } from "zod";

export const appDefinition = {
  id: "words",
  title: "Words",
  description: "A word game at your own pace. Every turn can wait.",
  theme: "gamegirl",
} as const;

export const statusSchema = z.object({ app: z.literal("words"), stage: z.literal("foundation") });
