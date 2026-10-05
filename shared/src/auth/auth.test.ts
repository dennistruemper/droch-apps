import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { connectDatabase, migrateDatabase } from "../database/index.ts";
import { createTestMailSender } from "../mail/index.ts";
import { createAuthService, createAuthRoutes, sessionLifetime } from "./index.ts";
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const dispose of cleanup.splice(0)) dispose();
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "vortoj-auth-"));
  migrateDatabase(root, "auth", resolve("migrations/auth"));
  const connection = connectDatabase(root, "auth");
  cleanup.push(() => {
    connection.close();
    rmSync(root, { recursive: true, force: true });
  });
  let clock = 1000000;
  const sent: { to: string; text: string }[] = [];
  const options = {
    db: connection.db,
    secret: "a".repeat(64),
    send: async (mail: { to: string; text: string }) => {
      sent.push(mail);
    },
    now: () => clock,
    generateCode: () => "012345",
  };
  return {
    connection,
    sent,
    options,
    service: createAuthService(options),
    advance: (amount: number) => {
      clock += amount;
    },
  };
}
describe("email-code accounts", () => {
  it("stores code/session digests, consumes a code once, reuses users and revokes sessions", async () => {
    const f = fixture();
    await f.service.request("alice@example.test");
    expect(f.sent[0]?.text).toContain("012345");
    const row = f.connection.db.$client.prepare("SELECT digest FROM codes").get() as {
      digest: string;
    };
    expect(row.digest).not.toBe("012345");
    const first = f.service.verify("alice@example.test", "012345", "Alice");
    expect(f.service.lookup(first.token)).toEqual(first.user);
    const stored = f.connection.db.$client.prepare("SELECT digest FROM sessions").get() as {
      digest: string;
    };
    expect(stored.digest).not.toBe(first.token);
    expect(() => f.service.verify("alice@example.test", "012345", "Alice")).toThrow(/already used/);
    f.advance(60001);
    await f.service.request("alice@example.test");
    const next = f.service.verify("alice@example.test", "012345", "Different name");
    expect(next.user).toEqual(first.user);
    f.service.logout(first.token);
    expect(f.service.lookup(first.token)).toBeNull();
    expect(f.service.lookup(next.token)).toEqual(first.user);
    expect(f.service.lookup("b".repeat(64))).toBeNull();
  });
  it("commits wrong attempts and locks the code after five failures", async () => {
    const f = fixture();
    await f.service.request("a@example.test");
    for (let i = 0; i < 5; i++)
      expect(() => f.service.verify("a@example.test", "999999", "A")).toThrow();
    expect(() => f.service.verify("a@example.test", "012345", "A")).toThrow();
    expect(f.connection.db.$client.prepare("SELECT attempts FROM codes").get()).toEqual({
      attempts: 5,
    });
  });
  it("expires codes and sessions using the injected clock", async () => {
    const f = fixture();
    await f.service.request("a@example.test");
    f.advance(600000);
    expect(() => f.service.verify("a@example.test", "012345", "A")).toThrow();
    await f.service.request("a@example.test");
    const signed = f.service.verify("a@example.test", "012345", "A");
    f.advance(sessionLifetime);
    expect(f.service.lookup(signed.token)).toBeNull();
  });
  it("limits resends and hourly requests even after code consumption", async () => {
    const f = fixture();
    await f.service.request("a@example.test");
    await expect(f.service.request("a@example.test")).rejects.toThrow(/wait/);
    for (let i = 0; i < 4; i++) {
      f.advance(60001);
      await f.service.request("a@example.test");
      f.service.verify("a@example.test", "012345", "A");
    }
    f.advance(60001);
    await expect(f.service.request("a@example.test")).rejects.toThrow(/five/);
  });
  it("limits requests across addresses and recovers from mail failure", async () => {
    const f = fixture();
    for (let i = 0; i < 30; i++) await f.service.request(`a${i}@example.test`);
    await expect(f.service.request("extra@example.test")).rejects.toThrow(/busy/);
    f.advance(60001);
    const broken = createAuthService({
      ...f.options,
      send: async () => {
        throw new Error("provider detail");
      },
    });
    await expect(broken.request("broken@example.test")).rejects.toThrow("Could not send");
    await f.service.request("broken@example.test");
  });
  it("enforces origins, cookie flags, expiry and avoids exposing emails", async () => {
    const f = fixture(),
      origin = "https://apps.example.test";
    const app = createAuthRoutes({
      service: f.service,
      origin,
      cookieName: "isolated",
      secure: true,
      ready: () => true,
    });
    expect(
      (
        await app.request("/code", {
          method: "POST",
          body: JSON.stringify({ email: "a@example.test" }),
        })
      ).status,
    ).toBe(403);
    const request = (path: string, body: unknown) =>
      app.request(path, {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    expect((await request("/code", { email: "A@example.test" })).status).toBe(200);
    const signed = await request("/verify", {
      email: "A@example.test",
      code: "012345",
      name: "Alice",
    });
    expect(signed.status).toBe(200);
    expect(signed.headers.get("set-cookie")).toMatch(/HttpOnly/);
    expect(signed.headers.get("set-cookie")).toMatch(/Secure/);
    expect(signed.headers.get("set-cookie")).toMatch(/Path=\/api/);
    expect(JSON.stringify(await signed.json())).not.toContain("email");
    const cookie = signed.headers.get("set-cookie")!.split(";")[0]!;
    expect((await app.request("/session", { headers: { Cookie: cookie } })).status).toBe(200);
    const another = createAuthRoutes({
      service: f.service,
      origin,
      cookieName: "other",
      secure: true,
      ready: () => true,
    });
    expect(
      await (await another.request("/session", { headers: { Cookie: cookie } })).json(),
    ).toEqual({ user: null });
  });
});

describe("test and production codes", () => {
  it("uses 9999 through the real HTTP contract without sending locally", async () => {
    const f = fixture();
    const service = createAuthService({
      ...f.options,
      testMode: true,
      mailDelivery: false,
      send: createTestMailSender(),
    });
    const routes = createAuthRoutes({
      service,
      origin: "http://localhost",
      cookieName: "test",
      secure: false,
      ready: () => true,
    });
    const post = (path: string, data: unknown) =>
      routes.request(path, {
        method: "POST",
        headers: { Origin: "http://localhost", "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    const response = await post("/code", { email: "test@example.test" });
    expect(await response.json()).toMatchObject({
      codeLength: 4,
      message: expect.stringContaining("No email was sent"),
    });
    expect(f.sent).toHaveLength(0);
    expect(
      (await post("/verify", { email: "test@example.test", code: "9999", name: "Test" })).status,
    ).toBe(200);
    expect(
      (await post("/verify", { email: "test@example.test", code: "9999", name: "Test" })).status,
    ).toBe(401);
  });
  it("sends the fixed code in preview mode", async () => {
    const f = fixture();
    const service = createAuthService({ ...f.options, testMode: true });
    await service.request("preview@example.test");
    expect(f.sent[0]?.text).toContain("code is 9999.");
    expect(service.verify("preview@example.test", "9999", "Preview").user.name).toBe("Preview");
  });
  it("generates and sends six-digit codes in production and rejects the test code", async () => {
    const f = fixture();
    const service = createAuthService({
      db: f.options.db,
      secret: f.options.secret,
      send: f.options.send,
    });
    await service.request("prod@example.test");
    const code = f.sent[0]?.text.match(/code is (\d{6})\./)?.[1];
    expect(code).toMatch(/^\d{6}$/);
    expect(() => service.verify("prod@example.test", "9999", "Production")).toThrow();
    expect(service.verify("prod@example.test", code!, "Production").user.name).toBe("Production");
    expect(service.codeInstructions.message).not.toContain("9999");
  });
});
