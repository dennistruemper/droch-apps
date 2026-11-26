import { expect, test } from "./fixtures.ts";

test("calculates the supplied order and doubles maximum, preserves focus and reloads", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/avantago/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Aufstellung");
  await expect(page.getByRole("textbox")).toHaveCount(12);
  await expect(page.getByRole("group", { name: "Heim", exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "Gast", exact: true })).toBeVisible();
  await page.getByLabel("Name A", { exact: true }).pressSequentially("Anna");
  await expect(page.getByLabel("Name A", { exact: true })).toBeFocused();
  const labels = ["A", "B", "C", "X", "Y", "Z"];
  const ratings = ["900", "1400", "2500", "1100", "1200", "2600"];

  for (const [i, label] of labels.entries())
    await page.getByLabel(`Live-PZ ${label}`, { exact: true }).fill(ratings[i]!);
  await expect(page.getByRole("status")).toHaveText("9 / 10 berechnet");
  const games = page.locator(".game");
  await expect(games).toHaveCount(10);
  await expect(games.locator(".game-order strong")).toHaveText([
    "A : X",
    "B : Y",
    "C : Z",
    "Doppel",
    "B : X",
    "A : Z",
    "C : Y",
    "B : Z",
    "C : X",
    "A : Y",
  ]);
  await expect(games.nth(0)).toContainText("2 : 0");
  await expect(games.nth(0)).toContainText("Vorgabe für Anna");
  await page.locator("#double-0").selectOption("01");
  await page.locator("#double-1").selectOption("01");
  await expect(page.getByRole("status")).toHaveText("10 / 10 berechnet");
  await expect(games.nth(3)).toContainText("Live-PZ 1400 : 1200");
  await expect(games.nth(3)).toContainText("0 : 2");
  await page.getByLabel("Live-PZ A", { exact: true }).fill("1100");
  await expect(games.nth(0)).toContainText("Ohne Vorgabe");
  await expect(games.nth(0)).toContainText("0 : 0");
  await page.getByLabel("Live-PZ A", { exact: true }).fill("1600");
  await expect(games.nth(0)).toContainText("0 : 5");
  await expect(games.nth(0)).toContainText("Vorgabe für X");
  await page.locator("#double-0").selectOption("");
  await expect(games.nth(3)).toContainText("Doppel noch aufstellen");
  await page.locator("#double-0").selectOption("01");
  await page.reload();
  await expect(page.getByLabel("Name A", { exact: true })).toHaveValue("Anna");
  await expect(games.nth(3)).toContainText("0 : 4");
  await page.getByLabel("Live-PZ A", { exact: true }).fill("abc");
  await expect(page.getByRole("alert")).toHaveText("Live-PZ: ganze Zahl von 0 bis 10000.");
  await expect(games.nth(0)).toContainText("Live-PZ ergänzen");
  await page.getByLabel("Live-PZ A", { exact: true }).fill("900");
  const names = ["Anna", "Ben", "Clara", "Max", "Yara", "Zoe"];

  for (const [i, label] of labels.entries())
    await page.getByLabel(`Name ${label}`, { exact: true }).fill(names[i]!);

  for (const width of [320, 375, 1280]) {
    await page.setViewportSize({ width, height: 850 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    if (width === 375 || width === 1280)
      await page.screenshot({
        path: info.outputPath(`calculator-${width}.png`),
        fullPage: width === 375,
      });
  }

  await page.getByText("Vorgabetabelle & Spielregeln", { exact: true }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(10);
  await expect(page.getByText("Der Aufschlag wird ausgelost.")).toBeVisible();

  expect(errors).toEqual([]);
});

test("recovers corrupt or blocked storage and resets only after confirmation", async ({ page }) => {
  await page.goto("/avantago/");
  await page.evaluate(() => {
    localStorage.setItem("droch:avantago:calculator", "broken");
    localStorage.setItem("droch:poker:name", "Keep me");
  });
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("nicht geladen");
  await page.getByLabel("Name A", { exact: true }).fill("Anna");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Zurücksetzen" }).click();
  await expect(page.getByLabel("Name A", { exact: true })).toHaveValue("Anna");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Zurücksetzen" }).click();
  await expect(page.getByLabel("Name A", { exact: true })).toHaveValue("");
  expect(await page.evaluate(() => localStorage.getItem("droch:poker:name"))).toBe("Keep me");
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("Blocked");
      },
    });
  });
  await page.reload();
  await page.getByLabel("Live-PZ A", { exact: true }).fill("1200");
  await page.getByLabel("Live-PZ X", { exact: true }).fill("1400");
  await expect(page.locator(".game").first()).toContainText("2 : 0");
  await expect(page.getByRole("alert")).toContainText("Speichern ist nicht möglich");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Your theme", { exact: true }).selectOption("ink");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "ink");
  await page.getByRole("button", { name: "Close settings", exact: true }).click();
  await expect(page.locator(".game").first()).toContainText("2 : 0");
});

test("uses Paper and Ink system defaults with app-scoped saved theme choices", async ({
  page,
}, info) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/avantago/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "paper");
  await page.getByLabel("Name A", { exact: true }).fill("Anna");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "ink");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByLabel("Your theme", { exact: true })).toHaveValue("system");
  await page.getByLabel("Your theme", { exact: true }).selectOption("paper");
  await page.getByRole("button", { name: "Close settings", exact: true }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "paper");
  await expect(page.getByLabel("Name A", { exact: true })).toHaveValue("Anna");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Your theme", { exact: true }).selectOption("custom");
  await page.getByLabel("Background color", { exact: true }).fill("#223344");
  await page.getByLabel("Text and border color", { exact: true }).fill("#ffffff");
  await page.getByLabel("Font", { exact: true }).selectOption("serif");
  await page.getByRole("button", { name: "Close settings", exact: true }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "custom");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(34, 51, 68)");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Font", { exact: true })).toHaveValue("serif");
  await page.getByRole("button", { name: "Use app default", exact: true }).click();
  await expect(page.getByLabel("Your theme", { exact: true })).toHaveValue("system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "ink");
  await page.screenshot({ path: info.outputPath("settings-ink.png") });
  await page.getByRole("button", { name: "Close settings", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Settings", exact: true })).toBeHidden();
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "paper");
  await page.screenshot({ path: info.outputPath("calculator-paper.png"), animations: "disabled" });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Zurücksetzen", exact: true }).click();
  await expect(page.getByLabel("Name A", { exact: true })).toHaveValue("");
  expect(await page.evaluate(() => localStorage.getItem("droch:avantago:theme"))).toBe("system");
  expect(await page.evaluate(() => localStorage.getItem("droch:poker:theme"))).toBeNull();
});
