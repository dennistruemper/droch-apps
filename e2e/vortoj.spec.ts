import { expect, test, devices, type Page } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { snapshotSchema } from "../apps/vortoj/src/contracts/index.ts";
function stackMode(origin: string) {
  for (const mode of ["test", "dev"]) {
    const file = resolve(`.local/${mode}/.env`);
    if (existsSync(file)) {
      const environment = readFileSync(file, "utf8");
      if (
        environment.includes(`APP_ORIGIN=${origin}\n`) &&
        environment.includes("AUTH_MODE=local\n")
      )
        return mode;
    }
  }
  return null;
}
async function signIn(page: Page, url: string, name: string) {
  const email = `${name.toLowerCase()}-${randomUUID()}@example.test`;
  await page.goto(url);
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send sign-in code", exact: true }).click();
  await expect(page.getByLabel("Sign-in code")).toBeVisible();
  await page.getByLabel("Sign-in code").fill("9999");
  await page.getByLabel("Your name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText(`Playing as ${name}`, { exact: true })).toBeVisible();
}
test("accounts, saved sets, invitations, private racks, word voting and recovery", async ({
  browser,
  baseURL,
}) => {
  const mode = stackMode(baseURL ?? "");
  test.skip(!mode, "Account checks require the isolated local test auth mode");
  const a = await browser.newContext(),
    b = await browser.newContext(),
    owner = await a.newPage(),
    guest = await b.newPage();
  try {
    await signIn(owner, `${baseURL}/vortoj/`, "Alice");
    await owner.getByRole("button", { name: "Open tile editor" }).click();
    await owner.getByRole("button", { name: "New empty set" }).click();
    await owner.getByLabel("Tile set name").fill("Only A");
    await owner.getByRole("button", { name: "Add letter" }).click();
    await owner.getByLabel("Letter 1", { exact: true }).fill("a");
    await owner.getByLabel("Quantity 1", { exact: true }).fill("28");
    await owner.getByLabel("Points 1", { exact: true }).fill("1");
    await owner.getByRole("button", { name: "Save tile set" }).click();
    await expect(owner.getByText("Tile set saved for your future games.")).toBeVisible();
    await owner.getByLabel("Room name").fill("Afternoon words");
    await owner
      .getByLabel("Tile set", { exact: true })
      .selectOption({ label: "Only A (28 tiles)" });
    await owner.getByRole("button", { name: "Create room", exact: true }).click();
    await expect(owner.getByLabel("Room invitation")).toBeVisible();
    const invitation = await owner.getByLabel("Room invitation").inputValue();
    const id = invitation.split("/").at(-1)!;
    await signIn(guest, invitation, "Bob");
    await guest.getByRole("button", { name: "Join room", exact: true }).click();
    await expect(owner.getByRole("button", { name: "Start game" })).toBeEnabled();
    await owner.getByRole("button", { name: "Start game" }).click();
    await expect(owner.getByRole("heading", { name: "Your tiles" })).toBeVisible();
    await expect(guest.getByRole("heading", { name: "Your tiles" })).toBeVisible();
    const ownerWire = (await (
        await owner.request.get(`${baseURL}/api/vortoj/rooms/${id}`)
      ).json()) as unknown,
      guestWire = (await (
        await guest.request.get(`${baseURL}/api/vortoj/rooms/${id}`)
      ).json()) as unknown;
    const ownerSnapshot = snapshotSchema.parse(ownerWire),
      guestSnapshot = snapshotSchema.parse(guestWire);
    expect(ownerSnapshot.you.rack).toHaveLength(7);
    expect(guestSnapshot.you.rack).toHaveLength(7);
    expect(JSON.stringify(ownerWire)).not.toContain('"state"');
    expect(JSON.stringify(ownerWire)).not.toContain('"bag":');
    for (const tile of guestSnapshot.you.rack)
      expect(JSON.stringify(ownerWire)).not.toContain(tile.id);
    for (const tile of ownerSnapshot.you.rack)
      expect(JSON.stringify(guestWire)).not.toContain(tile.id);
    await owner.getByRole("button", { name: "Tile A, 1 points", exact: true }).nth(0).click();
    await owner
      .getByRole("button", {
        name: "Row 8, column 8, empty, 2× word bonus, starting square",
        exact: true,
      })
      .click();
    await owner.getByRole("button", { name: "Tile A, 1 points", exact: true }).nth(1).click();
    await owner.getByRole("button", { name: "Row 8, column 9, empty", exact: true }).click();
    await owner.getByRole("button", { name: "Submit words for approval" }).click();
    await guest.getByRole("button", { name: "Accept AA", exact: true }).click();
    await expect(guest.getByText("Your turn", { exact: true })).toBeVisible();
    await owner.reload();
    await expect(
      owner.getByRole("button", {
        name: "Row 8, column 8, A, 2× word bonus, starting square",
        exact: true,
      }),
    ).toBeVisible();
    await expect(owner.getByRole("button", { name: "Tile A, 1 points", exact: true })).toHaveCount(
      7,
    );
    const before = snapshotSchema.parse(
      await (await guest.request.get(`${baseURL}/api/vortoj/rooms/${id}`)).json(),
    );
    await guest.getByRole("button", { name: "Tile A, 1 points", exact: true }).nth(0).click();
    await guest.getByRole("button", { name: "Row 8, column 10, empty", exact: true }).click();
    await guest.getByRole("button", { name: "Tile A, 1 points", exact: true }).nth(1).click();
    await guest.getByRole("button", { name: "Row 8, column 11, empty", exact: true }).click();
    await guest.getByRole("button", { name: "Submit words for approval" }).click();
    await owner.getByRole("button", { name: "Reject AAAA", exact: true }).click();
    await expect(owner.getByText("Your turn", { exact: true })).toBeVisible();
    const after = snapshotSchema.parse(
      await (await guest.request.get(`${baseURL}/api/vortoj/rooms/${id}`)).json(),
    );
    expect(after.you.rack).toEqual(before.you.rack);
    expect(after.board).toHaveLength(2);
    await owner.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(owner.getByRole("heading", { name: "Sign in to play" })).toBeVisible();
    expect((await owner.request.get(`${baseURL}/api/vortoj/rooms/${id}`)).status()).toBe(401);
    await expect(owner.getByRole("heading", { name: "Your tiles" })).toHaveCount(0);
  } finally {
    await a.close();
    await b.close();
  }
});

test("small-phone board camera, joker placement, approvals and desktop resizing", async ({
  browser,
  baseURL,
}, testInfo) => {
  test.skip(!stackMode(baseURL ?? ""), "Account checks require the isolated local test auth mode");
  const { defaultBrowserType: _browserType, ...phone } = devices["iPhone 8"]!;
  const a = await browser.newContext(phone),
    b = await browser.newContext(phone);
  const owner = await a.newPage(),
    guest = await b.newPage();
  const errors: string[] = [];
  for (const page of [owner, guest]) page.on("pageerror", (error) => errors.push(error.message));
  const snapshot = async (page: Page, id: string) =>
    snapshotSchema.parse(
      await (await page.request.get(`${baseURL}/api/vortoj/rooms/${id}`)).json(),
    );
  const post = async (page: Page, path: string, data: unknown) => {
    const response = await page.request.post(`${baseURL}/api/vortoj${path}`, {
      data,
      headers: { Origin: baseURL! },
    });
    await expect(response).toBeOK();
    return response.json();
  };
  const square = (page: Page, row: number, col: number) =>
    page.getByRole("button", { name: new RegExp(`^Row ${row}, column ${col},`) });
  const placeJoker = async (page: Page, index: number, row: number, col: number) => {
    await page.getByRole("button", { name: "Tile *, 0 points", exact: true }).nth(index).tap();
    await page.getByLabel("Joker letter", { exact: true }).fill("A");
    await page.getByRole("button", { name: "Use this letter", exact: true }).tap();
    await square(page, row, col).tap();
  };
  const fitsViewport = async (page: Page) => {
    // ResizeObserver applies camera changes on the next frame; check settled geometry.
    await expect
      .poll(async () => {
        const dock = await page
          .getByRole("region", { name: "Your rack", exact: true })
          .boundingBox();
        const camera = await page.locator(".board-scroll").boundingBox();
        const board = await page.getByRole("group", { name: "15 by 15 word board" }).boundingBox();
        const size = page.viewportSize()!;
        const overview = await page
          .getByRole("button", { name: "Zoom in", exact: true })
          .isVisible();
        return {
          rackVisible: !!dock && dock.y >= 0 && dock.y + dock.height <= size.height + 1,
          pageFits: (await page.evaluate(() => document.documentElement.scrollWidth)) <= size.width,
          boardUsable: !!camera && camera.height > 100,
          overviewFits:
            !overview ||
            (!!board && !!camera && board.width <= camera.width && board.height <= camera.height),
        };
      })
      .toEqual({ rackVisible: true, pageFits: true, boardUsable: true, overviewFits: true });
  };
  try {
    await signIn(owner, `${baseURL}/vortoj/`, "MobileAlice");
    // At least six jokers in each rack, independent of the random deal.
    const set = await post(owner, "/tile-sets", {
      name: "Quick camera test",
      tiles: [
        { letter: "A", count: 1, points: 1 },
        { letter: "*", count: 27, points: 0 },
      ],
    });
    const room = snapshotSchema.parse(
      await post(owner, "/rooms", { title: "Phone word night", tileSetId: set.id }),
    );
    const url = `${baseURL}/vortoj/room/${room.id}`;
    await owner.goto(url);
    await signIn(guest, url, "MobileBob");
    await guest.getByRole("button", { name: "Join room", exact: true }).tap();
    await owner.getByRole("button", { name: "Start game", exact: true }).tap();
    await expect(owner.getByRole("heading", { name: "Your tiles" })).toBeVisible();
    await expect(owner.getByRole("button", { name: "Zoom in", exact: true })).toBeVisible();
    await fitsViewport(owner);
    await owner.screenshot({ path: testInfo.outputPath("phone-overview.png") });
    // First overview tap changes the camera only, even with a tile selected.
    await owner.getByRole("button", { name: "Tile *, 0 points", exact: true }).first().tap();
    await owner.getByLabel("Joker letter", { exact: true }).fill("Z");
    await owner.getByRole("button", { name: "Use this letter", exact: true }).tap();
    await expect(owner.getByRole("alert")).toContainText("letter from this tile set");
    await owner.getByLabel("Joker letter", { exact: true }).fill("A");
    await owner.getByRole("button", { name: "Use this letter", exact: true }).tap();
    await square(owner, 7, 7).tap();
    await expect(owner.getByRole("button", { name: "Whole board", exact: true })).toBeVisible();
    await expect(owner.locator('.game-board [data-proposed="true"]')).toHaveCount(0);
    await square(owner, 7, 7).tap();
    await expect(
      owner.getByText("The first word must cover the centre star", { exact: true }),
    ).toBeVisible();
    await expect(owner.getByRole("button", { name: "Submit words for approval" })).toBeDisabled();
    await owner.getByRole("button", { name: "Clear placement" }).tap();
    await placeJoker(owner, 0, 8, 8);
    await placeJoker(owner, 1, 8, 9);
    await expect(owner.locator('.game-board [data-proposed="true"]')).toHaveCount(2);
    await expect(owner.getByRole("button", { name: "Whole board", exact: true })).toBeVisible();
    await fitsViewport(owner);
    await owner.screenshot({ path: testInfo.outputPath("phone-placing.png") });
    // Panning never moves the rack or clears the draft.
    await owner.locator(".board-scroll").evaluate((element) => {
      element.scrollLeft = 240;
      element.scrollTop = 240;
    });
    await fitsViewport(owner);
    await expect(owner.locator('.game-board [data-proposed="true"]')).toHaveCount(2);
    await owner.setViewportSize({ width: 1200, height: 900 });
    await expect(owner.getByRole("button", { name: "Zoom in", exact: true })).toHaveCount(0);
    await expect(owner.getByRole("button", { name: "Whole board", exact: true })).toHaveCount(0);
    await expect(owner.locator('.game-board [data-proposed="true"]')).toHaveCount(2);
    await owner.screenshot({ path: testInfo.outputPath("desktop-board.png") });
    // The larger board supports a single tap to place, and undo by tapping the draft.
    await placeJoker(owner, 2, 8, 10);
    await expect(owner.locator('.game-board [data-proposed="true"]')).toHaveCount(3);
    await square(owner, 8, 10).tap();
    await expect(owner.locator('.game-board [data-proposed="true"]')).toHaveCount(2);
    await owner.setViewportSize({ width: 375, height: 667 });
    await fitsViewport(owner);
    await expect(owner.locator('.game-board [data-proposed="true"]')).toHaveCount(2);
    await owner.getByRole("button", { name: "Submit words for approval" }).tap();
    await expect(guest.getByRole("region", { name: "Word approval", exact: true })).toBeVisible();
    await guest.getByRole("button", { name: "Close word approval" }).tap();
    await guest.getByRole("button", { name: "Centre board" }).tap();
    await expect(guest.getByRole("button", { name: "Whole board", exact: true })).toBeVisible();
    await guest.getByRole("button", { name: "Review words", exact: true }).tap();
    await guest.getByRole("button", { name: "Accept AA", exact: true }).tap();
    // Both players return to an overview after acceptance, but their racks remain private.
    for (const page of [owner, guest]) {
      await expect(page.getByRole("button", { name: "Zoom in", exact: true })).toBeVisible();
      await expect(page.locator('.game-board [data-filled="true"]')).toHaveCount(2);
      expect(
        await page
          .locator('.game-board [data-filled="true"]')
          .first()
          .evaluate((element) => getComputedStyle(element).opacity),
      ).toBe("1");
      await fitsViewport(page);
    }
    const own = await snapshot(owner, room.id),
      other = await snapshot(guest, room.id);
    for (const tile of other.you.rack) expect(JSON.stringify(own)).not.toContain(tile.id);
    await guest.getByRole("button", { name: "More game actions" }).tap();
    await guest.getByRole("button", { name: "Exchange tiles", exact: true }).tap();
    await guest
      .getByRole("region", { name: "Your rack", exact: true })
      .getByRole("button", { name: /^Tile / })
      .first()
      .tap();
    await expect(guest.getByRole("button", { name: "Exchange selected tiles" })).toBeEnabled();
    await guest.getByRole("button", { name: "Exchange selected tiles" }).tap();
    await expect(owner.getByText("Your turn", { exact: true })).toBeVisible();
    await owner.getByRole("button", { name: "More game actions" }).tap();
    await owner.getByRole("button", { name: "Pass", exact: true }).tap();
    await expect(guest.getByText("Your turn", { exact: true })).toBeVisible();
    for (const size of [
      { width: 320, height: 568 },
      { width: 667, height: 375 },
    ]) {
      await guest.setViewportSize(size);
      await fitsViewport(guest);
    }
    await guest.getByRole("button", { name: "Players, scores and game details" }).tap();
    await expect(guest.getByRole("heading", { name: "Players and scores" })).toBeVisible();
    await guest.getByText("Game history", { exact: true }).tap();
    await expect(guest.locator("dialog[open] ol")).toContainText("AA");
    await guest.getByRole("button", { name: "Close game details" }).tap();
    await guest.getByRole("button", { name: "More game actions" }).tap();
    await guest.getByRole("button", { name: "Pass", exact: true }).tap();
    // The zero-point joker word, exchange and two passes make four scoreless turns.
    await expect(guest.getByRole("heading", { name: "Final scores", exact: true })).toBeVisible();
    await fitsViewport(guest);
    expect(errors).toEqual([]);
  } finally {
    await a.close();
    await b.close();
  }
});

test("game side panel adapts, restores focus, persists desktop choice and signs out", async ({
  browser,
  baseURL,
}) => {
  test.skip(!stackMode(baseURL ?? ""), "Account checks require the isolated local test auth mode");
  const a = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const b = await browser.newContext();
  const owner = await a.newPage(),
    guest = await b.newPage();
  const errors: string[] = [];
  owner.on("pageerror", (error) => errors.push(error.message));
  try {
    await signIn(owner, `${baseURL}/vortoj/`, "PanelAlice");
    const response = await owner.request.post(`${baseURL}/api/vortoj/rooms`, {
      data: { title: "Panel word night", tileSetId: "english" },
      headers: { Origin: baseURL! },
    });
    await expect(response).toBeOK();
    const room = snapshotSchema.parse(await response.json());
    const url = `${baseURL}/vortoj/room/${room.id}`;
    await owner.goto(url);
    await signIn(guest, url, "PanelBob");
    await guest.getByRole("button", { name: "Join room", exact: true }).click();
    await owner.getByRole("button", { name: "Start game", exact: true }).click();
    const menu = owner.getByRole("dialog", { name: "Vortoj menu", exact: true });
    const open = () => owner.getByRole("button", { name: "Open vortoj menu", exact: true });
    const close = () => owner.getByRole("button", { name: "Close vortoj menu", exact: true });
    await expect(menu).toBeVisible();
    await expect(owner.locator(".game-player")).toHaveText("Playing as PanelAlice");
    await expect(menu).not.toContainText("Panel word night");
    await expect(menu).not.toContainText("Playing as");
    await owner.getByRole("button", { name: "Players, scores and game details" }).focus();
    await expect(
      owner.getByRole("button", { name: "Players, scores and game details" }),
    ).toBeFocused();
    await close().click();
    await expect(menu).not.toBeVisible();
    await owner.reload();
    await expect(open()).toBeVisible();
    await expect(menu).not.toBeVisible();
    await open().click();
    await expect(menu).toBeVisible();
    await menu.getByRole("button", { name: "Rules", exact: true }).focus();
    await owner.keyboard.press("Escape");
    await expect(menu).not.toBeVisible();
    await expect(open()).toBeFocused();
    await open().click();
    await expect(menu).toBeVisible();
    await owner.setViewportSize({ width: 375, height: 667 });
    await expect(menu).not.toBeVisible();
    await expect(
      owner.getByRole("heading", { name: "Panel word night", exact: true }),
    ).toBeVisible();
    await expect(owner.locator(".game-player")).toBeVisible();
    await open().focus();
    await owner.keyboard.press("Enter");
    await expect(menu).toBeVisible();
    for (let index = 0; index < 12; index++) {
      await owner.keyboard.press("Tab");
      // Native dialogs allow the browser chrome in the tab cycle, but keep game controls inert.
      expect(
        await menu.evaluate(
          (element) =>
            element.contains(document.activeElement) || document.activeElement === document.body,
        ),
      ).toBe(true);
      expect(await menu.evaluate((element) => element.matches(":modal"))).toBe(true);
    }
    await menu.getByRole("button", { name: "Close menu panel", exact: true }).focus();
    await owner.keyboard.press("Escape");
    await expect(menu).not.toBeVisible();
    await expect(open()).toBeFocused();
    await open().click();
    await owner.mouse.click(370, 300);
    await expect(menu).not.toBeVisible();
    await expect(open()).toBeFocused();
    await open().click();
    await menu.getByRole("button", { name: "Rules", exact: true }).click();
    await expect(menu).not.toBeVisible();
    await expect(owner.getByRole("dialog", { name: "Game rules", exact: true })).toBeVisible();
    await owner.getByRole("button", { name: "Close game rules", exact: true }).click();
    await expect(open()).toBeFocused();
    await open().click();
    await menu.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(owner.getByLabel("Your theme")).toHaveValue("antique-paper");
    await expect(owner.locator("#vortoj-theme")).toHaveCount(1);
    await owner.getByRole("button", { name: "Close settings", exact: true }).click();
    await expect(open()).toBeFocused();
    await expect
      .poll(() => owner.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(375);
    await owner.setViewportSize({ width: 1440, height: 900 });
    await expect(menu).toBeVisible();
    await owner.setViewportSize({ width: 375, height: 667 });
    await expect(menu).not.toBeVisible();
    await open().click();
    await menu.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(owner.getByLabel("Email address")).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await a.close();
    await b.close();
  }
});
