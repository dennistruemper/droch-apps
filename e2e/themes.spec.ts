import { expect, test } from "@playwright/test";

test("custom colors and fonts preview, persist per app, and leave presets intact", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const settings = page.getByRole("button", { name: "Settings", exact: true });
  const theme = page.getByLabel("Your theme");
  const font = page.getByLabel("Font", { exact: true });
  const bodyFont = () => page.evaluate(() => getComputedStyle(document.body).fontFamily);
  const color = async (label: string, value: string) => {
    await page.getByLabel(label).evaluate((element, hex) => {
      const input = element as HTMLInputElement;
      input.value = hex;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
  };
  const palette = () =>
    page.evaluate(() => {
      const root = document.documentElement;
      return {
        background: root.style.getPropertyValue("--color-bg"),
        foreground: root.style.getPropertyValue("--color-fg"),
        scheme: getComputedStyle(root).colorScheme,
      };
    });
  await page.goto("/poker/");
  await settings.click();
  await theme.selectOption("ink");
  await theme.selectOption("custom");
  await expect(page.getByLabel("Background color")).toHaveValue("#111111");
  await expect(page.getByLabel("Text and border color")).toHaveValue("#f5f5f5");
  await color("Background color", "#102030");
  await color("Text and border color", "#f2e8cf");
  await font.selectOption("serif");
  await expect.poll(bodyFont).toContain("Georgia");
  await expect
    .poll(palette)
    .toEqual({ background: "#102030", foreground: "#f2e8cf", scheme: "dark" });
  await page.getByRole("button", { name: "Close settings" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "custom");
  await expect
    .poll(palette)
    .toEqual({ background: "#102030", foreground: "#f2e8cf", scheme: "dark" });
  await expect.poll(bodyFont).toContain("Georgia");
  await page.goto("/vortoj/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "antique-paper");
  await settings.click();
  await theme.selectOption("custom");
  await expect(font).toHaveValue("sans");
  await font.selectOption("sans");
  await color("Background color", "#faf6f0");
  await color("Text and border color", "#29313a");
  await expect
    .poll(palette)
    .toEqual({ background: "#faf6f0", foreground: "#29313a", scheme: "light" });
  await page.reload();
  await expect
    .poll(palette)
    .toEqual({ background: "#faf6f0", foreground: "#29313a", scheme: "light" });
  await expect.poll(bodyFont).toContain("system-ui");
  await page.goto("/poker/");
  await expect.poll(bodyFont).toContain("Georgia");
  await expect
    .poll(palette)
    .toEqual({ background: "#102030", foreground: "#f2e8cf", scheme: "dark" });
  await settings.click();
  await theme.selectOption("paper");
  await expect.poll(bodyFont).toContain("system-ui");
  expect(
    await page.evaluate(() => document.documentElement.style.getPropertyValue("--font-body")),
  ).toBe("");
  await expect.poll(palette).toEqual({ background: "", foreground: "", scheme: "light" });
  await theme.selectOption("custom");
  await expect(page.getByLabel("Background color")).toHaveValue("#102030");
  await expect(font).toHaveValue("serif");
  await page.getByRole("button", { name: "Use app default" }).click();
  await expect(theme).toHaveValue("paper");
  await expect(page.getByLabel("Background color")).toHaveCount(0);
  await expect.poll(palette).toEqual({ background: "", foreground: "", scheme: "light" });
  expect(errors).toEqual([]);
});

test("older color preferences and invalid fonts have safe defaults", async ({ page }) => {
  await page.goto("/poker/");
  await page.evaluate(() => {
    localStorage.setItem("droch:poker:theme", "custom");
    localStorage.setItem(
      "droch:poker:custom-theme",
      '{"background":"invalid","foreground":"#111111"}',
    );
  });
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Background color")).toHaveValue("#ffffff");
  await expect(page.getByLabel("Text and border color")).toHaveValue("#111111");
  await expect(page.getByLabel("Font", { exact: true })).toHaveValue("sans");
  for (const font of [undefined, "invalid font"]) {
    await page.evaluate((value) => {
      localStorage.setItem(
        "droch:poker:custom-theme",
        JSON.stringify({ background: "#123456", foreground: "#fedcba", font: value }),
      );
    }, font);
    await page.reload();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByLabel("Background color")).toHaveValue("#123456");
    await expect(page.getByLabel("Text and border color")).toHaveValue("#fedcba");
    await expect(page.getByLabel("Font", { exact: true })).toHaveValue("sans");
  }
  await page.getByLabel("Font", { exact: true }).selectOption("mono");
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body).fontFamily))
    .toContain("ui-monospace");
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Font", { exact: true })).toHaveValue("mono");
  await page.getByRole("button", { name: "Use app default" }).click();
  await expect(page.getByLabel("Your theme")).toHaveValue("paper");
});
