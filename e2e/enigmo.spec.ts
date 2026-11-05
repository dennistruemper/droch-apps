import { expect, test } from "@playwright/test";

const correct = {
  trek: "G",
  galaxy: "I",
  linux: "N",
  gaming: "G",
  pokemon: "E",
  magic: "R",
  printing: "R",
  ymir: "A",
  knitting: "N",
};

test("Enigmo code entry, answering, reload, final word and treasure on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/enigmo/");
  await expect(page.getByRole("button", { name: "Rätsel öffnen" })).toBeDisabled();
  await expect(page.locator("fieldset")).toHaveCount(0);
  await page.getByLabel("Dein Rätselcode").fill(" ymir ");
  await page.getByRole("button", { name: "Rätsel öffnen" }).click();
  await expect(page).toHaveURL(/\/enigmo\/\?code=YMIR$/);
  await expect(page.locator(".letter-slots")).toHaveText("_________");
  await expect(page.getByLabel("Dein Lösungswort", { exact: true })).toHaveCount(0);
  await page.locator('input[name="trek"][value="K"]').check();
  await expect(page.locator(".letter-slots")).toHaveText("K________");
  await expect(page.locator(".feedback")).toHaveCount(0);
  await page.reload();
  await expect(page.locator('input[name="trek"][value="K"]')).toBeChecked();
  for (const [name, value] of Object.entries(correct)) {
    if (name !== "trek") await page.locator(`input[name="${name}"][value="${value}"]`).check();
  }
  await expect(page.locator(".letter-slots")).toHaveText("KINGERRAN");
  await page.getByLabel("Dein Lösungswort", { exact: true }).fill("garnering");
  await page.getByRole("button", { name: "Lösung prüfen" }).click();
  await expect(page.locator(".feedback")).toContainText("Prüfe deine Antworten");
  await expect(page.locator(".treasure")).toHaveCount(0);
  await page.locator('input[name="trek"][value="G"]').check();
  await expect(page.locator(".letter-slots")).toHaveText("GINGERRAN");
  await page.getByLabel("Dein Lösungswort", { exact: true }).fill(" gAr neR iNg ");
  await page.getByRole("button", { name: "Lösung prüfen" }).click();
  await expect(page.getByRole("heading", { name: "Finde den Schatzmeister." })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Finde den Schatzmeister." })).toBeVisible();
  const input = page.getByLabel("Dein Lösungswort", { exact: true });
  await input.fill("gathering");
  await expect(page.locator(".treasure")).toHaveCount(0);
  for (const width of [320, 375, 1280]) {
    await page.setViewportSize({ width, height: 667 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const dock = await page.locator(".letter-dock").boundingBox();
    expect(dock!.y + dock!.height).toBeLessThanOrEqual(668);
  }
});

test("Enigmo handles unknown codes, malformed saves and unavailable storage", async ({ page }) => {
  await page.goto("/enigmo/?code=unknown");
  await expect(page.getByRole("heading", { name: "Keine Spur gefunden." })).toBeVisible();
  await page.getByRole("link", { name: "Anderen Code eingeben" }).click();
  await page.evaluate(() => localStorage.setItem("droch:enigmo:YMIR:v3", "{broken"));
  await page.goto("/enigmo/?code=ymir");
  await expect(page.locator(".letter-slots")).toHaveText("_________");
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error("Disabled");
    };
  });
  await page.locator('input[name="trek"][value="G"]').check();
  await expect(page.locator(".letter-slots")).toHaveText("G________");
  await expect(page.getByRole("status").filter({ hasText: "Dein Browser kann" })).toBeVisible();
});
