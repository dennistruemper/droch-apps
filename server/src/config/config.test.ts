import { describe, expect, it } from "vitest";
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
