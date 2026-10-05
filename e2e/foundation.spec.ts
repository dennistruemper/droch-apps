import { expect, test } from "@playwright/test";

test("both app shells load and keep their themes separate", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/poker/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "A shared estimate starts here.",
  );
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Your theme").selectOption("ink");
  await page.getByRole("button", { name: "Close settings" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "ink");
  await page.goto("/vortoj/");
  await expect(page.getByRole("heading", { name: "Your next word can wait." })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "gamegirl");
  await expect(page.getByLabel("Your theme")).toBeHidden();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await page.getByLabel("Your theme").selectOption("ocean");
  await page.getByRole("button", { name: "Close settings" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "ocean");
  await page.goto("/poker/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "ink");
  await page.goto("/poker/missing-page");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("API errors and missing assets remain 404s", async ({ request }) => {
  for (const path of [
    "/api/poker/missing",
    "/api/auth/missing",
    "/poker/assets/missing.js",
    "/unknown/",
  ]) {
    const response = await request.get(path);
    expect(response.status()).toBe(404);
  }
});
