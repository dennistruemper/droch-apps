import { z } from "zod";

const configurationSchema = z.object({
  AUTH_SECRET: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(32).max(256).optional(),
  ),
  AUTH_MODE: z.enum(["local", "test", "production"]).default("production"),
  MAILTRAP_TOKEN: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().optional(),
  ),
  MAIL_FROM: z.preprocess((value) => (value === "" ? undefined : value), z.email().optional()),
  MAILTRAP_SANDBOX_ID: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().regex(/^\d+$/).optional(),
  ),
  DATA_DIRECTORY: z.string().min(1),
  APP_ORIGIN: z.string().refine((value) => {
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) && url.origin === value;
    } catch {
      return false;
    }
  }),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  SESSION_COOKIE_NAME: z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .default("droch_session"),
});

export function readConfiguration(environment: Record<string, string | undefined>) {
  // Coolify supplies the service's canonical URL at runtime. Resolving an
  // APP_ORIGIN alias during Compose parsing can retain the production URL in previews.
  const parsed = configurationSchema.safeParse({
    ...environment,
    APP_ORIGIN: environment.SERVICE_URL_APPLICATION ?? environment.APP_ORIGIN,
  });
  if (!parsed.success) {
    // Report field names, never values containing credentials.
    const originHint = parsed.error.issues.some((issue) => issue.path[0] === "APP_ORIGIN")
      ? ". APP_ORIGIN must be an HTTP(S) origin, for example https://apps.example.com, without a path, trailing slash, or credentials. In Coolify, check SERVICE_URL_APPLICATION as well"
      : "";
    throw new Error(
      `Invalid configuration: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}${originHint}`,
    );
  }
  return parsed.data;
}

export function accountPolicy(configuration: ReturnType<typeof readConfiguration>) {
  const local = ["localhost", "127.0.0.1"].includes(new URL(configuration.APP_ORIGIN).hostname);
  const localMode = configuration.AUTH_MODE === "local" || (local && !configuration.MAILTRAP_TOKEN);
  const sendMail = !localMode && Boolean(configuration.MAILTRAP_TOKEN);
  const testMode = localMode || configuration.AUTH_MODE === "test";
  return {
    testMode,
    sendMail,
    ready: (testMode || sendMail) && (!sendMail || Boolean(configuration.MAIL_FROM)),
  };
}
