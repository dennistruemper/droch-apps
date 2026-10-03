import { z } from "zod";

const configurationSchema = z.object({
  DATA_DIRECTORY: z.string().min(1),
  APP_ORIGIN: z.url().refine((url) => ["http:", "https:"].includes(new URL(url).protocol)),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  SESSION_COOKIE_NAME: z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .default("droch_session"),
});

export function readConfiguration(environment: Record<string, string | undefined>) {
  const parsed = configurationSchema.safeParse(environment);
  if (!parsed.success) {
    // Report field names, never values containing credentials.
    throw new Error(
      `Invalid configuration: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
    );
  }
  return parsed.data;
}
