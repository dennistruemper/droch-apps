import {
  test as base,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import type { CoverageMapData } from "istanbul-lib-coverage";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";

type CoverageWindow = Window & {
  __coverage__?: CoverageMapData;
  __drochTakeCoverage?: () => CoverageMapData[];
};

// Wrap the worker browser so manually created multiplayer contexts participate too.
export const test = base.extend<{}, { browser: Browser }>({
  browser: [
    async ({ browser }, use) => {
      if (process.env.BROWSER_COVERAGE !== "1") {
        await use(browser);

        return;
      }

      const newContext = browser.newContext.bind(browser);
      const contexts = new Set<BrowserContext>();

      const save = async (data: CoverageMapData | undefined) => {
        if (!data || !Object.keys(data).length) return;
        await writeFile(`.local/browser-coverage/${randomUUID()}.json`, JSON.stringify(data));
      };

      const capture = async (page: Page) => {
        if (page.isClosed()) return;

        const snapshots = await page.evaluate(() => {
          // SAFETY: The coverage fixture and test-only instrumented build own these optional window properties.
          const target = window as CoverageWindow;

          return target.__drochTakeCoverage?.() ?? [target.__coverage__];
        });

        for (const data of snapshots) await save(data);
      };

      browser.newContext = async (options) => {
        const context = await newContext(options);
        contexts.add(context);
        await context.addInitScript(() => {
          if (!/^https?:$/.test(location.protocol)) return;
          const key = "__droch_browser_coverage__";
          const storage = window.sessionStorage;
          // Preserve native methods: storage-failure tests deliberately replace the prototype.
          const get = storage.getItem.bind(storage);
          const set = storage.setItem.bind(storage);
          const remove = storage.removeItem.bind(storage);
          // SAFETY: The coverage fixture and test-only instrumented build own these optional window properties.
          const target = window as CoverageWindow;
          target.__drochTakeCoverage = () => {
            const pending: CoverageMapData[] = JSON.parse(get(key) ?? "[]");
            remove(key);

            if (target.__coverage__) pending.push(target.__coverage__);

            return pending;
          };

          window.addEventListener("pagehide", () => {
            const pending: CoverageMapData[] = JSON.parse(get(key) ?? "[]");

            if (target.__coverage__) pending.push(target.__coverage__);
            // Synchronous storage survives destruction of this document; async bindings do not.
            set(key, JSON.stringify(pending));
          });
        });
        context.on("page", (page) => {
          const goto = page.goto.bind(page);
          page.goto = async (...args) => {
            await capture(page);

            return goto(...args);
          };

          const reload = page.reload.bind(page);
          page.reload = async (...args) => {
            await capture(page);

            return reload(...args);
          };

          const close = page.close.bind(page);
          page.close = async (...args) => {
            await capture(page);

            return close(...args);
          };
        });
        const close = context.close.bind(context);
        context.close = async (...args) => {
          for (const page of context.pages()) await capture(page);
          await close(...args);
          contexts.delete(context);
        };

        return context;
      };

      try {
        await use(browser);
      } finally {
        try {
          for (const context of contexts) await context.close();
        } finally {
          browser.newContext = newContext;
        }
      }
    },
    { scope: "worker" },
  ],
});

export { expect };
