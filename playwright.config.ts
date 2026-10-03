import { defineConfig } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";

const file = ".local/dev/.env";
const localOrigin = existsSync(file)
  ? readFileSync(file, "utf8")
      .split("\n")
      .find((line) => line.startsWith("APP_ORIGIN="))
      ?.slice("APP_ORIGIN=".length)
  : undefined;
const baseURL = process.env.TEST_BASE_URL ?? localOrigin;
if (!baseURL) throw new Error("Start pnpm dev first or set TEST_BASE_URL");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  use: {
    baseURL,
    browserName: "chromium",
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
    trace: "retain-on-failure",
  },
});
