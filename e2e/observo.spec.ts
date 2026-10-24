import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { checkSite } from "@repo/observo/server";
import { hourDuration, hourStart, interval, recordSlot } from "@repo/observo/domain";

test("Observo shows public history, slot details, recovery, and a theme-independent palette", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const now = Date.parse("2026-10-24T12:10:00Z");
  await page.clock.install({ time: now });
  await page.clock.pauseAt(now + 1000);
  let requests = 0;
  let outcome: "available" | "unreachable" = "available";
  let healthy = 0,
    degraded = 0,
    down = 0;
  for (let i = 0; i < 12; i++) {
    healthy = recordSlot(healthy, now + i * interval, "available");
    degraded = recordSlot(degraded, now + i * interval, i === 0 ? "not-functional" : "available");
    down = recordSlot(down, now + i * interval, i < 7 ? "unreachable" : "available");
  }
  let fail = true;
  await page.route("**/api/observo/*", (route) => {
    requests++;
    return fail
      ? route.fulfill({ status: 503 })
      : route.fulfill({
          json: {
            generatedAt: now,
            checksEnabled: true,
            sites: [
              {
                id: "tischtennis-rendsburg",
                name: "TischtennisLive · Rendsburg-Eckernförde",
                url: "https://rendsburg-eckernfoerde.tischtennislive.de/",
                description: "Browser checks league standings.",
                latest: {
                  slot: now,
                  checkedAt: now,
                  outcome,
                  reason: outcome === "available" ? "ok" : "network-error",
                  statusCode: 200,
                  durationMs: 1500,
                },
                hours: [
                  { hour: hourStart(now) - hourDuration, slots: healthy },
                  { hour: hourStart(now) - 2 * hourDuration, slots: degraded },
                  { hour: hourStart(now) - 3 * hourDuration, slots: down },
                ],
              },
            ],
          },
        });
  });
  await page.goto("/observo/");
  await expect(page.getByRole("heading", { name: "Is it working?" })).toBeVisible();
  await expect(page.getByRole("alert")).toBeVisible();
  fail = false;
  await page.clock.fastForward(120_000);
  const groups = page.getByRole("group", { name: /^Hourly availability ·/ });
  await expect(groups).toHaveCount(30);
  await expect(groups.first().getByRole("button")).toHaveCount(24);
  await expect(page.getByRole("button", { name: "Refresh", exact: true })).toHaveCount(0);
  await expect(page.locator("footer")).toHaveCount(0);
  await expect(page.locator('button[data-current="true"]')).toHaveAttribute(
    "data-status",
    "available",
  );
  await expect(page.locator('button[data-status="available"]:not([data-current])')).toHaveCount(1);
  await expect(page.locator('button[data-status="degraded"]')).toHaveCount(1);
  await expect(page.locator('button[data-status="mostly-unavailable"]')).toHaveCount(1);
  await page.locator('button[data-status="available"]:not([data-current])').click();
  await expect(
    page.getByRole("list", { name: "Five-minute checks" }).getByRole("listitem"),
  ).toHaveCount(12);
  await expect(page.getByText("12 passed · 0 failed · 0 missing", { exact: true })).toBeVisible();
  const palette = () =>
    page.locator('button[data-status="available"]:not([data-current])').evaluate((element) => ({
      background: getComputedStyle(element).backgroundColor,
      color: getComputedStyle(element).color,
    }));
  const original = await palette();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Your theme").selectOption("ink");
  await page.getByRole("button", { name: "Close settings" }).click();
  expect(await palette()).toEqual(original);
  const before = requests;
  await page.clock.fastForward(119_000);
  expect(requests).toBe(before);
  outcome = "unreachable";
  await page.clock.fastForward(1000);
  await expect(page.locator('button[data-current="true"]')).toHaveAttribute(
    "data-status",
    "unavailable",
  );
  outcome = "available";
  await page.clock.fastForward(120_000);
  await expect(page.locator('button[data-current="true"]')).toHaveAttribute(
    "data-status",
    "available",
  );
  fail = true;
  await page.clock.fastForward(360_000);
  await expect(page.locator('button[data-current="true"]')).toHaveAttribute(
    "data-status",
    "unknown",
  );
  await page.setViewportSize({ width: 320, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('button[data-status="mostly-unavailable"]').click();
  await expect(page.getByText("5 passed · 7 failed · 0 missing", { exact: true })).toBeVisible();
  await page.screenshot({ path: ".local/observo-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: ".local/observo-desktop.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("browser monitor submits a fresh confirmation token and requires populated league data", async ({
  playwright,
}) => {
  test.setTimeout(60_000);
  let posts = 0;
  let broken = false;
  const server = createServer((request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    if (request.method === "POST" && request.url === "/default.aspx?Token=fresh-token") {
      posts++;
      response.setHeader("Set-Cookie", "verified=yes; Path=/; HttpOnly");
      response.writeHead(303, { Location: "/home" }).end();
    } else if (!request.headers.cookie?.includes("verified=yes")) {
      response.end(
        '<form method="post" action="/default.aspx?Token=fresh-token"><button>Ich bin ein Mensch</button></form>',
      );
    } else if (request.url === "/league") {
      response.end(
        `<h1>Kreisliga Erwachsene</h1><table><tr><th>Mannschaft</th><th>Punkte</th></tr>${broken ? "" : '<tr id="21842_Team1"><td><a href="/?L3=Mannschaften">Fixture team</a></td><td>10 : 0</td></tr>'}</table>`,
      );
    } else if (request.url === "/competition") {
      response.end('<a href="/league">Kreisliga</a>');
    } else {
      response.end('<a href="/competition">Spielbetrieb</a>');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing fixture port");
  const site = {
    id: "fixture",
    name: "Fixture",
    url: `http://127.0.0.1:${address.port}/`,
    description: "Fixture",
    navigation: ["Spielbetrieb", "Kreisliga"],
    resultHeading: "Kreisliga Erwachsene",
    rowSelector: 'tr[id*="_Team"]',
  };
  const options = {
    signal: new AbortController().signal,
    now: Date.now,
    launch: () =>
      playwright.chromium.launch({
        ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
      }),
  };
  try {
    expect(await checkSite(site, options)).toMatchObject({
      outcome: "available",
      reason: "ok",
      statusCode: 200,
    });
    expect(posts).toBe(1);
    broken = true;
    expect(await checkSite(site, options)).toMatchObject({
      outcome: "not-functional",
      reason: "workflow-failed",
    });
    expect(posts).toBe(2); // Fresh browser contexts do not retain session cookies.
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
