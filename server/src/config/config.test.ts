import { describe, expect, it, vi } from "vitest";
import { createAuthRoutes } from "@repo/shared/auth";
import { readConfiguration, accountPolicy } from "./index.ts";

describe("runtime configuration", () => {
  it.each(["https://apps.droch.dev", "http://localhost:50044"])(
    "accepts the public origin %s unchanged",
    (origin) => {
      expect(readConfiguration({ DATA_DIRECTORY: "/data", APP_ORIGIN: origin }).APP_ORIGIN).toBe(
        origin,
      );
    },
  );

  it.each(["https://4.apps.droch.dev", "https://5.apps.droch.dev"])(
    "uses Coolify's runtime URL %s despite a stale production alias",
    (origin) => {
      const configuration = readConfiguration({
        DATA_DIRECTORY: "/data",
        APP_ORIGIN: "https://apps.droch.dev",
        SERVICE_URL_APPLICATION: origin,
        COOLIFY_URL: `${origin},https://www.example.test`,
      });
      expect(configuration.APP_ORIGIN).toBe(origin);
    },
  );

  it("allows preview sign-in requests and rejects production and other preview origins", async () => {
    const configuration = readConfiguration({
      DATA_DIRECTORY: "/data",
      APP_ORIGIN: "https://apps.droch.dev",
      SERVICE_URL_APPLICATION: "https://4.apps.droch.dev",
    });
    const service = {
      codeInstructions: { codeLength: 4, message: "Use 9999." },
      request: vi.fn(),
      verify: vi.fn(),
      lookup: vi.fn(),
      logout: vi.fn(),
    };
    const routes = createAuthRoutes({
      service,
      origin: configuration.APP_ORIGIN,
      cookieName: "preview",
      secure: true,
      ready: () => true,
    });
    for (const [origin, status] of [
      ["https://4.apps.droch.dev", 400],
      ["https://apps.droch.dev", 403],
      ["https://5.apps.droch.dev", 403],
      ["https://4.www.apps.droch.dev", 403],
    ] as const) {
      const response = await routes.request("/code", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: "{}",
      });
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({
        error: status === 400 ? "Enter a valid email address" : "Invalid request origin",
      });
    }
    expect(service.request).not.toHaveBeenCalled();
  });

  it("uses the configured canonical service URL in production too", () => {
    expect(
      readConfiguration({
        DATA_DIRECTORY: "/data",
        APP_ORIGIN: "$SERVICE_URL_APPLICATION",
        SERVICE_URL_APPLICATION: "https://apps.droch.dev",
      }).APP_ORIGIN,
    ).toBe("https://apps.droch.dev");
  });

  it.each([
    "",
    "https://4.apps.droch.dev/",
    "https://4.apps.droch.dev,https://4.www.apps.droch.dev",
    "https://private-user:private-password@4.apps.droch.dev",
  ])(
    "fails closed for malformed Coolify URLs instead of accepting the production fallback",
    (url) => {
      expect(() =>
        readConfiguration({
          DATA_DIRECTORY: "/data",
          APP_ORIGIN: "https://apps.droch.dev",
          SERVICE_URL_APPLICATION: url,
        }),
      ).toThrow("Invalid configuration: APP_ORIGIN");
    },
  );

  it.each([
    undefined,
    "",
    "Set APP_ORIGIN",
    "ftp://apps.droch.dev",
    "https://apps.droch.dev/",
    "https://apps.droch.dev/poker/",
    "https://private-user:private-password@apps.droch.dev",
  ])("rejects an invalid origin with actionable, redacted configuration guidance", (origin) => {
    let failure: unknown;
    try {
      readConfiguration({ DATA_DIRECTORY: "/data", APP_ORIGIN: origin });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(TypeError);
    const message = (failure as Error).message;
    expect(message).toContain("Invalid configuration: APP_ORIGIN");
    expect(message).toContain("APP_ORIGIN must be an HTTP(S) origin");
    expect(message).not.toContain("private-user");
    expect(message).not.toContain("private-password");
  });
});

describe("account delivery modes", () => {
  it.each([
    ["http://localhost:1234", undefined, undefined, false, true, true],
    ["http://localhost:1234", "token", "local", false, true, true],
    ["https://1.apps.example.test", "token", "test", true, true, true],
    ["https://apps.example.test", "token", "production", true, false, true],
    ["https://apps.example.test", undefined, undefined, false, false, false],
  ] as const)(
    "selects delivery and codes for %s",
    (origin, token, mode, sendMail, testMode, ready) => {
      const configuration = readConfiguration({
        DATA_DIRECTORY: "/data",
        APP_ORIGIN: origin,
        MAILTRAP_TOKEN: token,
        MAIL_FROM: token ? "sender@example.test" : undefined,
        AUTH_MODE: mode,
      });
      expect(accountPolicy(configuration)).toEqual({ sendMail, testMode, ready });
    },
  );
  it("requires a sender when a Mailtrap token is configured", () => {
    const configuration = readConfiguration({
      DATA_DIRECTORY: "/data",
      APP_ORIGIN: "https://1.apps.example.test",
      MAILTRAP_TOKEN: "token",
      AUTH_MODE: "test",
    });
    expect(accountPolicy(configuration).ready).toBe(false);
  });
});
