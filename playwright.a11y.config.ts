import { defineConfig } from "@playwright/test";
import base from "./playwright.config.ts";

export default defineConfig(base, {
  testDir: "./e2e/accessibility",
  testIgnore: [],
  timeout: 120_000,
  workers: 1,
  outputDir: "test-results/a11y",
  reporter: [["list"], ["html", { outputFolder: "playwright-report/a11y", open: "never" }]],
  projects: [
    {
      name: "desktop-light",
      use: { viewport: { width: 1440, height: 1000 }, colorScheme: "light" },
    },
    { name: "desktop-dark", use: { viewport: { width: 1440, height: 1000 }, colorScheme: "dark" } },
    {
      name: "mobile-light",
      use: {
        viewport: { width: 375, height: 812 },
        colorScheme: "light",
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
