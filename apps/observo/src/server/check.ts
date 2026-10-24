import { chromium, type Browser, type Page } from "playwright";
import type { Latest } from "../contracts/index.ts";
import { slotStart } from "../domain/index.ts";
import type { Site } from "./sites.ts";

export async function checkSite(
  site: Site,
  options: {
    signal: AbortSignal;
    now: () => number;
    launch?: () => Promise<Browser>;
  },
): Promise<Latest> {
  const started = options.now();
  // A launch failure means the monitor failed, not that the website is down.
  const browser = await (
    options.launch ?? (() => chromium.launch({ headless: true, timeout: 15_000 }))
  )();
  const close = () => {
    void browser.close().catch(() => {});
  };
  const deadline = setTimeout(close, 60_000);
  options.signal.addEventListener("abort", close, { once: true });
  let reached = false;
  let statusCode: number | null = null;
  let blockedNavigation = false;
  let page: Page | undefined;
  const result = (outcome: Latest["outcome"], reason: Latest["reason"]): Latest => ({
    slot: slotStart(started),
    checkedAt: started,
    outcome,
    reason,
    statusCode,
    durationMs: Math.max(0, Math.round(options.now() - started)),
  });
  const confirmationVisible = async () =>
    !!page &&
    (await page.getByRole("button", { name: "Ich bin ein Mensch", exact: true }).isVisible());
  try {
    if (options.signal.aborted) throw new Error("Check cancelled");
    const context = await browser.newContext({ serviceWorkers: "block", acceptDownloads: false });
    const origin = new URL(site.url).origin;
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      // Restrict the browser to the code-defined origin. The only POST allowed is
      // the site's observed tokenized confirmation form, never arbitrary actions.
      const confirmation =
        request.method() === "POST" &&
        /\/default\.aspx$/i.test(url.pathname) &&
        url.searchParams.has("Token");
      const allowed =
        url.origin === origin && (["GET", "HEAD"].includes(request.method()) || confirmation);
      if (!allowed && request.isNavigationRequest()) blockedNavigation = true;
      if (!allowed || ["image", "media", "font"].includes(request.resourceType()))
        await route.abort();
      else await route.continue();
    });
    page = await context.newPage();
    page.setDefaultTimeout(8_000);
    page.on("response", (response) => {
      if (response.request().isNavigationRequest() && response.frame() === page?.mainFrame())
        statusCode = response.status();
    });
    await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    reached = true;
    if (statusCode === null || statusCode >= 400) return result("not-functional", "http-error");
    if (await confirmationVisible()) {
      await page.getByRole("button", { name: "Ich bin ein Mensch", exact: true }).click();
      await page.waitForLoadState("domcontentloaded");
      if (await confirmationVisible()) return result("not-functional", "verification-required");
    }
    for (const name of site.navigation) {
      await page.getByRole("link", { name, exact: true }).first().click();
      await page.waitForLoadState("domcontentloaded");
    }
    await page.getByText(site.resultHeading, { exact: true }).waitFor({ state: "visible" });
    await page.getByText("Mannschaft", { exact: true }).first().waitFor({ state: "visible" });
    await page.getByText("Punkte", { exact: true }).first().waitFor({ state: "visible" });
    const row = page
      .locator(site.rowSelector)
      .filter({ has: page.locator('a[href*="L3=Mannschaften"]'), hasText: /\d+\s*:\s*\d+/ })
      .first();
    await row.waitFor({ state: "visible" });
    if (blockedNavigation) return result("not-functional", "redirect-blocked");
    if (statusCode !== null && statusCode >= 400) return result("not-functional", "http-error");
    return result("available", "ok");
  } catch (error) {
    if (options.signal.aborted || !browser.isConnected()) throw error;
    if (blockedNavigation) return result("not-functional", "redirect-blocked");
    if (await confirmationVisible().catch(() => false))
      return result("not-functional", "verification-required");
    return result(
      reached ? "not-functional" : "unreachable",
      reached
        ? "workflow-failed"
        : error instanceof Error && error.name === "TimeoutError"
          ? "timeout"
          : "network-error",
    );
  } finally {
    clearTimeout(deadline);
    options.signal.removeEventListener("abort", close);
    await browser.close().catch(() => {});
  }
}
