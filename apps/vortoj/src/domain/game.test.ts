import { describe, expect, it } from "vitest";
const randomUUID = () => crypto.randomUUID();
import {
  evaluateMove,
  newGame,
  decideGame,
  presets,
  projectGame,
  voteOutcome,
  type Game,
  type Player,
} from "./index.ts";
import { tileSetSchema, type GameCommand } from "../contracts/index.ts";
const user = (name: string) => ({ id: randomUUID(), name });
const tile = (letter: string, points = 1) => ({ id: randomUUID(), letter, points });
const effects = { now: 1, draw: () => 0, id: randomUUID };
function started(count = 2) {
  const owner = user("Alice"),
    game = newGame(owner);
  for (let i = 1; i < count; i++) game.players.push({ ...user(`Player ${i}`), score: 0, rack: [] });
  return {
    owner,
    game: decideGame(
      game,
      owner.id,
      owner.id,
      { kind: "start", commandId: randomUUID(), version: 0 },
      presets[0]!,
      effects,
    ),
  };
}
function move(game: Game, ownerId: string) {
  return decideGame(
    game,
    ownerId,
    game.players[game.turn]!.id,
    {
      kind: "place",
      commandId: randomUUID(),
      version: game.version,
      placements: game.players[game.turn]!.rack.slice(0, 2).map((t, i) => ({
        tileId: t.id,
        row: 7,
        col: 7 + i,
      })),
    },
    presets[0]!,
    effects,
  );
}
describe("Vortoj board rules", () => {
  it("validates the presets and their tile counts", () => {
    expect(
      presets.map((set) => tileSetSchema.parse(set).tiles.reduce((sum, t) => sum + t.count, 0)),
    ).toEqual([100, 102]);
  });
  it("normalizes Unicode letters and rejects symbols, duplicates and scored jokers", () => {
    const set = {
      name: "Accents",
      tiles: [
        { letter: "e\u0301", count: 28, points: 1 },
        { letter: "*", count: 2, points: 0 },
      ],
    };
    expect(tileSetSchema.parse(set).tiles[0]!.letter).toBe("É");
    for (const letter of ["th", "3", "😀", "!"])
      expect(
        tileSetSchema.safeParse({ ...set, tiles: [{ letter, count: 28, points: 1 }] }).success,
      ).toBe(false);
    expect(
      tileSetSchema.safeParse({
        ...set,
        tiles: [
          { letter: "a", count: 14, points: 1 },
          { letter: "A", count: 14, points: 1 },
        ],
      }).success,
    ).toBe(false);
    expect(
      tileSetSchema.safeParse({ ...set, tiles: [{ letter: "*", count: 28, points: 1 }] }).success,
    ).toBe(false);
    expect(
      tileSetSchema.parse({ ...set, tiles: [{ letter: "ß", count: 28, points: 1 }] }).tiles[0]!
        .letter,
    ).toBe("ẞ");
  });
  it("requires the centre, contiguous placement, connection and owned tiles", () => {
    const a = tile("A"),
      b = tile("B", 3);
    expect(() =>
      evaluateMove(
        [],
        [a, b],
        [
          { tileId: a.id, row: 0, col: 0 },
          { tileId: b.id, row: 0, col: 1 },
        ],
        ["A", "B"],
      ),
    ).toThrow(/centre/);
    expect(() =>
      evaluateMove(
        [],
        [a, b],
        [
          { tileId: a.id, row: 7, col: 7 },
          { tileId: b.id, row: 7, col: 9 },
        ],
        ["A", "B"],
      ),
    ).toThrow(/gaps/);
    expect(() =>
      evaluateMove(
        [],
        [a, b],
        [
          { tileId: a.id, row: 7, col: 7 },
          { tileId: a.id, row: 7, col: 8 },
        ],
        ["A"],
      ),
    ).toThrow(/once/);
    expect(() => evaluateMove([], [a], [{ tileId: b.id, row: 7, col: 7 }], ["A"])).toThrow(/rack/);
    const old = { ...tile("A"), row: 7, col: 7, blank: false };
    expect(() =>
      evaluateMove(
        [old],
        [a, b],
        [
          { tileId: a.id, row: 0, col: 0 },
          { tileId: b.id, row: 0, col: 1 },
        ],
        ["A", "B"],
      ),
    ).toThrow(/Connect/);
  });
  it("scores the first word and never reapplies old premiums", () => {
    const a = tile("A"),
      b = tile("B", 3);
    expect(
      evaluateMove(
        [],
        [a, b],
        [
          { tileId: a.id, row: 7, col: 7 },
          { tileId: b.id, row: 7, col: 8 },
        ],
        ["A", "B"],
      ).words[0]!.points,
    ).toBe(8);
    expect(
      evaluateMove(
        [{ ...a, row: 7, col: 7, blank: false }],
        [b],
        [{ tileId: b.id, row: 7, col: 8 }],
        ["A", "B"],
      ).words[0]!.points,
    ).toBe(4);
  });
  it("scores cross words separately and gives the seven-tile bonus", () => {
    const c = tile("C", 3),
      board = [
        { ...tile("A"), row: 7, col: 6, blank: false },
        { ...tile("B", 3), row: 6, col: 7, blank: false },
      ];
    const cross = evaluateMove(board, [c], [{ tileId: c.id, row: 7, col: 7 }], ["C"]);
    expect(cross.words.map((w) => w.points)).toEqual([8, 12]);
    const rack = Array.from({ length: 7 }, () => tile("A"));
    const all = evaluateMove(
      [],
      rack,
      rack.map((t, i) => ({ tileId: t.id, row: 7, col: i + 4 })),
      ["A"],
    );
    expect(all.bonus).toBe(50);
  });
  it("fixes joker letters and keeps their score at zero", () => {
    const blank = tile("*", 0),
      a = tile("A");
    const result = evaluateMove(
      [],
      [blank, a],
      [
        { tileId: blank.id, row: 7, col: 7, letter: "Æ" },
        { tileId: a.id, row: 7, col: 8 },
      ],
      ["A", "Æ"],
    );
    expect(result.placed[0]).toMatchObject({ letter: "Æ", points: 0, blank: true });
    expect(result.words[0]!.points).toBe(2);
    expect(() =>
      evaluateMove(
        [],
        [blank, a],
        [
          { tileId: blank.id, row: 7, col: 7, letter: "Q" },
          { tileId: a.id, row: 7, col: 8 },
        ],
        ["A"],
      ),
    ).toThrow(/joker/);
  });
});
describe("turns and opponent approval", () => {
  it.each([2, 3, 4])("requires half of %i-player opponents, rounded up", (count) => {
    const { owner, game } = started(count);
    const proposed = move(game, owner.id);
    expect(proposed.pending!.requiredApprovals).toBe(Math.ceil((count - 1) / 2));
    expect(proposed.board).toEqual([]);
    expect(proposed.players[0]!.rack).toHaveLength(7);
  });
  it("accepts only after enough approvals and rejects impossible majorities", () => {
    const { owner, game } = started(4);
    let proposed = move(game, owner.id);
    const vote = (person: Player, approve: boolean): GameCommand => ({
      kind: "vote",
      commandId: randomUUID(),
      version: proposed.version,
      votes: proposed.pending!.words.map((w) => ({ wordId: w.id, approve })),
    });
    proposed = decideGame(
      proposed,
      owner.id,
      proposed.players[1]!.id,
      vote(proposed.players[1]!, true),
      presets[0]!,
      effects,
    );
    expect(proposed.phase).toBe("voting");
    proposed = decideGame(
      proposed,
      owner.id,
      proposed.players[2]!.id,
      vote(proposed.players[2]!, true),
      presets[0]!,
      effects,
    );
    expect(proposed.phase).toBe("playing");
    expect(proposed.board).toHaveLength(2);
    expect(proposed.turn).toBe(1);
    expect(proposed.players[0]!.rack).toHaveLength(7);
    let rejected = move(game, owner.id);
    for (const opponent of rejected.players.slice(1, 3))
      rejected = decideGame(
        rejected,
        owner.id,
        opponent.id,
        {
          kind: "vote",
          commandId: randomUUID(),
          version: rejected.version,
          votes: rejected.pending!.words.map((w) => ({ wordId: w.id, approve: false })),
        },
        presets[0]!,
        effects,
      );
    expect(rejected.board).toEqual([]);
    expect(rejected.players[0]!.rack).toEqual(game.players[0]!.rack);
    expect(rejected.turn).toBe(1);
  });
  it("requires approval of every formed word", () => {
    const a = user("A"),
      b = user("B");
    const pending = {
      authorId: a.id,
      placements: [],
      words: [
        { id: "1", text: "AB", points: 2 },
        { id: "2", text: "BA", points: 2 },
      ],
      bonus: 0,
      votes: { "1": { [b.id]: true } },
      requiredApprovals: 1,
    };
    expect(voteOutcome(pending, [b.id])).toBe("pending");
  });
  it("prevents self-voting, duplicate votes, stale commands and wrong turns", () => {
    const { owner, game } = started(4),
      proposed = move(game, owner.id),
      wordId = proposed.pending!.words[0]!.id;
    const vote: GameCommand = {
      kind: "vote",
      commandId: randomUUID(),
      version: proposed.version,
      votes: [{ wordId, approve: true }],
    };
    expect(() => decideGame(proposed, owner.id, owner.id, vote, presets[0]!, effects)).toThrow(
      /Opponents/,
    );
    const after = decideGame(proposed, owner.id, game.players[1]!.id, vote, presets[0]!, effects);
    expect(() =>
      decideGame(
        after,
        owner.id,
        game.players[1]!.id,
        { ...vote, version: after.version },
        presets[0]!,
        effects,
      ),
    ).toThrow(/already voted/);
    expect(() =>
      decideGame(
        game,
        owner.id,
        game.players[1]!.id,
        { kind: "pass", commandId: randomUUID(), version: game.version },
        presets[0]!,
        effects,
      ),
    ).toThrow(/turn/);
    expect(() =>
      decideGame(
        game,
        owner.id,
        owner.id,
        { kind: "pass", commandId: randomUUID(), version: 0 },
        presets[0]!,
        effects,
      ),
    ).toThrow(/changed/);
  });
  it("draws replacements before returning exchanged tiles", () => {
    const { owner, game } = started();
    const returned = game.players[0]!.rack.slice(0, 3);
    const next = decideGame(
      game,
      owner.id,
      owner.id,
      {
        kind: "exchange",
        commandId: randomUUID(),
        version: game.version,
        tileIds: returned.map((t) => t.id),
      },
      presets[0]!,
      effects,
    );
    expect(next.players[0]!.rack).toHaveLength(7);
    expect(next.players[0]!.rack.some((t) => returned.some((old) => old.id === t.id))).toBe(false);
    expect(next.bag.length).toBe(game.bag.length);
  });
  it("finishes after repeated scoreless turns and deducts rack points", () => {
    const { owner, game } = started();
    let next = game;
    for (let i = 0; i < 4; i++)
      next = decideGame(
        next,
        owner.id,
        next.players[next.turn]!.id,
        { kind: "pass", commandId: randomUUID(), version: next.version },
        presets[0]!,
        effects,
      );
    expect(next.phase).toBe("finished");
    expect(next.players[0]!.score).toBe(
      -game.players[0]!.rack.reduce((sum, t) => sum + t.points, 0),
    );
  });
  it.each([false, true])("awards remaining points only when a player goes out (%s)", (goesOut) => {
    const { owner, game } = started();
    game.bag = goesOut ? [] : [tile("T", 0)];
    game.scoreless = goesOut ? 0 : 3;
    game.players[0]!.rack = [
      tile("A", goesOut ? 1 : 0),
      tile("A", goesOut ? 1 : 0),
      ...(goesOut ? [] : [tile("Z", 3)]),
    ];
    game.players[1]!.rack = [tile("Q", 10)];
    const proposed = move(game, owner.id);
    const finished = decideGame(
      proposed,
      owner.id,
      game.players[1]!.id,
      {
        kind: "vote",
        commandId: randomUUID(),
        version: proposed.version,
        votes: proposed.pending!.words.map((word) => ({ wordId: word.id, approve: true })),
      },
      presets[0]!,
      effects,
    );
    expect(finished.phase).toBe("finished");
    expect(finished.players[0]!.score).toBe(goesOut ? 14 : -3);
    expect(finished.players[1]!.score).toBe(-10);
    expect(game.players[0]!.score).toBe(0);
  });
  it("projects only the viewer rack, never the secret game state or bag", () => {
    const { owner, game } = started();
    const snapshot = projectGame(game, owner.id, {
      id: randomUUID(),
      title: "Test",
      ownerId: owner.id,
      tileSet: presets[0]!,
    });
    const wire = JSON.stringify(snapshot);
    expect(snapshot.you.rack).toEqual(game.players[0]!.rack);
    expect(wire).not.toContain('"state"');
    expect(wire).not.toContain('"bag":');
    for (const tile of game.players[1]!.rack) expect(wire).not.toContain(tile.id);
  });
});
