import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vite";
import { resolve } from "node:path";

export function frontendConfig(root: string, appId: string, repositoryRoot: string) {
  return defineConfig({
    root,
    base: `/${appId}/`,
    plugins: [solid()],
    build: { outDir: resolve(repositoryRoot, "dist/client", appId), emptyOutDir: true },
    server: { fs: { allow: [repositoryRoot] } },
  });
}
