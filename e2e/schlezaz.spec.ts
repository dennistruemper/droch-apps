import { expect, test } from "@playwright/test";

test("SchleZaZ selection, repeated draws, editing focus and mobile layout", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "SchleZaZ", exact: true }).click();
  await expect(page).toHaveURL(/\/schlezaz\/$/);
  await page.clock.install();
  const generate = page.getByRole("button", { name: "JETZT GENERIEREN!" });
  await expect(generate).toBeDisabled();
  await page.getByRole("textbox", { name: "Option 1" }).fill("Pizza");
  await page.getByRole("textbox", { name: "Option 2" }).pressSequentially("Pasta");
  await expect(page.getByRole("textbox", { name: "Option 2" })).toBeFocused();
  await generate.click();
  await expect(page.getByRole("heading", { name: "WIRD ZUFÄLLIG …" })).toBeVisible();
  await expect(page.getByRole("textbox").first()).toBeDisabled();
  await page.clock.fastForward(10_001);
  const first = await page.locator(".result-value").innerText();
  await generate.click();
  await page.clock.fastForward(10_001);
  await expect(page.locator(".result-value")).toHaveText(first);
  await page.getByRole("button", { name: /XKCD-Modus/ }).click();
  await page.getByRole("button", { name: "Weitere Option hinzufügen" }).click();
  await page.getByRole("textbox", { name: "Option 3" }).fill("Suppe");
  await generate.click();
  await page.clock.fastForward(10_001);
  await expect(page.locator(".result-value")).toHaveText("Pizza");
  await page.getByRole("button", { name: "Ergebnis ausblenden" }).click();
  await expect(page.locator(".result-value")).toHaveCount(0);
  await page.getByRole("button", { name: "Option 2 entfernen" }).click();
  await expect(page.getByRole("textbox", { name: "Option 2" })).toHaveValue("Suppe");
  await page.setViewportSize({ width: 375, height: 667 });
  await expect(page.getByRole("heading", { name: "Deine Optionen." })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await generate.click();
  await expect(page.locator(".loading-reel")).toHaveCSS("animation-name", "none");
  await page.clock.fastForward(10_001);
  await expect(page.locator(".result-value")).toHaveText("Suppe");
});
