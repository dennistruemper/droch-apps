import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

async function scan(page: Page, info: TestInfo, state: string) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));

  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();

  const path = info.outputPath(`${state}.json`);
  await writeFile(path, JSON.stringify({ state, profile: info.project.name, ...result }, null, 2));
  await info.attach(state, { path, contentType: "application/json" });

  if (result.violations.length > 0) {
    await info.attach(`${state}-screenshot`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  }

  expect
    .soft(
      result.violations.map(({ id, impact, nodes }) => ({
        id,
        impact,
        targets: nodes.map((node) => node.target),
      })),
      state,
    )
    .toEqual([]);
}

for (const route of ["/", "/poker/", "/vortoj/", "/kunludo/", "/schlezaz/", "/enigmo/"]) {
  test(`entry ${route}`, async ({ page }, info) => {
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    await scan(page, info, "entry");
  });
}

test("Poker room and shared settings", async ({ page }, info) => {
  await page.goto("/poker/");
  await page.getByLabel("Room name").fill("Accessibility audit");
  await page.getByLabel("Your name").fill("Audit player");
  await page.getByRole("button", { name: "Create room", exact: true }).click();
  await expect(page.getByText("Live updates connected")).toBeVisible();
  await scan(page, info, "room");
  await page.getByRole("button", { name: "Vote 8", exact: true }).click();
  await page.getByRole("button", { name: "Reveal votes", exact: true }).click();
  await expect(page.getByText("Votes revealed", { exact: true })).toBeVisible();
  await scan(page, info, "revealed");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await scan(page, info, "settings");
  await page.getByLabel("Your theme").selectOption("custom");
  await expect(page.getByRole("group", { name: "Custom theme" })).toBeVisible();
  await scan(page, info, "custom-theme");
});

test("SchleZaZ filled options and generated result", async ({ page }, info) => {
  await page.goto("/schlezaz/");
  await page.getByRole("textbox", { name: "Option 1", exact: true }).fill("Pizza");
  await page.getByRole("textbox", { name: "Option 2", exact: true }).fill("Pasta");
  await scan(page, info, "filled-options");
  await page.getByRole("button", { name: "JETZT GENERIEREN!" }).click();
  await expect(page.locator(".result-value")).toBeVisible({ timeout: 15_000 });
  await scan(page, info, "generated-result");
});

test("Enigmo puzzle", async ({ page }, info) => {
  await page.goto("/enigmo/?code=YMIR");
  await expect(page.locator('input[name="trek"]').first()).toBeVisible();
  await scan(page, info, "puzzle");
});

test("Kunludo account, team forms and calendar selection", async ({ page }, info) => {
  test.skip(
    process.env.TEST_AUTH_MODE !== "local",
    "Requires disposable local auth with no mail delivery",
  );
  await page.goto("/kunludo/");
  await page.getByLabel("E-Mail", { exact: true }).fill(`${randomUUID()}@example.test`);
  await page.getByRole("button", { name: "Anmeldecode senden", exact: true }).click();
  await expect(page.getByLabel("Anmeldecode", { exact: true })).toBeVisible();
  await scan(page, info, "sign-in-code");
  await page.getByLabel("Anmeldecode", { exact: true }).fill("9999");
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page.getByLabel("Anzeigename", { exact: true })).toBeVisible();
  await scan(page, info, "account-name");
  await page.getByLabel("Anzeigename", { exact: true }).fill("Audit player");
  await page.getByRole("button", { name: "Konto erstellen", exact: true }).click();
  await expect(page.getByRole("group", { name: "Ansicht", exact: true })).toBeVisible();
  await scan(page, info, "empty-account");
  await page.getByRole("button", { name: "Team erstellen", exact: true }).click();
  const form = page.getByRole("region", { name: "Team erstellen", exact: true });
  await expect(form).toBeVisible();
  await scan(page, info, "create-team");
  await form.getByLabel("Teamname", { exact: true }).fill("Audit team");
  await form.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(form).toBeHidden();
  await page
    .getByRole("group", { name: "Ansicht", exact: true })
    .getByRole("button", { name: "Teams", exact: true })
    .click();
  await expect(page.getByTestId("team-card")).toBeVisible();
  await scan(page, info, "teams");
  await page.getByRole("button", { name: "Kalender importieren", exact: true }).click();
  await page
    .getByLabel("iCalendar-Datei (.ics)", { exact: true })
    .setInputFiles(resolve("e2e/fixtures/rendsburger-tsv-3.ics"));
  await expect(
    page.getByRole("region", { name: "Kalender importieren", exact: true }),
  ).toContainText("20 Spiele gefunden");
  await scan(page, info, "calendar-selection");
});

async function signIn(page: Page, url: string) {
  await page.goto(url);
  await page.getByLabel("Email address").fill(`${randomUUID()}@example.test`);
  await page.getByRole("button", { name: "Send sign-in code", exact: true }).click();
  await page.getByLabel("Sign-in code").fill("9999");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Account display name", { exact: true }).fill("Audit player");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(page.getByText("Account: Audit player", { exact: true })).toBeVisible();
}

test("Vortoj editor, waiting room and active board", async ({ page, browser }, info) => {
  test.skip(
    process.env.TEST_AUTH_MODE !== "local",
    "Requires disposable local auth with no mail delivery",
  );
  await signIn(page, "/vortoj/");
  await scan(page, info, "lobby");
  await page.getByRole("button", { name: "Open tile editor" }).click();
  await expect(page.getByLabel("Tile set name")).toBeVisible();
  await scan(page, info, "tile-editor");
  await page.getByLabel("Room name").fill("Audit room");
  await page.getByRole("button", { name: "Create room", exact: true }).click();
  await expect(page.getByLabel("Room invitation")).toBeVisible();
  await scan(page, info, "waiting-room");
  const invitation = await page.getByLabel("Room invitation").inputValue();
  const guestContext = await browser.newContext();

  try {
    const guest = await guestContext.newPage();
    await signIn(guest, invitation);
    await guest.getByRole("button", { name: "Join room", exact: true }).click();
    await expect(page.getByRole("button", { name: "Start game" })).toBeEnabled();
    await page.getByRole("button", { name: "Start game" }).click();
    await expect(page.getByRole("heading", { name: "Your tiles" })).toBeVisible();
    await scan(page, info, "active-board");
  } finally {
    await guestContext.close();
  }
});
