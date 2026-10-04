import { describe, expect, it } from "vitest";
import { readConfiguration } from "./index.ts";

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
