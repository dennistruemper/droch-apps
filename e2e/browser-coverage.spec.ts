import { test, expect } from "./fixtures.ts";
import type { Page } from "@playwright/test";
import type { CoverageMapData } from "istanbul-lib-coverage";
import { readdir, readFile } from "node:fs/promises";

async function probe(page: Page, name: string) {
  await page.evaluate((name) => {
    // SAFETY: The coverage fixture and test-only instrumented build own these optional window properties.
    const target = window as Window & { __coverage__?: CoverageMapData };
    const path = `/coverage-probe/${name}.js`;
    const loc = { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } };
    target.__coverage__ ??= {};
    target.__coverage__[path] = {
      path,
      statementMap: { "0": loc },
      fnMap: { "0": { name, decl: loc, loc, line: 1 } },
      branchMap: {},
      s: { "0": 1 },
      f: { "0": 1 },
      b: {},
    };
  }, name);
}

test("coverage preserves navigation and separately closed player contexts", async ({
  browser,
  baseURL,
}) => {
  test.skip(process.env.BROWSER_COVERAGE !== "1", "Coverage plumbing check");
  const a = await browser.newContext();
  const b = await browser.newContext();

  try {
    const first = await a.newPage();
    const second = await b.newPage();
    await first.goto(`${baseURL}/schlezaz/`);
    await probe(first, "beforeNavigation");
    // Page-initiated navigation must flush too, without relying on our goto wrapper.
    await first.evaluate(() => window.location.assign("/schlezaz/?coverage=next"));
    await first.waitForURL("**/schlezaz/?coverage=next");
    await first.waitForLoadState();
    await probe(first, "beforeReload");
    await first.reload();
    await probe(first, "afterReload");
    await second.goto(`${baseURL}/enigmo/`);
    await probe(second, "otherPlayer");
    await first.close();
    await b.close();
    const names = new Set<string>();

    for (const file of await readdir(".local/browser-coverage")) {
      const data: CoverageMapData = JSON.parse(
        await readFile(`.local/browser-coverage/${file}`, "utf8"),
      );

      for (const [path, entry] of Object.entries(data)) {
        if (path.startsWith("/coverage-probe/") && entry.f["0"]! > 0)
          names.add(entry.fnMap["0"]!.name);
      }
    }

    for (const name of ["beforeNavigation", "beforeReload", "afterReload", "otherPlayer"])
      expect([...names]).toContain(name);
  } finally {
    await a.close();

    if (b.pages().length) await b.close();
  }
});
