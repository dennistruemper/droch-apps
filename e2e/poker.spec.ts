import { expect, test } from "@playwright/test";

test("two anonymous players vote privately, reveal, reset, and reconnect", async ({
  browser,
  baseURL,
}) => {
  if (!baseURL) throw new Error("Missing test origin");
  const hostContext = await browser.newContext({ baseURL });
  const guestContext = await browser.newContext({ baseURL });
  const host = await hostContext.newPage(),
    guest = await guestContext.newPage();
  const errors: string[] = [];
  host.on("pageerror", (e) => errors.push(e.message));
  guest.on("pageerror", (e) => errors.push(e.message));
  try {
    await host.goto("/poker/");
    await host.getByLabel("Room name").fill("Browser planning");
    await host.getByLabel("Your name").fill("Alice");
    await host.getByRole("button", { name: "Create room" }).click();
    await expect(host).toHaveURL(/\/poker\/room\/[a-f0-9]{24}$/);
    await expect(host.getByText("Live updates connected")).toBeVisible();
    await guest.goto(host.url());
    await guest.getByLabel("Your name").fill("Bob");
    await guest.getByRole("button", { name: "Join room" }).click();
    await expect(guest.getByText("Live updates connected")).toBeVisible();
    await expect(host.getByRole("row", { name: /Bob/ })).toContainText("Thinking");
    await expect(guest.getByRole("button", { name: "Reveal votes" })).toBeVisible();
    await host.getByRole("button", { name: "Vote 13", exact: true }).click();
    await guest.getByRole("button", { name: "Vote for a break", exact: true }).click();
    await expect(host.getByRole("row", { name: /Bob/ })).toContainText("Ready");
    await expect(guest.getByRole("row", { name: /Alice/ })).toContainText("Ready");
    const path = new URL(host.url()).pathname.replace("/poker/room/", "/api/poker/rooms/");
    const privateSnapshot = await (await guestContext.request.get(path)).json();
    expect(
      privateSnapshot.participants.every((p: { vote: string | null }) => p.vote === null),
    ).toBe(true);
    expect(privateSnapshot.you.vote).toBe("☕");
    await guest.reload();
    await expect(
      guest.getByRole("button", { name: "Vote for a break", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(guest.getByRole("row", { name: /Alice/ })).toContainText("Ready");
    const roomUrl = host.url();
    await host.goto("/words/"); // Creator disconnects; the team can continue.
    await guest.getByRole("button", { name: "Reveal votes" }).click();
    await expect(guest.getByText("Votes revealed", { exact: true })).toBeVisible();
    await expect(guest.getByRole("row", { name: /Alice/ }).getByRole("cell")).toHaveText("13");
    await expect(guest.getByRole("row", { name: /Bob/ }).getByRole("cell")).toHaveText("☕");
    await guest.getByRole("button", { name: "Start next round" }).click();
    await host.goto(roomUrl);
    await expect(guest.getByRole("heading", { name: "Round 2" })).toBeVisible();
    await expect(guest.getByRole("row", { name: /Bob/ })).toContainText("Thinking");
    await guestContext.setOffline(true);
    await host.getByRole("button", { name: "Vote 8", exact: true }).click();
    await guestContext.setOffline(false);
    await expect(guest.getByRole("row", { name: /Alice/ })).toContainText("Ready", {
      timeout: 20000,
    });
    await guest.getByRole("button", { name: "Vote ?", exact: true }).click();
    await expect(host.getByRole("row", { name: /Bob/ })).toContainText("Ready");
    await guest.getByRole("button", { name: "Clear my vote" }).click();
    await expect(host.getByRole("row", { name: /Bob/ })).toContainText("Thinking");
    expect(errors).toEqual([]);
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});

test("room creation errors explain recovery and allow a retry", async ({ page }) => {
  await page.goto("/poker/");
  await page.getByLabel("Room name").fill("Retry planning");
  await page.getByLabel("Your name").fill("Alice");
  await page.route("**/api/poker/rooms", (route) => route.abort("failed"));
  await page.getByRole("button", { name: "Create room" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Cannot reach the poker server. Check your connection and try again.",
  );
  await expect(page.getByRole("button", { name: "Create room" })).toBeEnabled();
  await page.unroute("**/api/poker/rooms");
  await page.getByRole("button", { name: "Create room" }).click();
  await expect(page.getByText("Live updates connected")).toBeVisible();
});

test("settings contain the theme and the room title clears only its initial default", async ({
  page,
}) => {
  await page.goto("/poker/");
  const title = page.getByLabel("Room name");
  await expect(title).toHaveValue("Sprint planning");
  await title.click();
  await expect(title).toHaveValue("");
  await title.fill("My sprint");
  await page.getByLabel("Your name").click();
  await title.click();
  await expect(title).toHaveValue("My sprint");
  await expect(page.getByLabel("Your theme")).toBeHidden();
  const settings = page.getByRole("button", { name: "Settings", exact: true });
  await settings.click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await page.getByLabel("Your theme").selectOption("ink");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(settings).toBeFocused();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "ink");
  await expect(title).toHaveValue("Sprint planning");
  await page.getByLabel("Your name").fill("Default host");
  await page.getByRole("button", { name: "Create room" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sprint planning");
  await settings.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close settings" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
});
