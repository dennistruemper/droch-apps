import { it, expect } from "vitest";
import { init, update, emptyFields, calendarTeam } from "./planner-model.ts";
import type { Snapshot } from "../contracts/index.ts";

const empty: Snapshot = { version: 2, teams: [], games: [] };

it("ignores stale results, preserves drafts on live updates and clears removed-team data", () => {
  let m = update(init(0), { kind: "loaded", id: 1, data: empty }).model;
  m = update(m, {
    kind: "open",
    editor: {
      kind: "join",
      teamId: "",
      gameId: "",
      fields: { ...emptyFields, pin: "ABC123" },
      calendar: "",
      events: [],
      selected: [],
      version: 2,
    },
  }).model;
  m = update(m, { kind: "snapshot", data: { ...empty, version: 4 } }).model;
  expect(m.editor.kind).toBe("join");

  expect(m.editor).toMatchObject({ kind: "join", version: 4 });
  m = update(m, {
    kind: "save",
    commandId: "test-command",
    action: { kind: "join", teamId: "t", pin: "ABC123" },
  }).model;
  const pending = m.pending;
  expect(
    update(m, {
      kind: "save",
      commandId: "test-command",
      action: { kind: "join", teamId: "t", pin: "ABC123" },
    }).effects,
  ).toEqual([]);
  expect(update(m, { kind: "saved", id: 999, data: empty, notice: "bad" }).model.pending).toEqual(
    pending,
  );
  const expired = update(m, { kind: "expired" }).model;
  expect(expired.data).toBeNull();
  expect(update(expired, { kind: "snapshot", data: empty }).model.screen).toBe("expired");
});

it("uses union filters and empty selection means all", () => {
  let m = init(0);
  m = update(m, { kind: "filter", teamId: "a" }).model;
  m = update(m, { kind: "filter", teamId: "b" }).model;
  expect(m.filter).toEqual(["a", "b"]);
  m = update(m, { kind: "clear-filter" }).model;
  expect(m.filter).toEqual([]);
});

it("retries uncertain writes with the same command ID and ignores file reads from a closed editor", () => {
  let m = update(init(0), { kind: "loaded", id: 1, data: empty }).model;
  m = update(m, {
    kind: "save",
    commandId: "durable-retry-id",
    action: { kind: "join", teamId: "x", pin: "ABC123" },
  }).model;
  const original = m.pending!;
  m = update(m, { kind: "failed", id: original.id, error: "offline", status: 0 }).model;
  expect(
    update(m, {
      kind: "save",
      commandId: "another",
      action: { kind: "join", teamId: "x", pin: "ABC123" },
    }).effects,
  ).toEqual([]);
  const retried = update(m, { kind: "retry" });
  expect(retried.effects[0]).toMatchObject({ kind: "save", commandId: "durable-retry-id" });
  expect(retried.effects[0]!.id).not.toBe(original.id);
  m = update(retried.model, {
    kind: "saved",
    id: retried.effects[0]!.id,
    data: empty,
    notice: "ok",
  }).model;
  expect(m.retry).toBeNull();
  const before = m;
  m = update(m, { kind: "calendar", editorId: 999, text: "old file", events: [] }).model;
  expect(m).toBe(before);
});

it("detects a calendar's common team on either side and refuses ambiguous guesses", () => {
  const events = [
    { uid: "a", home: "Visitor", away: "Our team", summary: "", start: 0, end: 1, venue: "" },
    { uid: "b", home: "Our team", away: "Other", summary: "", start: 2, end: 3, venue: "" },
  ];

  expect(calendarTeam(events)).toBe("Our team");
  expect(calendarTeam(events.slice(0, 1))).toBe("");
  expect(calendarTeam(events.slice(0, 1), "Our team")).toBe("Our team");
  expect(calendarTeam([])).toBe("");
  expect(calendarTeam([...events, { ...events[0]!, home: "X", away: "Y" }])).toBe("");
});

it("an older toast dismissal cannot clear a newer confirmation", () => {
  let m = update(init(0), { kind: "loaded", id: 1, data: empty }).model;

  const save = () => {
    m = update(m, {
      kind: "save",
      commandId: "toast-test",
      action: { kind: "join", teamId: "t", pin: "ABC123" },
    }).model;
    const id = m.pending!.id;
    m = update(m, { kind: "saved", id, data: empty, notice: "Gespeichert." }).model;

    return id;
  };

  const old = save();
  const current = save();
  m = update(m, { kind: "dismiss-notice", id: old }).model;
  expect(m.notice).toBe("Gespeichert.");
  m = update(m, { kind: "dismiss-notice", id: current }).model;
  expect(m.notice).toBe("");
});

it("rejects a delayed PIN response after a newer snapshot and allows reopening", () => {
  const team = {
    id: "t",
    name: "Team",
    club: "",
    needed: 4,
    timezone: "Europe/Berlin",
    role: "admin" as const,
    members: [],
  };

  const snapshot: Snapshot = { version: 2, teams: [team], games: [] };
  let m = update(init(0), { kind: "loaded", id: 1, data: snapshot }).model;
  m = update(m, { kind: "code", teamId: "t" }).model;
  const id = m.pending!.id;
  m = update(m, { kind: "snapshot", data: { ...snapshot, version: 3 } }).model;
  const old = { teamId: "t", pin: "OLD123", version: 2 };
  m = update(m, { kind: "coded", id, code: old }).model;
  expect(m.code).toBeNull();
  expect(m.pending).toBeNull();
  m = update(m, { kind: "code", teamId: "t" }).model;
  const fresh = { teamId: "t", pin: "NEW123", version: 3 };
  m = update(m, { kind: "coded", id: m.pending!.id, code: fresh }).model;
  expect(m.code?.pin).toBe("NEW123");
  // A fresh HTTP response may arrive before its matching stream snapshot.
  m = update(m, { kind: "code", teamId: "t" }).model;
  m = update(m, {
    kind: "coded",
    id: m.pending!.id,
    code: { ...fresh, version: 4 },
  }).model;
  m = update(m, { kind: "snapshot", data: { ...snapshot, version: 4 } }).model;
  expect(m.code?.pin).toBe("NEW123");
});

it("keeps an import draft usable when only the global revision changes for another account", () => {
  const team = {
    id: "ours",
    name: "Our team",
    club: "",
    needed: 4,
    timezone: "Europe/Berlin",
    role: "admin" as const,
    members: [],
  };

  const data: Snapshot = { version: 2, teams: [team], games: [] };
  let m = update(init(0), { kind: "loaded", id: 1, data }).model;
  m = update(m, {
    kind: "open",
    editor: {
      kind: "import",
      teamId: team.id,
      gameId: "",
      version: 2,
      fields: { ...emptyFields, ownName: "Our team" },
      calendar: "calendar draft",
      events: [],
      selected: ["game-uid"],
    },
  }).model;
  const draft = m.editor;
  const generation = m.editorId;
  m = update(m, { kind: "snapshot", data: { ...data, version: 5 } }).model;
  expect(m.editor).toEqual({ ...draft, version: 5 });
  expect(m.editorId).toBe(generation);

  const saved = update(m, {
    kind: "save",
    commandId: "import-after-private-update",
    action: {
      kind: "import",
      teamId: team.id,
      calendar: "calendar draft",
      ownName: "Our team",
      selected: ["game-uid"],
    },
  });

  expect(saved.effects).toEqual([
    {
      kind: "save",
      id: m.next,
      version: 5,
      commandId: "import-after-private-update",
      action: {
        kind: "import",
        teamId: team.id,
        calendar: "calendar draft",
        ownName: "Our team",
        selected: ["game-uid"],
      },
    },
  ]);
});

it("real visible changes stay stale through later unrelated snapshots until explicit review", () => {
  const team = {
    id: "ours",
    name: "Our team",
    club: "",
    needed: 4,
    timezone: "Europe/Berlin",
    role: "admin" as const,
    members: [],
  };

  const data: Snapshot = { version: 2, teams: [team], games: [] };
  let m = update(init(0), { kind: "loaded", id: 1, data }).model;
  m = update(m, {
    kind: "open",
    editor: {
      kind: "settings",
      teamId: team.id,
      gameId: "",
      version: 2,
      fields: { ...emptyFields, name: "My unsaved name" },
      calendar: "",
      events: [],
      selected: [],
    },
  }).model;

  const changed: Snapshot = {
    ...data,
    version: 3,
    teams: [{ ...team, name: "Another admin's name" }],
  };

  m = update(m, { kind: "snapshot", data: changed }).model;
  expect(m.editor).toMatchObject({ version: 2, fields: { name: "My unsaved name" } });
  m = update(m, { kind: "snapshot", data: { ...changed, version: 4 } }).model;
  expect(m.editor).toMatchObject({ version: 2 });
  m = update(m, { kind: "snapshot", data: { ...data, version: 1 } }).model;
  expect(m.data?.version).toBe(4);
  expect(m.editor).toMatchObject({ version: 2 });
  m = update(m, { kind: "rebase" }).model;
  expect(m.editor).toMatchObject({ version: 4, fields: { name: "My unsaved name" } });
  m = update(m, { kind: "snapshot", data: { ...changed, version: 5 } }).model;
  expect(m.editor).toMatchObject({ version: 5 });
  m = update(m, { kind: "snapshot", data: { version: 6, teams: [], games: [] } }).model;
  expect(m.editor.kind).toBe("none");
});

it("a changed game still requires review even when team metadata is identical", () => {
  const data: Snapshot = { version: 2, teams: [], games: [] };
  let m = update(init(0), { kind: "loaded", id: 1, data }).model;
  m = update(m, {
    kind: "open",
    editor: {
      kind: "create-team",
      teamId: "",
      gameId: "",
      version: 2,
      fields: { ...emptyFields, name: "Draft" },
      calendar: "",
      events: [],
      selected: [],
    },
  }).model;

  const changed: Snapshot = {
    ...data,
    version: 3,
    games: [
      {
        id: "game",
        teamId: "team",
        opponent: "Visitors",
        venue: "Hall",
        home: true,
        window: { start: 0, end: 1000, buffer: 0 },
        revision: 1,
        cancelled: false,
        notice: "",
        imported: false,
        calendarUid: null,
        mine: "unanswered",
        conflicts: [],
        sameDay: [],
        committed: false,
        ready: 0,
        uncertain: 0,
        needed: 4,
        members: [],
        proposals: [],
      },
    ],
  };

  m = update(m, { kind: "snapshot", data: changed }).model;
  expect(m.editor).toMatchObject({ version: 2, fields: { name: "Draft" } });
  m = update(m, { kind: "snapshot", data: { ...changed, version: 4 } }).model;
  expect(m.editor).toMatchObject({ version: 2 });
});
