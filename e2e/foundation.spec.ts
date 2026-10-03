import { expect, test } from "@playwright/test";

test("both app shells connect and keep their themes separate", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/poker/");
  await expect(page.getByText("Backend connected")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "A shared estimate starts here.",
  );
  await page.getByLabel("Your theme").selectOption("ink");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "ink");
  await page.goto("/words/");
  await expect(page.getByText("Backend connected")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "gamegirl");
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
