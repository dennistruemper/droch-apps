import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import coverageLibrary, { type CoverageMapData } from "istanbul-lib-coverage";
import report from "./browser-coverage-report.ts";
import setup from "./browser-coverage-setup.ts";
import { frontendConfig } from "./frontend.ts";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(resolve(tmpdir(), "droch-browser-report-"));
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

async function put(path: string, contents: string) {
  const target = resolve(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, contents);
}

function snapshot(path: string, first: number, second: number) {
  return {
    path,
    statementMap: {
      0: { start: { line: 1, column: 0 }, end: { line: 1, column: 20 } },
      1: { start: { line: 2, column: 0 }, end: { line: 2, column: 20 } },
    },
    s: { 0: first, 1: second },
    fnMap: {},
    f: {},
    branchMap: {},
    b: {},
  };
}

test("merges player snapshots, remaps Docker sources, and reports unobserved modules", async () => {
  const source = "/workspace/apps/poker/src/client/example.ts";
  const generated = "/workspace/bundle.js";

  const inputSourceMap = {
    version: 3,
    file: generated,
    sources: [source],
    names: [],
    mappings: "AAAA;AACA",
    sourcesContent: ["export const one = 1;\nexport const two = 2;\n"],
  };

  const ignored = "/workspace/apps/poker/src/client/example.test.ts";
  const server = "/workspace/server/src/main.ts";
  await put(
    ".local/browser-coverage/player1.json",
    JSON.stringify({
      [generated]: { ...snapshot(generated, 1, 0), inputSourceMap },
      [ignored]: snapshot(ignored, 1, 1),
      [server]: snapshot(server, 1, 1),
    }),
  );
  await put(
    ".local/browser-coverage/player2.json",
    JSON.stringify({
      [generated]: { ...snapshot(generated, 0, 1), inputSourceMap },
    }),
  );
  await put("apps/poker/src/client/example.ts", inputSourceMap.sourcesContent[0] ?? "");
  await put("apps/poker/src/client/unloaded.ts", "export const unloaded = 1;\n");
  await put("apps/poker/src/client/example.test.ts", "");
  await put("shared/src/storage/example.d.ts", "");
  vi.spyOn(process, "cwd").mockReturnValue(root);
  await report();
  vi.restoreAllMocks();

  const data: CoverageMapData = JSON.parse(
    await readFile(resolve(root, "coverage/browser/coverage-final.json"), "utf8"),
  );

  const map = coverageLibrary.createCoverageMap(data);
  expect(map.files()).toEqual([resolve(root, "apps/poker/src/client/example.ts")]);
  expect(map.getCoverageSummary().lines).toMatchObject({ total: 2, covered: 2, pct: 100 });
  expect(
    JSON.parse(await readFile(resolve(root, "coverage/browser/unobserved-sources.json"), "utf8")),
  ).toEqual(["apps/poker/src/client/unloaded.ts"]);
  expect(await readFile(resolve(root, "coverage/browser/lcov.info"), "utf8")).toContain(
    "SF:apps/poker/src/client/example.ts",
  );
  expect(await readFile(resolve(root, "coverage/browser/index.html"), "utf8")).toContain(
    "All files",
  );
});

test("missing instrumentation, unrelated snapshots and corrupt data fail instead of reporting success", async () => {
  await put(".local/browser-coverage/empty.json", "{}");
  vi.spyOn(process, "cwd").mockReturnValue(root);
  await expect(report()).rejects.toThrow("No browser coverage collected");
  const path = "/workspace/server/src/main.ts";
  await put(".local/browser-coverage/empty.json", JSON.stringify({ [path]: snapshot(path, 1, 1) }));
  await expect(report()).rejects.toThrow("no mapped application sources");
  await put(".local/browser-coverage/empty.json", "corrupt");
  await expect(report()).rejects.toThrow(SyntaxError);
});

test("setup clears only browser outputs and snapshots, preserving unit reports and checkout data", async () => {
  await put("coverage/browser/stale.json", "stale");
  await put(".local/browser-coverage/stale.json", "stale");
  await put("coverage/full/keep.txt", "unit coverage");
  await put(".local/data/keep.txt", "database");
  vi.spyOn(process, "cwd").mockReturnValue(root);
  await setup();
  await setup();
  expect(await readdir(resolve(root, ".local/browser-coverage"))).toEqual([]);
  await expect(readFile(resolve(root, "coverage/browser/stale.json"))).rejects.toThrow("ENOENT");
  expect(await readFile(resolve(root, "coverage/full/keep.txt"), "utf8")).toBe("unit coverage");
  expect(await readFile(resolve(root, ".local/data/keep.txt"), "utf8")).toBe("database");
});

test("only coverage builds enable Istanbul and inline source maps", () => {
  vi.stubEnv("BROWSER_COVERAGE", "0");
  const production = frontendConfig(root, "poker", root);
  vi.stubEnv("BROWSER_COVERAGE", "1");
  const instrumented = frontendConfig(root, "poker", root);
  expect(production.build?.sourcemap).toBe(false);
  expect(instrumented.build?.sourcemap).toBe("inline");
  expect(instrumented.plugins?.flat()).toHaveLength((production.plugins?.flat().length ?? 0) + 1);
});
