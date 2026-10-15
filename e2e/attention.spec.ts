import { expect, test } from "@playwright/test";

async function createRoom(page: import("@playwright/test").Page) {
  await page.goto("/poker/");
  await page.getByLabel("Your name").fill("Focused planner");
  await page.getByRole("button", { name: "Create room", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your estimate", exact: true })).toBeVisible();
}

test("attention mode persists, rotates after one minute, and leaves voting usable", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await createRoom(page);
  await expect(page.locator(".attention-scene")).toHaveCount(0);
  await page.clock.install({ time: new Date("2026-10-15T10:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-15T10:00:01Z"));
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("checkbox", { name: "Attention mode", exact: true }).check();
  await page.getByRole("button", { name: "Close settings", exact: true }).click();
  const scenes = page.locator(".attention-scene:visible");
  await expect(scenes).toHaveCount(2);
  await expect(scenes.first().locator("canvas")).toBeVisible();
  const pair = () =>
    scenes.evaluateAll((elements) =>
      elements.map((el) => el.getAttribute("data-attention-effect")),
    );
  const before = await pair();
  expect(new Set(before).size).toBe(2);
  expect(before).not.toContain("machine");
  await page.clock.runFor(100);
  await page.clock.fastForward(59000);
  expect(await pair()).toEqual(before);
  await page.clock.fastForward(1200);
  await expect.poll(pair).not.toEqual(before);
  const after = await pair();
  expect(after.every((id) => !before.includes(id) && id !== "machine")).toBe(true);
  await page.getByRole("button", { name: "Vote 8", exact: true }).click();
  await expect(page.getByRole("button", { name: "Vote 8", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Reveal votes", exact: true }).click();
  await expect(page.getByText("Votes revealed", { exact: true })).toBeVisible();
  await expect(scenes).toHaveCount(2);
  await page.getByRole("button", { name: "Start next round", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Round 2", exact: true })).toBeVisible();
  await page.reload();
  await expect(scenes).toHaveCount(2);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Attention mode", exact: true })).toBeChecked();
  await page.getByRole("checkbox", { name: "Attention mode", exact: true }).uncheck();
  await page.getByRole("button", { name: "Close settings", exact: true }).click();
  await expect(scenes).toHaveCount(0);
  await page.clock.fastForward(120000);
  await page.reload();
  await expect(scenes).toHaveCount(0);
  await page.goto("/vortoj/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Attention mode", exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("attention mode respects reduced motion, resumes on preference changes, and fits mobile", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("droch:poker:attention-mode", "true"));
  await createRoom(page);
  await expect(page.locator(".attention-scene:visible")).toHaveCount(3);
  const layout = await page.evaluate(() => {
    const bounds = (selector: string) => {
      const rect = document.querySelector(selector)!.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    };
    return [
      bounds(".attention-scene-left"),
      bounds(".attention-participants"),
      bounds(".attention-scene-middle"),
      bounds(".attention-estimate"),
      bounds(".round-controls"),
      bounds(".attention-scene-right"),
    ];
  });
  for (let index = 1; index < layout.length; index++) {
    expect(layout[index]!.top).toBeGreaterThanOrEqual(layout[index - 1]!.bottom);
  }
  const sceneIds = await page
    .locator(".attention-scene")
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-attention-effect")),
    );
  expect(new Set(sceneIds).size).toBe(3);
  const canvas = page.locator(".attention-scene canvas").first();
  await canvas.scrollIntoViewIfNeeded();
  await expect(canvas).toBeVisible();
  await page.clock.install();
  const image = () => canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  const still = await image();
  const first = await page
    .locator(".attention-scene")
    .first()
    .getAttribute("data-attention-effect");
  await page.clock.fastForward(125000);
  expect(await image()).toBe(still);
  await expect(page.locator(".attention-scene").first()).toHaveAttribute(
    "data-attention-effect",
    first!,
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.clock.runFor(200);
  await expect.poll(image).not.toBe(still);
  await page.clock.fastForward(61000);
  await expect(page.locator(".attention-scene").first()).not.toHaveAttribute(
    "data-attention-effect",
    first!,
  );
  await page.getByRole("button", { name: "Vote 5", exact: true }).click();
  await expect(page.getByRole("button", { name: "Vote 5", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
