import { afterAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { checkImport } from "./oxlint-boundaries.mjs";

const root = process.cwd();
const client = resolve(root, "apps/poker/src/client/index.tsx");
const server = resolve(root, "server/src/registry/index.ts");
const fixtures = resolve(root, "apps/poker/src/client/__boundary_checks__");
afterAll(() => rmSync(fixtures, { recursive: true, force: true }));

describe("module boundaries", () => {
  it("allows contracts and browser-safe public exports", () => {
    expect(checkImport(client, "../contracts/index.ts")).toBeNull();
    expect(checkImport(client, "@repo/shared/storage")).toBeNull();
    expect(checkImport(server, "@repo/poker/server")).toBeNull();
  });
  it.each([
    "../server/index.ts",
    "../server/schema.ts",
    "@repo/poker/server",
    "@repo/shared/database",
    "pg",
    "better-sqlite3",
    "node:sqlite",
    "node:fs",
  ])("rejects server dependency %s from a client", (specifier) => {
    expect(checkImport(client, specifier)).toBeTruthy();
  });
  it("rejects relative package bypasses and deep exported paths", () => {
    expect(checkImport(client, "../../../../shared/src/storage/index.ts")).toMatch(/Cross-package/);
    expect(checkImport(server, "@repo/poker/src/server/schema.ts")).toMatch(/public export/);
    expect(
      checkImport(resolve(root, "server/src/frontend/index.ts"), "../config/secret.ts"),
    ).toMatch(/index API/);
  });
  it("rejects app-to-app coupling", () => {
    expect(checkImport(client, "@repo/words/contracts")).toMatch(/other apps/);
  });
  it.each([
    'import "../server/schema.ts";',
    'export * from "../server/schema.ts";',
    'void import("../server/schema.ts");',
    'const server = require("../server/schema.ts"); void server;',
    'type Server = typeof import("../server/index.ts"); export type { Server };',
    'const path = "../server/schema.ts"; void import(path);',
  ])("the actual Oxlint rule rejects %s", (source) => {
    mkdirSync(fixtures, { recursive: true });
    const file = resolve(fixtures, "invalid.ts");
    writeFileSync(file, source.replaceAll('"../server/', '"../../server/'));
    const result = spawnSync(
      resolve(root, "node_modules/.bin/oxlint"),
      ["--threads=1", "--format", "json", file],
      { cwd: root, encoding: "utf8" },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain("repo(boundaries)");
  });
});
