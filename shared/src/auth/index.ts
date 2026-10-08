import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { bodyLimit } from "hono/body-limit";
import {
  createHash,
  createHmac,
  randomInt,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { eq, lt, gte } from "drizzle-orm";
import type { connectDatabase } from "../database/index.ts";
import type { SendMail } from "../mail/index.ts";
import { requestCodeSchema, verifyCodeSchema, type User } from "../contracts/auth/index.ts";
import { codes, users, sessions } from "./schema.ts";
export type { User } from "../contracts/auth/index.ts";
export class AuthError extends Error {
  constructor(
    message: string,
    public status: 400 | 401 | 403 | 429 | 503,
  ) {
    super(message);
  }
}
export const sessionLifetime = 30 * 24 * 60 * 60 * 1000;
export function createAuthService(options: {
  db: ReturnType<typeof connectDatabase>["db"];
  secret: string;
  send: SendMail;
  now?: () => number;
  generateCode?: () => string;
  testMode?: boolean;
  mailDelivery?: boolean;
}) {
  const { db } = options,
    now = options.now ?? Date.now;
  const digest = (email: string, code: string) =>
    createHmac("sha256", options.secret).update(`${email}\0${code}`).digest("hex");
  const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
  const codeInstructions = {
    codeLength: options.testMode ? 4 : 6,
    message: options.testMode
      ? options.mailDelivery === false
        ? "Local test mode: use 9999. No email was sent. The code expires in ten minutes."
        : "Test mode: use 9999. We also sent it by email. The code expires in ten minutes."
      : "Check your email for a six-digit code. It expires in ten minutes.",
  };
  return {
    codeInstructions,
    async request(email: string) {
      const code = options.testMode
        ? "9999"
        : (options.generateCode?.() ?? randomInt(1000000).toString().padStart(6, "0"));
      const storedDigest = digest(email, code);
      const sentAt = now();
      db.transaction(() => {
        if (
          db
            .select()
            .from(codes)
            .where(gte(codes.sentAt, now() - 60000))
            .all().length >= 30
        )
          throw new AuthError("Sign-in is busy. Please try again in a minute.", 429);
        const old = db.select().from(codes).where(eq(codes.email, email)).get();
        const withinWindow = old && now() - old.windowStart < 3600000;
        if (old && (now() - old.sentAt < 60000 || (withinWindow && old.requests >= 5)))
          throw new AuthError(
            "Please wait before requesting another code. You can request up to five codes per hour.",
            429,
          );
        db.insert(codes)
          .values({
            email,
            digest: storedDigest,
            expiresAt: now() + 600000,
            sentAt,
            attempts: 0,
            requests: withinWindow ? old.requests + 1 : 1,
            windowStart: withinWindow ? old.windowStart : now(),
          })
          .onConflictDoUpdate({
            target: codes.email,
            set: {
              digest: storedDigest,
              expiresAt: now() + 600000,
              sentAt,
              attempts: 0,
              requests: withinWindow ? old.requests + 1 : 1,
              windowStart: withinWindow ? old.windowStart : now(),
            },
          })
          .run();
      });
      try {
        await options.send({
          to: email,
          subject: "Your Droch apps sign-in code",
          text: `Your sign-in code is ${code}. It expires in 10 minutes. If you did not request it, ignore this email.`,
        });
      } catch {
        db.transaction(() => {
          const row = db.select().from(codes).where(eq(codes.email, email)).get();
          if (row?.digest === storedDigest && row.sentAt === sentAt)
            db.update(codes).set({ digest: "", attempts: 5 }).where(eq(codes.email, email)).run();
        });
        throw new AuthError("Could not send your code. Please try again shortly.", 503);
      }
    },
    verify(email: string, code: string, name: string) {
      // Return failures from the transaction so the attempt counter is committed.
      const result = db.transaction(() => {
        const row = db.select().from(codes).where(eq(codes.email, email)).get();
        if (!row || row.expiresAt <= now() || row.attempts >= 5 || row.digest === "") return null;
        const matches = timingSafeEqual(
          Buffer.from(row.digest, "hex"),
          Buffer.from(digest(email, code), "hex"),
        );
        if (!matches) {
          db.update(codes)
            .set({ attempts: row.attempts + 1 })
            .where(eq(codes.email, email))
            .run();
          return null;
        }
        db.update(codes).set({ digest: "", attempts: 5 }).where(eq(codes.email, email)).run();
        let user = db.select().from(users).where(eq(users.email, email)).get();
        if (!user) {
          user = { id: randomUUID(), email, name, createdAt: now() };
          db.insert(users).values(user).run();
        }
        db.delete(sessions).where(lt(sessions.expiresAt, now())).run();
        const token = randomBytes(32).toString("hex");
        db.insert(sessions)
          .values({ digest: tokenHash(token), userId: user.id, expiresAt: now() + sessionLifetime })
          .run();
        return { token, user: { id: user.id, name: user.name } };
      });
      if (!result)
        throw new AuthError(
          "That code is incorrect, expired, or already used. Request a new code if needed.",
          401,
        );
      return result;
    },
    lookup(token: string | undefined): User | null {
      if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
      const row = db
        .select({ id: users.id, name: users.name, expiresAt: sessions.expiresAt })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(eq(sessions.digest, tokenHash(token)))
        .get();
      return row && row.expiresAt > now() ? { id: row.id, name: row.name } : null;
    },
    logout(token: string | undefined) {
      if (token)
        db.delete(sessions)
          .where(eq(sessions.digest, tokenHash(token)))
          .run();
    },
  };
}
export type AuthService = ReturnType<typeof createAuthService>;
export function createAuthRoutes(options: {
  service: AuthService | null;
  origin: string;
  cookieName: string;
  secure: boolean;
  ready: () => boolean;
}) {
  const routes = new Hono(),
    cookie = `${options.cookieName}_auth`;
  routes.onError((error, c) => {
    if (error instanceof AuthError) return c.json({ error: error.message }, error.status);
    console.error("Auth request failed", { reference: randomUUID(), error: error.name });
    return c.json({ error: "Could not complete sign-in. Please try again." }, 500);
  });
  routes.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    if (!["/session", "/code", "/verify", "/logout"].some((path) => c.req.path.endsWith(path)))
      return c.notFound();
    if (!options.service || !options.ready())
      return c.json(
        {
          error:
            "Account sign-in is not configured or is temporarily unavailable. Please contact the site owner.",
        },
        503,
      );
    if (c.req.method !== "GET" && c.req.header("Origin") !== options.origin)
      return c.json({ error: "Invalid request origin" }, 403);
    await next();
  });
  routes.use(
    "*",
    bodyLimit({ maxSize: 2048, onError: (c) => c.json({ error: "Request too large" }, 413) }),
  );
  routes.get("/session", (c) => c.json({ user: options.service!.lookup(getCookie(c, cookie)) }));
  routes.post("/code", async (c) => {
    const parsed = requestCodeSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Enter a valid email address" }, 400);
    await options.service!.request(parsed.data.email);
    return c.json(options.service!.codeInstructions);
  });
  routes.post("/verify", async (c) => {
    const parsed = verifyCodeSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json({ error: "Enter your email, sign-in code, and a display name" }, 400);
    const result = options.service!.verify(parsed.data.email, parsed.data.code, parsed.data.name);
    setCookie(c, cookie, result.token, {
      httpOnly: true,
      secure: options.secure,
      sameSite: "Lax",
      path: "/api",
      maxAge: sessionLifetime / 1000,
    });
    return c.json({ user: result.user });
  });
  routes.post("/logout", (c) => {
    options.service!.logout(getCookie(c, cookie));
    deleteCookie(c, cookie, { path: "/api" });
    return c.json({ user: null });
  });
  return routes;
}
