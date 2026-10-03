import { build as buildFrontend } from "vite";
import { build as buildServer } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { applications, validateApplications } from "@repo/server/registry";
import { createRequire } from "node:module";
import { frontendConfig } from "./frontend.ts";

const root = process.cwd();
validateApplications(applications);
await rm(resolve(root, "dist"), { recursive: true, force: true });
for (const app of applications) {
  await buildFrontend(frontendConfig(resolve(root, "apps", app.id), app.id, root));
}
await mkdir(resolve(root, "dist/server"), { recursive: true });
await buildServer({
  entryPoints: { main: "server/src/main.ts", migrate: "tooling/migrate.ts" },
  outdir: "dist/server",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  define: { "process.env.DROCH_BUILD": '"production"' },
  sourcemap: true,
  external: ["vite", "@solidjs/vite-plugin", resolve(root, "tooling/frontend.ts")],
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
  },
});
await cp(resolve(root, "shared/src/styles"), resolve(root, "dist/styles"), { recursive: true });

const requireShared = createRequire(resolve(root, "shared/package.json"));
const driver = requireShared.resolve("better-sqlite3");
await mkdir(resolve(root, "dist/native"), { recursive: true });
// better-sqlite3 13 ships platform-specific N-API binaries in the package.
await cp(
  resolve(dirname(driver), `../prebuilds/${process.platform}-${process.arch}.node`),
  resolve(root, "dist/native/better_sqlite3.node"),
);
