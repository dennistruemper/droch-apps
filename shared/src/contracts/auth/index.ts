import { z } from "zod";
export const emailSchema = z
  .email()
  .max(254)
  .transform((email) => email.trim().toLowerCase());
export const requestCodeSchema = z.object({ email: emailSchema });
export const verifyCodeSchema = z.object({
  email: emailSchema,
  code: z.string().regex(/^(?:\d{4}|\d{6})$/),
  name: z.string().trim().min(1).max(32),
});
export const userSchema = z.object({ id: z.string().uuid(), name: z.string().min(1).max(32) });
export const sessionSchema = z.object({ user: userSchema.nullable() });
export type User = z.infer<typeof userSchema>;

export const codeInstructionsSchema = z.object({
  codeLength: z.union([z.literal(4), z.literal(6)]),
  message: z.string(),
});
