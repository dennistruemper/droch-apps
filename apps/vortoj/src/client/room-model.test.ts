import { describe, expect, it } from "vitest";
import { init, update, type Model, type Message } from "./room-model.ts";
import type { Snapshot } from "../contracts/index.ts";
const userId = "alice";
const snapshot: Snapshot = {
  id: "room",
  title: "Sunday",
  ownerId: userId,
  version: 1,
  phase: "playing",
  tileSet: {
    name: "Small",
    tiles: [
      { letter: "A", count: 28, points: 1 },
      { letter: "*", count: 2, points: 0 },
    ],
  },
  board: [],
  bagCount: 16,
  turnId: userId,
  players: [
    { id: userId, name: "Alice", score: 0, tileCount: 2 },
    { id: "bob", name: "Bob", score: 0, tileCount: 7 },
  ],
  you: {
    id: userId,
    rack: [
      { id: "a", letter: "A", points: 1 },
      { id: "joker", letter: "*", points: 0 },
    ],
  },
  pending: null,
  history: [],
};
const step = (model: Model, event: Message) => update(model, event, userId);
const active = () => step(init(), { kind: "snapshot", room: snapshot }).model;
describe("room transitions", () => {
  it("keeps exchange and placement mutually exclusive and resets drafts on a newer snapshot", () => {
    const selected = step(active(), { kind: "select-tile", id: "a" }).model;
    const placed = step(selected, { kind: "place", row: 7, col: 7 }).model;
    expect(placed.move).toMatchObject({
      kind: "placement",
      selected: null,
      draft: [{ tileId: "a", row: 7, col: 7 }],
    });
    expect(step(placed, { kind: "exchange" }).model).toBe(placed);
    expect(step(placed, { kind: "snapshot", room: snapshot }).model.move).toBe(placed.move);
    const cleared = step(placed, { kind: "clear-move" }).model;
    const exchange = step(cleared, { kind: "exchange" }).model;
    expect(step(exchange, { kind: "place", row: 7, col: 7 }).model).toBe(exchange);
    const chosen = step(exchange, { kind: "select-tile", id: "a" }).model;
    expect(chosen.move).toEqual({ kind: "exchange", tiles: ["a"] });
    const advanced = step(chosen, { kind: "snapshot", room: { ...snapshot, version: 2 } });
    expect(advanced.model.move).toMatchObject({ kind: "placement", selected: null, draft: [] });
  });
  it("validates joker letters, requests the dialog and fixes the letter in each placement", () => {
    const selected = step(active(), { kind: "select-tile", id: "joker" });
    expect(selected.commands).toEqual([{ kind: "joker-dialog", open: true }]);
    const invalid = step(step(selected.model, { kind: "joker-changed", letter: "B" }).model, {
      kind: "joker-confirmed",
    });
    expect(invalid.model.move).toMatchObject({
      jokerError: "Choose a letter from this tile set for the joker.",
    });
    const valid = step(step(invalid.model, { kind: "joker-changed", letter: "a" }).model, {
      kind: "joker-confirmed",
    });
    expect(valid.commands).toEqual([{ kind: "joker-dialog", open: false }]);
    const placed = step(valid.model, { kind: "place", row: 7, col: 7 }).model;
    expect(placed.move).toMatchObject({
      draft: [{ tileId: "joker", row: 7, col: 7, letter: "A" }],
    });
    expect(snapshot.board).toEqual([]);
  });
  it("ignores duplicate commands and late responses without reverting a newer streamed snapshot", () => {
    const pending = step(active(), { kind: "action", action: { kind: "pass" } });
    expect(pending.commands).toEqual([
      { kind: "action", id: 1, action: { kind: "pass" }, version: 1 },
    ]);
    expect(step(pending.model, { kind: "action", action: { kind: "pass" } }).model).toBe(
      pending.model,
    );
    const streamed = step(pending.model, {
      kind: "snapshot",
      room: { ...snapshot, version: 3 },
    }).model;
    const completed = step(streamed, {
      kind: "loaded",
      id: 1,
      room: { ...snapshot, version: 2 },
    }).model;
    expect(completed.screen).toMatchObject({ room: { version: 3 } });
    expect(completed.pending).toBeNull();
    expect(step(completed, { kind: "failed", id: 1, status: 0, error: "Late" }).model).toBe(
      completed,
    );
  });
  it("treats removal as terminal and ignores pending HTTP, stream and connection events", () => {
    const pending = step(active(), { kind: "action", action: { kind: "pass" } }).model;
    const removed = step(pending, { kind: "removed" });
    expect(removed.commands).toEqual([{ kind: "close-stream" }, { kind: "close-dialogs" }]);
    expect(removed.model.screen.kind).toBe("removed");
    expect(removed.model.pending).toBeNull();
    for (const event of [
      { kind: "loaded", id: 1, room: snapshot },
      { kind: "snapshot", room: snapshot },
      { kind: "connection", text: "Offline" },
      { kind: "refresh" },
    ] as Message[])
      expect(step(removed.model, event).model).toBe(removed.model);
  });
  it("reconciles conflicts, separates expiry from removal, and does not duplicate loads", () => {
    const request = step(active(), { kind: "action", action: { kind: "pass" } }).model;
    const conflict = step(request, { kind: "failed", id: 1, status: 409, error: "Changed" });
    expect(conflict.commands).toEqual([{ kind: "load", id: 2 }]);
    expect(step(conflict.model, { kind: "refresh" }).commands).toEqual([]);
    expect(
      step(conflict.model, { kind: "failed", id: 2, status: 401, error: "Ended" }).model.screen
        .kind,
    ).toBe("expired");
    expect(
      step(conflict.model, { kind: "failed", id: 2, status: 404, error: "Gone" }).model.screen.kind,
    ).toBe("removed");
  });
  it("preserves an active room when old invite information arrives after joining", () => {
    const loading = step(init(), { kind: "refresh" }).model;
    const streamed = step(loading, { kind: "snapshot", room: snapshot }).model;
    const lateInfo = step(streamed, {
      kind: "invite-loaded",
      id: 1,
      info: { id: "room", title: "Sunday", phase: "waiting", playerCount: 1 },
    });
    expect(lateInfo.model.screen).toBe(streamed.screen);
    expect(lateInfo.model.loading).toBeNull();
  });
  it("opens opponent approval and restores overview when accepted tiles extend the board", () => {
    const voting = {
      ...snapshot,
      version: 2,
      phase: "voting" as const,
      pending: {
        authorId: "bob",
        placements: [],
        words: [{ id: "w", text: "AA", points: 2 }],
        bonus: 0,
        votes: {},
        requiredApprovals: 1,
      },
    };
    expect(step(active(), { kind: "snapshot", room: voting }).commands).toContainEqual({
      kind: "approval",
      version: 2,
      action: "show",
    });
    const voted = {
      ...voting,
      version: 3,
      pending: { ...voting.pending, votes: { w: { [userId]: true } } },
    };
    expect(step(active(), { kind: "snapshot", room: voted }).commands).toContainEqual({
      kind: "approval",
      version: 3,
      action: "keep",
    });
    const authored = { ...voting, pending: { ...voting.pending, authorId: userId } };
    expect(step(active(), { kind: "snapshot", room: authored }).commands).toContainEqual({
      kind: "approval",
      version: 2,
      action: "keep",
    });
    const accepted = step(step(active(), { kind: "snapshot", room: voting }).model, {
      kind: "snapshot",
      room: {
        ...snapshot,
        version: 3,
        board: [{ id: "b", letter: "A", points: 1, blank: false, row: 7, col: 7 }],
      },
    });
    expect(accepted.commands).toContainEqual({ kind: "overview" });
    expect(accepted.commands).toContainEqual({ kind: "approval", version: 3, action: "close" });
  });
});
