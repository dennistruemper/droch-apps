import solid from "@solidjs/vite-plugin";
import istanbul from "vite-plugin-istanbul";
import { defineConfig } from "vite";
import { resolve } from "node:path";

export function frontendConfig(root: string, appId: string, repositoryRoot: string) {
  return defineConfig({
    root,
    base: `/${appId}/`,
    plugins: [
      solid(),
      ...(process.env.BROWSER_COVERAGE === "1"
        ? [
            istanbul({
              cwd: repositoryRoot,
              include: ["apps/*/src/**/*.{ts,tsx}", "shared/src/**/*.{ts,tsx}"],
              exclude: ["**/*.test.ts", "**/*.d.ts", "**/node_modules/**"],
              forceBuildInstrument: true,
            }),
          ]
        : []),
    ],
    build: {
      outDir: resolve(repositoryRoot, "dist/client", appId),
      emptyOutDir: true,
      sourcemap: process.env.BROWSER_COVERAGE === "1" ? "inline" : false,
    },
    server: { fs: { allow: [repositoryRoot] } },
  });
}
