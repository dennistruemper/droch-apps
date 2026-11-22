import { readdir, readFile, mkdir, glob, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import coverageLibrary, { type CoverageMapData } from "istanbul-lib-coverage";
import reportLibrary from "istanbul-lib-report";
import reports from "istanbul-reports";
import sourceMapLibrary from "istanbul-lib-source-maps";

export default async function report() {
  const map = coverageLibrary.createCoverageMap({});

  for (const file of await readdir(".local/browser-coverage")) {
    const data: CoverageMapData = JSON.parse(
      await readFile(`.local/browser-coverage/${file}`, "utf8"),
    );

    map.merge(data);
  }

  if (!map.files().length)
    throw new Error(
      "No browser coverage collected: rebuild with BROWSER_COVERAGE=1 and use e2e/fixtures.ts",
    );
  const sourceMaps = sourceMapLibrary.createSourceMapStore();
  const mapped = await sourceMaps.transformCoverage(map);
  const local = coverageLibrary.createCoverageMap({});

  for (const file of mapped.files()) {
    // Builds may originate in /workspace inside Docker. Normalize to this checkout.
    const source = file
      .replaceAll("\\", "/")
      .match(/(?:^|\/)(apps\/[^/]+\/src\/(?:client|contracts|domain)\/.*|shared\/src\/.*)$/)?.[1];

    if (!source || /\.(test|spec)\.[cm]?[jt]sx?$/.test(source)) continue;
    const coverage = { ...mapped.fileCoverageFor(file).data };
    coverage.path = resolve(source);
    local.addFileCoverage(coverage);
  }

  if (!local.files().length)
    throw new Error("Browser coverage contains no mapped application sources");
  await mkdir("coverage/browser", { recursive: true });
  const observed = new Set(local.files());
  const unobserved = [];

  for await (const file of glob([
    "apps/*/src/{client,contracts,domain}/**/*.{ts,tsx}",
    "shared/src/{settings,navigation,storage,contracts}/**/*.{ts,tsx}",
  ])) {
    if (!/\.(test|spec|d)\.tsx?$/.test(file) && !observed.has(resolve(file))) unobserved.push(file);
  }

  await writeFile(
    "coverage/browser/unobserved-sources.json",
    JSON.stringify(unobserved.sort(), null, 2) + "\n",
  );
  console.log(
    `Browser coverage: ${local.files().length} observed sources; ${unobserved.length} other candidate frontend sources listed in unobserved-sources.json`,
  );

  const context = reportLibrary.createContext({
    dir: "coverage/browser",
    coverageMap: local,
    sourceFinder: (file) => {
      const original = mapped.files().find((path) => path.endsWith(relative(process.cwd(), file)));

      return sourceMaps.sourceFinder(original ?? file);
    },
  });

  for (const reporter of ["html", "lcovonly", "json", "json-summary", "text-summary"] as const)
    reports.create(reporter).execute(context);
}
