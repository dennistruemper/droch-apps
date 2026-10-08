import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { newGame, decideGame, projectGame } from "../apps/vortoj/src/domain/index.ts";
import type { GameCommand } from "../apps/vortoj/src/contracts/index.ts";

function fixture() {
  const author = { id: randomUUID(), name: "Author" },
    reviewer = { id: randomUUID(), name: "Reviewer" };
  const set = { name: "Only A", tiles: [{ letter: "A", count: 28, points: 1 }] };
  const room = { id: randomUUID(), title: "Review room", ownerId: author.id, tileSet: set };
  const effects = { now: 1, draw: () => 0, id: randomUUID };
  const waiting = newGame(author);
  waiting.players.push({ ...reviewer, score: 0, rack: [] });
  const playing = decideGame(
    waiting,
    author.id,
    author.id,
    { kind: "start", version: waiting.version, commandId: randomUUID() },
    set,
    effects,
  );
  return { author, reviewer, set, room, effects, playing };
}

test("deleting another tile set preserves the current edit target and draft", async ({ page }) => {
  const a = randomUUID(),
    b = randomUUID();
  let sets = [
    { id: a, name: "Set A", tiles: [{ letter: "A", count: 28, points: 1 }] },
    { id: b, name: "Set B", tiles: [{ letter: "B", count: 28, points: 1 }] },
  ];
  let savedPath = "";
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/session")
      return route.fulfill({ json: { user: { id: randomUUID(), name: "Editor" } } });
    if (path === "/api/vortoj/rooms") return route.fulfill({ json: [] });
    if (route.request().method() === "DELETE") {
      sets = sets.filter((set) => set.id !== b);
      return route.fulfill({ json: { ok: true } });
    }
    if (route.request().method() === "POST") {
      savedPath = path;
      return route.fulfill({ json: { id: a, ...route.request().postDataJSON() } });
    }
    return route.fulfill({ json: sets });
  });
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/vortoj/");
  await page.getByRole("button", { name: "Open tile editor", exact: true }).click();
  await page.getByRole("button", { name: "Edit Set A", exact: true }).click();
  await page.getByLabel("Quantity 1", { exact: true }).fill("30");
  await page.getByRole("button", { name: "Remove Set B", exact: true }).click();
  await expect(page.getByText("Tile set removed.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Quantity 1", { exact: true })).toHaveValue("30");
  await page.getByRole("button", { name: "Save tile set", exact: true }).click();
  await expect(
    page.getByText("Tile set saved for your future games.", { exact: true }),
  ).toBeVisible();
  expect(savedPath).toBe(`/api/vortoj/tile-sets/${a}`);
});

test("board has one tab stop and supports keyboard navigation and placement", async ({ page }) => {
  const f = fixture(),
    snapshot = projectGame(f.playing, f.author.id, f.room);
  await page.addInitScript(() => {
    window.EventSource = class extends EventTarget {
      close() {}
    } as unknown as typeof EventSource;
  });
  await page.route("**/api/**", (route) =>
    route.fulfill({
      json:
        new URL(route.request().url()).pathname === "/api/auth/session"
          ? { user: f.author }
          : snapshot,
    }),
  );
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto(`/vortoj/room/${f.room.id}`);
  const squares = page.locator(".game-board button"),
    centre = squares.nth(112);
  await expect(page.getByRole("heading", { name: "Your tiles" })).toBeVisible();
  await expect
    .poll(() =>
      squares.evaluateAll(
        (elements) =>
          elements.filter((element) => (element as HTMLButtonElement).tabIndex === 0).length,
      ),
    )
    .toBe(1);
  await page.getByRole("button", { name: "Tile A, 1 points", exact: true }).first().click();
  await centre.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('.game-board [data-proposed="true"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Tile A, 1 points", exact: true }).nth(1).click();
  await centre.focus();
  await page.keyboard.press("ArrowRight");
  await expect(squares.nth(113)).toBeFocused();
  await page.keyboard.press("Space");
  await expect(page.locator('.game-board [data-proposed="true"]')).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Submit words for approval" })).toBeEnabled();
  await page.keyboard.press("Home");
  await expect(squares.nth(105)).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(squares.nth(105)).toBeFocused();
  await page.keyboard.press("End");
  await expect(squares.nth(119)).toBeFocused();
  await page.keyboard.press("Control+Home");
  await expect(squares.first()).toBeFocused();
  await page.keyboard.press("Control+End");
  await expect(squares.last()).toBeFocused();
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.closest(".game-board") === null)).toBe(
    true,
  );
  await page.setViewportSize({ width: 375, height: 667 });
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await centre.focus();
  await page.keyboard.press("Control+End");
  await expect(squares.last()).toBeFocused();
  const box = await squares.last().boundingBox(),
    viewport = await page.locator(".board-scroll").boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.x + viewport!.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.y + viewport!.height + 1);
});

test("word approval reports a failed vote inside the modal and allows retry", async ({ page }) => {
  const f = fixture();
  let game = decideGame(
    f.playing,
    f.author.id,
    f.author.id,
    {
      kind: "place",
      version: f.playing.version,
      commandId: randomUUID(),
      placements: f.playing.players[0]!.rack.slice(0, 2).map((tile, index) => ({
        tileId: tile.id,
        row: 7,
        col: 7 + index,
      })),
    },
    f.set,
    f.effects,
  );
  let attempts = 0;
  await page.addInitScript(() => {
    window.EventSource = class extends EventTarget {
      close() {}
    } as unknown as typeof EventSource;
  });
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/session") return route.fulfill({ json: { user: f.reviewer } });
    if (path.endsWith("/command")) {
      if (++attempts === 1) return route.abort("failed");
      game = decideGame(
        game,
        f.author.id,
        f.reviewer.id,
        route.request().postDataJSON() as GameCommand,
        f.set,
        f.effects,
      );
    }
    return route.fulfill({ json: projectGame(game, f.reviewer.id, f.room) });
  });
  await page.goto(`/vortoj/room/${f.room.id}`);
  const approval = page
    .locator("dialog")
    .filter({ has: page.getByRole("heading", { name: "Approve the words" }) });
  await approval.getByRole("button", { name: "Accept AA", exact: true }).click();
  await expect(approval.getByRole("alert")).toContainText("Check your connection and try again");
  await expect(approval).toBeVisible();
  await approval.getByRole("button", { name: "Accept AA", exact: true }).click();
  await expect(approval).not.toBeVisible();
  await expect(page.getByText("Your turn", { exact: true })).toBeVisible();
  expect(attempts).toBe(2);
});

test("finished-game checkbox filters one activity-ordered list and shows retention information", async ({
  page,
}) => {
  const user = { id: randomUUID(), name: "Review" };
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/session") return route.fulfill({ json: { user } });
    if (path === "/api/vortoj/rooms")
      return route.fulfill({
        json: [
          {
            id: randomUUID(),
            title: "Most recent finished game",
            phase: "finished",
            turnId: user.id,
            version: 5,
            updatedAt: 3,
          },
          {
            id: randomUUID(),
            title: "Active game",
            phase: "playing",
            turnId: user.id,
            version: 1,
            updatedAt: 2,
          },
          {
            id: randomUUID(),
            title: "Finished game",
            phase: "finished",
            turnId: user.id,
            version: 5,
            updatedAt: 1,
          },
        ],
      });
    return route.fulfill({ json: [] });
  });
  await page.goto("/vortoj/");
  await expect(page.getByRole("link", { name: "Active game", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Finished game", exact: true })).toBeHidden();
  await expect(page.getByText(/You can keep up to 100 rooms/)).toBeHidden();
  await page.getByRole("checkbox", { name: "Show finished games", exact: true }).check();
  await expect(page.getByRole("link", { name: "Finished game", exact: true })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Your rooms", exact: true }).getByRole("link"),
  ).toHaveText(["Most recent finished game", "Active game", "Finished game"]);
  await expect(page.getByText(/You can keep up to 100 rooms/)).toContainText(
    "gone longest without updates",
  );
  await page.getByRole("checkbox", { name: "Show finished games", exact: true }).uncheck();
  await expect(page.getByRole("link", { name: "Finished game", exact: true })).toBeHidden();
});

test("pending tile saves lock the editor and preserve the selected set", async ({ page }) => {
  const a = randomUUID(),
    b = randomUUID();
  const sets = [
    { id: a, name: "Set A", tiles: [{ letter: "A", count: 28, points: 1 }] },
    { id: b, name: "Set B", tiles: [{ letter: "B", count: 28, points: 1 }] },
  ];
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const saves: { path: string; letter: string }[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/session")
      return route.fulfill({ json: { user: { id: randomUUID(), name: "Editor" } } });
    if (path === "/api/vortoj/rooms") return route.fulfill({ json: [] });
    if (route.request().method() === "POST") {
      const data = route.request().postDataJSON();
      saves.push({ path, letter: data.tiles[0].letter });
      if (saves.length === 1) await gate;
      return route.fulfill({ json: { id: path.endsWith(a) ? a : b, ...data } });
    }
    return route.fulfill({ json: sets });
  });
  try {
    await page.goto("/vortoj/");
    await page.getByRole("button", { name: "Open tile editor", exact: true }).click();
    await page.getByRole("button", { name: "Edit Set A", exact: true }).click();
    await page.getByRole("button", { name: "Save tile set", exact: true }).click();
    await expect(page.getByRole("button", { name: "Saving…", exact: true })).toBeVisible();
    for (const name of [
      "Edit Set B",
      "New empty set",
      "Remove Set A",
      "Add letter",
      "Remove tile 1",
    ])
      await expect(page.getByRole("button", { name, exact: true })).toBeDisabled();
    await expect(page.getByLabel("Tile set name")).toBeDisabled();
    await expect(page.getByLabel("Letter 1", { exact: true })).toBeDisabled();
    release();
    await expect(
      page.getByText("Tile set saved for your future games.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Tile set name")).toHaveValue("Set A");
    await expect(page.getByLabel("Letter 1", { exact: true })).toHaveValue("A");
    await page.getByRole("button", { name: "Edit Set B", exact: true }).click();
    await page.getByRole("button", { name: "Save tile set", exact: true }).click();
    await expect.poll(() => saves.length).toBe(2);
    expect(saves).toEqual([
      { path: `/api/vortoj/tile-sets/${a}`, letter: "A" },
      { path: `/api/vortoj/tile-sets/${b}`, letter: "B" },
    ]);
  } finally {
    release();
  }
});

for (const transport of ["stream", "http"] as const) {
  test(`removed rooms offer a return to Your rooms without logging out (${transport})`, async ({
    page,
  }) => {
    const f = fixture(),
      snapshot = projectGame(f.playing, f.author.id, f.room);
    let gone = false;
    await page.addInitScript(() => {
      window.EventSource = class extends EventTarget {
        constructor() {
          super();
          (window as unknown as { reviewEvents: EventTarget }).reviewEvents = this;
        }
        close() {}
      } as unknown as typeof EventSource;
    });
    await page.route("**/api/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/auth/session") return route.fulfill({ json: { user: f.author } });
      if (path === "/api/vortoj/rooms" || path === "/api/vortoj/tile-sets")
        return route.fulfill({ json: [] });
      return gone
        ? route.fulfill({ status: 404, json: { error: "Room not found" } })
        : route.fulfill({ json: snapshot });
    });
    await page.goto(`/vortoj/room/${f.room.id}`);
    await expect(page.getByRole("heading", { name: "Your tiles" })).toBeVisible();
    gone = true;
    if (transport === "stream")
      await page.evaluate(() =>
        (window as unknown as { reviewEvents: EventTarget }).reviewEvents.dispatchEvent(
          new Event("removed"),
        ),
      );
    else await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(page.getByRole("alert")).toContainText("room is no longer available");
    await expect(page.getByRole("heading", { name: "Your tiles" })).toHaveCount(0);
    await expect(page.getByText(`Playing as ${f.author.name}`, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Refresh / sign in again", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("link", { name: "Back to your rooms", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your rooms", exact: true })).toBeVisible();
  });
}
