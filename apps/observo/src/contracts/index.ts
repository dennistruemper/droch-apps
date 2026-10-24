import { z } from "zod";

export const appDefinition = {
  id: "observo",
  title: "Observo",
  description: "Website availability, observed every five minutes.",
  theme: "paper",
} as const;

export const outcomeSchema = z.enum(["available", "unreachable", "not-functional"]);
export type Outcome = z.infer<typeof outcomeSchema>;
export const reasonSchema = z.enum([
  "ok",
  "http-error",
  "network-error",
  "timeout",
  "workflow-failed",
  "verification-required",
  "redirect-blocked",
]);
export type Reason = z.infer<typeof reasonSchema>;
export const latestSchema = z.object({
  checkedAt: z.number().int().nonnegative(),
  slot: z.number().int().nonnegative(),
  outcome: outcomeSchema,
  reason: reasonSchema,
  statusCode: z.number().int().min(100).max(599).nullable(),
  durationMs: z.number().int().nonnegative(),
});
export type Latest = z.infer<typeof latestSchema>;
export const dashboardSchema = z.object({
  generatedAt: z.number().int().nonnegative(),
  checksEnabled: z.boolean(),
  sites: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      url: z.url(),
      description: z.string(),
      latest: latestSchema.nullable(),
      hours: z
        .array(
          z.object({
            hour: z.number().int().nonnegative(),
            slots: z.number().int().min(0).max(0xffffff),
          }),
        )
        .max(720),
    }),
  ),
});
export type Dashboard = z.infer<typeof dashboardSchema>;
