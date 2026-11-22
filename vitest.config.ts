import { defineConfig } from "vitest/config";
import solid from "@solidjs/vite-plugin";

export default defineConfig({
  plugins: [solid()],
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", ".local/**"],
    coverage: {
      provider: "v8",
      include: [
        "apps/*/src/**/*.{ts,tsx}",
        "server/src/**/*.ts",
        "shared/src/**/*.{ts,tsx}",
        "tooling/**/*.{ts,mjs}",
      ],
      exclude: ["**/*.test.ts", "**/*.d.ts"],
      reporter: ["text", "html", "lcovonly", "json-summary"],
      reportsDirectory: "coverage/full",
      reportOnFailure: true,
    },
  },
});
