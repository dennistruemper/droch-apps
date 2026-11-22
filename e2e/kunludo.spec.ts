declare global {
  interface Window {
    releaseSlow?: () => void;
    slowFinished?: boolean;
  }
}

import { test, expect } from "./fixtures.ts";
import type { Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

test.use({
  video: { mode: "on", size: { width: 1280, height: 900 } },
  viewport: { width: 1280, height: 900 },
  launchOptions: { slowMo: 65 },
});

async function login(page: Page, name: string, url = "/kunludo/") {
  await page.goto(url);
  await page.getByLabel("E-Mail", { exact: true }).fill(`${randomUUID()}@example.test`);
  await page.getByRole("button", { name: "Anmeldecode senden", exact: true }).click();
  await page.getByLabel("Anmeldecode", { exact: true }).fill("9999");
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page.getByLabel("Anzeigename", { exact: true })).toBeVisible();
  await page.getByLabel("Anzeigename", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Konto erstellen", exact: true }).click();
  await expect(page.getByRole("group", { name: "Ansicht", exact: true })).toBeVisible();
}

async function create(page: Page, name: string, club: string) {
  await teams(page);
  await page.getByRole("button", { name: "Team erstellen", exact: true }).click();
  const form = page.getByRole("region", { name: "Team erstellen", exact: true });
  await form.getByLabel("Teamname", { exact: true }).fill(name);
  await form.getByLabel("Verein / Kategorie (optional)", { exact: true }).fill(club);
  await expect(form.locator("input")).toHaveCount(3);
  await expect(form.getByRole("combobox", { name: "Zeitzone", exact: true })).toHaveValue(
    "Europe/Berlin",
  );
  await form.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(form).toBeHidden();
}

async function teams(page: Page) {
  await page
    .getByRole("group", { name: "Ansicht", exact: true })
    .getByRole("button", { name: "Teams", exact: true })
    .click();
}

async function games(page: Page) {
  await page
    .getByRole("group", { name: "Ansicht", exact: true })
    .getByRole("button", { name: "Spiele", exact: true })
    .click();
}

function teamCard(page: Page, name: string) {
  return page
    .getByTestId("team-card")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
}

async function code(page: Page, name: string) {
  await teams(page);
  await teamCard(page, name).getByRole("button", { name: "Beitrittscode", exact: true }).click();
  const box = page.getByRole("region", { name: "Beitrittscode", exact: true });
  await expect(box).toBeVisible();

  return {
    teamId: (await box.locator("code").nth(0).innerText()).trim(),
    pin: (await box.locator("code").nth(1).innerText()).trim(),
  };
}

async function join(page: Page, c: { teamId: string; pin: string }) {
  await teams(page);
  await page.getByRole("button", { name: "Team beitreten", exact: true }).click();
  const form = page.getByRole("region", { name: "Team beitreten", exact: true });
  await form.getByLabel("Team-ID", { exact: true }).fill(c.teamId);
  await form.getByLabel("Team-PIN", { exact: true }).fill(c.pin.toLowerCase());
  await form.getByRole("button", { name: "Beitreten", exact: true }).click();
  await expect(form).toBeHidden();
}

async function pause(page: Page) {
  await page.waitForTimeout(1100);
}

test("01 · Konto, Teams und echte iCalendar-Spielpläne", async ({ page }, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "Dennis Demo");
  await create(page, "3. Mannschaft", "Rendsburger TSV · Erwachsene");
  await teams(page);
  await teamCard(page, "3. Mannschaft")
    .getByRole("button", { name: "Kalender importieren", exact: true })
    .click();
  await page
    .getByLabel("iCalendar-Datei (.ics)", { exact: true })
    .setInputFiles(resolve("e2e/fixtures/rendsburger-tsv-3.ics"));
  await expect(
    page.getByRole("region", { name: "Kalender importieren", exact: true }),
  ).toContainText("20 Spiele gefunden");

  const checkboxes = page
    .getByRole("region", { name: "Kalender importieren", exact: true })
    .getByRole("checkbox");

  await expect(checkboxes).toHaveCount(20);
  const firstCheckbox = checkboxes.first();
  await firstCheckbox.check();
  await expect(firstCheckbox).toBeChecked();
  const size = await firstCheckbox.boundingBox();
  expect(size!.width).toBeGreaterThanOrEqual(20);
  expect(size!.height).toBeGreaterThanOrEqual(20);
  await firstCheckbox.uncheck();
  await expect(firstCheckbox).not.toBeChecked();
  await page.screenshot({ path: ".local/demos/import-selection.png", fullPage: true });

  for (const box of await checkboxes.all()) await box.check();
  await pause(page);
  await page.getByRole("button", { name: "Ausgewählte Spiele importieren", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("20 Spiele hinzugefügt");
  await create(page, "4. Mannschaft", "Rendsburger TSV · Erwachsene");
  await teams(page);
  await teamCard(page, "4. Mannschaft")
    .getByRole("button", { name: "Kalender importieren", exact: true })
    .click();
  await page
    .getByLabel("iCalendar-Datei (.ics)", { exact: true })
    .setInputFiles(resolve("e2e/fixtures/rendsburger-tsv-4.ics"));

  for (const box of await page
    .getByRole("region", { name: "Kalender importieren", exact: true })
    .getByRole("checkbox")
    .all())
    await box.check();
  await page.getByRole("button", { name: "Ausgewählte Spiele importieren", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("20 Spiele hinzugefügt");
  await games(page);
  const filter = page.getByRole("group", { name: "Teams filtern", exact: true });
  await expect(filter.getByRole("button", { name: "Alle Teams", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const all = await page
    .getByRole("region", { name: "Kommende Spiele", exact: true })
    .getByTestId("game-card")
    .count();

  expect(all).toBeGreaterThan(1);
  await pause(page);
  await filter.getByRole("button", { name: "3. Mannschaft", exact: true }).click();
  expect(
    await page
      .getByRole("region", { name: "Kommende Spiele", exact: true })
      .getByTestId("game-card")
      .count(),
  ).toBeLessThan(all);
  await pause(page);
  await filter.getByRole("button", { name: "4. Mannschaft", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Kommende Spiele", exact: true }).getByTestId("game-card"),
  ).toHaveCount(all);
  await filter.getByRole("button", { name: "Alle Teams", exact: true }).click();

  const first = page
    .getByRole("region", { name: "Kommende Spiele", exact: true })
    .getByTestId("game-card")
    .first();

  await first.getByRole("button", { name: "Ja", exact: true }).click();
  await expect(first).toContainText("Verfügbar");
  await first.getByText("Antworten ansehen", { exact: true }).click();
  await expect(first).toContainText("Dennis Demo");
  await pause(page);
  await page.screenshot({ path: info.outputPath("desktop.png"), fullPage: false });
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Kommende Spiele", exact: true }).getByTestId("game-card"),
  ).toHaveCount(all);
  expect(errors).toEqual([]);
});

test("02 · Vereinsübergreifend beitreten, Admin ernennen und entfernen", async ({
  page,
  browser,
  baseURL,
}, info) => {
  test.setTimeout(120000);
  const adminContext = await browser.newContext({ baseURL: baseURL! });
  const admin = await adminContext.newPage();

  try {
    await login(admin, "Alex Admin");
    await create(admin, "Erwachsene · Verein A", "Verein A");
    const a = await code(admin, "Erwachsene · Verein A");
    await create(admin, "Jugend · Verein B", "Verein B");
    const b = await code(admin, "Jugend · Verein B");
    await login(page, "Sam Spieler", `/kunludo/?team=${a.teamId}#pin=${a.pin}`);
    const invitation = page.getByRole("region", { name: "Team beitreten", exact: true });
    await expect(invitation.getByLabel("Team-ID", { exact: true })).toHaveValue(a.teamId);
    await expect(invitation.getByLabel("Team-PIN", { exact: true })).toHaveValue(a.pin);
    await invitation.getByRole("button", { name: "Beitreten", exact: true }).click();
    await expect(invitation).toBeHidden();
    expect(new URL(page.url()).hash).toBe("");
    await join(page, b);
    await teams(page);
    await expect(page.getByTestId("team-card")).toHaveCount(2);
    await expect(teamCard(page, "Erwachsene · Verein A")).toContainText("Sam Spieler");
    await expect(teamCard(page, "Jugend · Verein B")).toContainText("Sam Spieler");
    await pause(page);
    await teams(admin);
    await teamCard(admin, "Erwachsene · Verein A")
      .locator("li")
      .filter({ hasText: "Sam Spieler" })
      .getByRole("button", { name: "Zum Admin ernennen", exact: true })
      .click();
    await expect(
      teamCard(page, "Erwachsene · Verein A").getByRole("button", {
        name: "Beitrittscode",
        exact: true,
      }),
    ).toBeVisible();
    await pause(page);
    const old = await code(page, "Erwachsene · Verein A");
    await page
      .getByRole("region", { name: "Beitrittscode", exact: true })
      .getByRole("button", { name: "Schließen", exact: true })
      .click();
    page.once("dialog", (dialog) => dialog.accept());
    await teamCard(page, "Erwachsene · Verein A")
      .locator("li")
      .filter({ hasText: "Alex Admin" })
      .getByRole("button", { name: "Entfernen", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("PIN wurde geändert");
    const next = await code(page, "Erwachsene · Verein A");
    expect(next.teamId).toBe(old.teamId);
    expect(next.pin).not.toBe(old.pin);
    await pause(page);
    await expect(teamCard(admin, "Erwachsene · Verein A")).toHaveCount(0);
    await expect(teamCard(admin, "Jugend · Verein B")).toBeVisible();
    await admin.getByRole("button", { name: "Team beitreten", exact: true }).click();
    const bad = admin.getByRole("region", { name: "Team beitreten", exact: true });
    await bad.getByLabel("Team-ID", { exact: true }).fill(a.teamId);
    await bad.getByLabel("Team-PIN", { exact: true }).fill(a.pin);
    await bad.getByRole("button", { name: "Beitreten", exact: true }).click();
    await expect(admin.getByRole("alert")).toContainText("ungültig");
    await page.screenshot({ path: info.outputPath("teams-and-pin.png"), fullPage: false });
    const before = await (await page.request.get(`/api/kunludo/teams/${a.teamId}/code`)).json();

    const logout = await page.request.post("/api/auth/logout", {
      headers: { Origin: baseURL! },
      data: {},
    });

    expect(logout.ok()).toBe(true);
    // Logout revokes the account session; it does not touch PINs or group membership.
    await page.reload();
    await expect(page.getByLabel("E-Mail", { exact: true })).toBeVisible();
    expect(before.pin).toBe(next.pin);
  } finally {
    await adminContext.close();
  }
});

test.describe("Handy", () => {
  test.use({
    viewport: { width: 390, height: 844 },
  });
  test("03 · Handy: Konflikt entscheiden, Termin abstimmen und neu bestätigen", async ({
    page,
  }, info) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, "Robin Demo");
    await create(page, "Erwachsene A", "Verein A");
    await create(page, "Jugend B", "Verein B");
    await games(page);

    async function make(teamName: string, opponent: string, start: string, end: string) {
      await page.getByRole("button", { name: "Spiel hinzufügen", exact: true }).click();
      const form = page.getByRole("region", { name: "Spiel hinzufügen", exact: true });
      await form.getByLabel("Team", { exact: true }).selectOption({ label: teamName });
      await form.getByLabel("Gegner", { exact: true }).fill(opponent);
      await form.getByLabel("Spielort", { exact: true }).fill("Sporthalle");
      await form.getByLabel("Beginn", { exact: true }).fill(start);
      await form.getByLabel("Geplantes Ende", { exact: true }).fill(end);
      await form.getByRole("button", { name: "Speichern", exact: true }).click();
      await expect(form).toBeHidden();
    }

    await make("Erwachsene A", "Gegner Erwachsene", "2030-02-02T14:00", "2030-02-02T17:00");
    await make("Jugend B", "Gegner Jugend", "2030-02-02T15:00", "2030-02-02T18:00");

    const adult = page
      .getByTestId("game-card")
      .filter({ has: page.getByRole("heading", { name: /Gegner Erwachsene/ }) });

    const youth = page
      .getByTestId("game-card")
      .filter({ has: page.getByRole("heading", { name: /Gegner Jugend/ }) });

    await adult.getByRole("button", { name: "Ja", exact: true }).click();
    await youth.getByRole("button", { name: "Ja", exact: true }).click();
    await expect(adult).toContainText("Entscheidung offen");
    await expect(youth).toContainText("Entscheidung offen");
    await page
      .getByRole("group", { name: "Teams filtern", exact: true })
      .getByRole("button", { name: "Erwachsene A", exact: true })
      .click();
    await expect(youth).toHaveCount(0);
    await adult.getByText("⚑ Terminkonflikt prüfen", { exact: true }).click();
    await expect(adult).toContainText("Jugend B");
    await pause(page);
    await adult.getByRole("button", { name: "Hier verbindlich zusagen", exact: true }).click();
    await expect(adult).toContainText("Verbindlich zugesagt");
    await page
      .getByRole("group", { name: "Teams filtern", exact: true })
      .getByRole("button", { name: "Alle Teams", exact: true })
      .click();
    await expect(youth).toContainText("Anderweitig zugesagt");
    await pause(page);
    await youth.getByRole("button", { name: "Termin vorschlagen", exact: true }).click();
    const proposal = page.getByRole("region", { name: "Termin vorschlagen", exact: true });
    await proposal.getByLabel("Beginn", { exact: true }).fill("2030-02-03T15:00");
    await proposal.getByLabel("Geplantes Ende", { exact: true }).fill("2030-02-03T18:00");
    await proposal.getByRole("button", { name: "Speichern", exact: true }).click();
    const poll = youth.locator(".zs-proposal");
    await poll.getByRole("button", { name: "Ja", exact: true }).click();
    await expect(poll).toContainText("1 Ja");
    page.once("dialog", (d) => d.accept());
    await poll.getByRole("button", { name: "Termin übernehmen", exact: true }).click();
    await expect(youth).toContainText("Bitte erneut antworten");
    await youth.getByRole("button", { name: "Ja", exact: true }).click();
    await expect(youth.locator(".zs-status")).toHaveText("Verfügbar");
    await expect(youth.getByRole("button", { name: /zusagen|Zusage aufheben/ })).toHaveCount(0);
    await expect(adult).toContainText("Verbindlich zugesagt");
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
    await page.screenshot({ path: info.outputPath("mobile.png"), fullPage: true });
    await pause(page);
  });
});

test("lost command responses retry once without duplicate teams; theme and narrow view recover", async ({
  page,
}) => {
  await login(page, "Retry Demo");
  await page.getByRole("button", { name: "Team erstellen", exact: true }).click();
  const form = page.getByRole("region", { name: "Team erstellen", exact: true });
  await form.getByLabel("Teamname", { exact: true }).fill("Einmaliges Team");
  await page.route(
    "**/api/kunludo/command",
    async (route) => {
      await route.fetch();
      await route.abort("failed");
    },
    { times: 1 },
  );
  await form.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Anfrage erneut senden", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Anfrage erneut senden", exact: true }).click();
  await expect(form).toBeHidden();
  await teams(page);
  await expect(page.getByTestId("team-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Einstellungen", exact: true }).click();
  await page.getByLabel("Your theme", { exact: true }).selectOption("ink");
  await page.getByRole("button", { name: "Close settings", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "ink");
  await page.setViewportSize({ width: 320, height: 568 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "ink");
  await teams(page);
  await expect(page.getByTestId("team-card")).toHaveCount(1);
});

test("team timezone dropdown defaults to Berlin and preserves a changed zone", async ({ page }) => {
  await login(page, "Zeitzonen Demo");
  await create(page, "Zeitzonen Team", "");
  await teams(page);
  const card = teamCard(page, "Zeitzonen Team");
  await card.getByRole("button", { name: "Team bearbeiten", exact: true }).click();
  const form = page.getByRole("region", { name: "Team bearbeiten", exact: true });
  const timezone = form.getByRole("combobox", { name: "Zeitzone", exact: true });
  await expect(timezone).toHaveValue("Europe/Berlin");
  await timezone.selectOption("America/New_York");
  await form.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(form).toBeHidden();
  await page.reload();
  await teams(page);
  await card.getByRole("button", { name: "Team bearbeiten", exact: true }).click();
  await expect(timezone).toHaveValue("America/New_York");
});

test("match responses group by answer and update without losing reserve controls", async ({
  page,
  browser,
  baseURL,
}) => {
  await login(page, "Alex Gruppierung");
  await create(page, "Antworten Team", "");
  const invitation = await code(page, "Antworten Team");
  const snapshot = await (await page.request.get("/api/kunludo/snapshot")).json();

  const created = await page.request.post("/api/kunludo/command", {
    headers: { Origin: baseURL! },
    data: {
      commandId: randomUUID(),
      version: snapshot.version,
      action: {
        kind: "create-game",
        teamId: invitation.teamId,
        game: {
          opponent: "Antworten Gegner",
          venue: "Sporthalle",
          home: true,
          window: {
            start: Date.parse("2030-04-01T18:00Z"),
            end: Date.parse("2030-04-01T20:00Z"),
            buffer: 0,
          },
        },
      },
    },
  });

  expect(created.ok()).toBe(true);
  const context = await browser.newContext({ baseURL: baseURL! });

  try {
    const player = await context.newPage();
    await login(player, "Bea Spieler");
    await join(player, invitation);
    await games(player);
    const playerCard = player.getByTestId("game-card");
    await playerCard.getByRole("button", { name: "Ja", exact: true }).click();
    await games(page);
    await expect(page.getByRole("button", { name: "Team erstellen", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Team beitreten", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(0);
    await page.screenshot({ path: ".local/demos/compact-games.png" });
    const card = page.getByTestId("game-card");
    await expect(card.getByRole("button", { name: /zusagen|Zusage aufheben/ })).toHaveCount(0);
    await card.getByText("Antworten ansehen", { exact: true }).click();
    const available = card.getByRole("region", { name: "Verfügbar", exact: true });
    const unanswered = card.getByRole("region", { name: "Noch keine Antwort", exact: true });
    await expect(available).toContainText("Bea Spieler");
    await expect(unanswered).toContainText("Alex Gruppierung");
    await expect(
      card.getByRole("img", { name: "Spieler fehlen · mindestens zwei Wochen Zeit" }),
    ).toBeVisible();
    await expect(card.locator(".zs-date")).toHaveText("Mo., 01.04.2030 · 20:00");
    await expect(available.getByRole("heading")).toHaveText("Verfügbar · 1");
    await expect(unanswered.getByRole("heading")).toHaveText("Noch keine Antwort · 1");
    await available.getByRole("button", { name: "Als Ersatz markieren", exact: true }).click();
    await expect(
      available.getByRole("button", { name: "Ersatz aufheben", exact: true }),
    ).toBeVisible();
    await card.screenshot({ path: ".local/demos/response-groups.png" });
    await playerCard.getByRole("button", { name: "Nein", exact: true }).click();
    await expect(available).toHaveCount(0);
    await expect(card.getByRole("region", { name: "Nicht verfügbar", exact: true })).toContainText(
      "Bea Spieler",
    );
    await expect(unanswered).toContainText("Alex Gruppierung");
    await card
      .getByRole("combobox", { name: "Antwort für Bea Spieler", exact: true })
      .selectOption("maybe");
    await expect(card.getByRole("region", { name: "Vielleicht", exact: true })).toContainText(
      "Bea Spieler",
    );
    await expect(playerCard.locator(".zs-status")).toHaveText("Vielleicht");
    await expect(playerCard.getByRole("combobox", { name: /Antwort für/ })).toHaveCount(0);
    await card.screenshot({ path: ".local/demos/admin-availability.png" });
  } finally {
    await context.close();
  }
});

for (const motion of ["no-preference", "reduce"] as const) {
  test(`save toast countdown (${motion}) stays visible and dismisses automatically or manually`, async ({
    page,
    baseURL,
  }) => {
    await page.emulateMedia({ reducedMotion: motion });
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, "Toast Demo");
    await create(page, "Toast Team", "");
    let snapshot = await (await page.request.get("/api/kunludo/snapshot")).json();
    const teamId = snapshot.teams[0].id;

    for (let i = 0; i < 5; i++) {
      const start = Date.parse("2030-05-01T18:00Z") + i * 86400000;

      const response = await page.request.post("/api/kunludo/command", {
        headers: { Origin: baseURL! },
        data: {
          commandId: randomUUID(),
          version: snapshot.version,
          action: {
            kind: "create-game",
            teamId,
            game: {
              opponent: `Gegner ${i + 1}`,
              venue: "Halle",
              home: true,
              window: { start, end: start + 7200000, buffer: 0 },
            },
          },
        },
      });

      expect(response.ok()).toBe(true);
      snapshot = (await response.json()).snapshot;
    }

    await page.reload();
    await games(page);

    const card = page
      .getByTestId("game-card")
      .filter({ has: page.getByRole("heading", { name: /Gegner 5/ }) });

    await card.getByRole("button", { name: "Ja", exact: true }).click();
    const toast = page.getByRole("status");
    await expect(toast).toHaveText("Gespeichert.×");
    await expect(toast).toHaveCSS("position", "fixed");
    const countdown = toast.locator(".zs-toast-countdown");
    await expect(countdown).toHaveAttribute("aria-hidden", "true");
    await expect(countdown).toHaveCSS("animation-duration", "5s");

    const remaining = () =>
      countdown.evaluate((bar) => new DOMMatrixReadOnly(getComputedStyle(bar).transform).a);

    expect(await remaining()).toBeGreaterThan(0.8);
    await expect.poll(remaining).toBeLessThan(0.7);
    const bounds = await toast.boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(844);
    await page.screenshot({ path: ".local/demos/toast.png" });
    await expect(toast).toHaveCount(0, { timeout: 7000 });
    await card.getByRole("button", { name: "Nein", exact: true }).click();
    await expect(toast).toBeVisible();
    expect(await remaining()).toBeGreaterThan(0.8);
    await toast.getByRole("button", { name: "Meldung schließen", exact: true }).click();
    await expect(toast).toHaveCount(0);
  });
}

const replacementCalendar = (opponent: string) =>
  [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:replacement-match",
    "DTSTART:20300101T180000Z",
    `SUMMARY:Our team - ${opponent}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\n");

async function openImport(page: Page) {
  await login(page, "Calendar replacement");
  await create(page, "Our team", "");
  await teamCard(page, "Our team")
    .getByRole("button", { name: "Kalender importieren", exact: true })
    .click();

  return page.getByLabel("iCalendar-Datei (.ics)", { exact: true });
}

test("invalid replacement calendar clears the previous import", async ({ page }) => {
  const input = await openImport(page);
  await input.setInputFiles({
    name: "valid.ics",
    mimeType: "text/calendar",
    buffer: Buffer.from(replacementCalendar("Old Visitor")),
  });
  await expect(page.locator(".zs-import-list")).toContainText("Old Visitor");
  await input.setInputFiles({
    name: "invalid.ics",
    mimeType: "text/calendar",
    buffer: Buffer.from("invalid calendar"),
  });
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator(".zs-import-list")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Ausgewählte Spiele importieren", exact: true }),
  ).toBeDisabled();
});

test("a late calendar read cannot replace the newly selected file", async ({ page }) => {
  await page.addInitScript(() => {
    const original = (file: File) => Blob.prototype.text.call(file);
    const state = window;
    File.prototype.text = async function () {
      const content = await original(this);

      if (this.name === "slow.ics") {
        await new Promise<void>((resolve) => {
          state.releaseSlow = () => {
            resolve();
            setTimeout(() => {
              state.slowFinished = true;
            }, 0);
          };
        });
      }

      return content;
    };
  });
  const input = await openImport(page);
  await input.setInputFiles({
    name: "slow.ics",
    mimeType: "text/calendar",
    buffer: Buffer.from(replacementCalendar("Old Visitor")),
  });
  await page.waitForFunction(() => typeof window.releaseSlow === "function");
  await input.setInputFiles({
    name: "new.ics",
    mimeType: "text/calendar",
    buffer: Buffer.from(replacementCalendar("New Visitor")),
  });
  await expect(page.locator(".zs-import-list")).toContainText("New Visitor");
  await page.evaluate(() => window.releaseSlow?.());
  await page.waitForFunction(() => window.slowFinished);
  await expect(page.locator(".zs-import-list")).toContainText("New Visitor");
  await expect(page.locator(".zs-import-list")).not.toContainText("Old Visitor");
});
