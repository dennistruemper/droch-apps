import type { TileSet, Placement, GameCommand, Snapshot } from "../contracts/index.ts";
export type Tile = { id: string; letter: string; points: number };
export type BoardTile = Tile & { row: number; col: number; blank: boolean };
export type Player = { id: string; name: string; score: number; rack: Tile[] };
export type FormedWord = { id: string; text: string; points: number };
export type Game = {
  phase: Snapshot["phase"];
  version: number;
  players: Player[];
  board: BoardTile[];
  bag: Tile[];
  turn: number;
  scoreless: number;
  pending: Snapshot["pending"];
  history: Snapshot["history"];
};
export class RuleError extends Error {}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RuleError(message);
}
const tripleWords = new Set(["0,0", "0,7", "0,14", "7,0", "7,14", "14,0", "14,7", "14,14"]);
const tripleLetters = new Set([
  "1,5",
  "1,9",
  "5,1",
  "5,5",
  "5,9",
  "5,13",
  "9,1",
  "9,5",
  "9,9",
  "9,13",
  "13,5",
  "13,9",
]);
const doubleLetters = new Set([
  "0,3",
  "0,11",
  "2,6",
  "2,8",
  "3,0",
  "3,7",
  "3,14",
  "6,2",
  "6,6",
  "6,8",
  "6,12",
  "7,3",
  "7,11",
  "8,2",
  "8,6",
  "8,8",
  "8,12",
  "11,0",
  "11,7",
  "11,14",
  "12,6",
  "12,8",
  "14,3",
  "14,11",
]);
export function premium(row: number, col: number): "TW" | "DW" | "TL" | "DL" | "" {
  const key = `${row},${col}`;
  if (tripleWords.has(key)) return "TW";
  if (
    ((row === col || row + col === 14) && ((row >= 1 && row <= 4) || (row >= 10 && row <= 13))) ||
    (row === 7 && col === 7)
  )
    return "DW";
  if (tripleLetters.has(key)) return "TL";
  return doubleLetters.has(key) ? "DL" : "";
}
export function evaluateMove(
  board: BoardTile[],
  rack: Tile[],
  placements: Placement[],
  alphabet: string[],
) {
  assert(placements.length > 0 && placements.length <= 7, "Place one to seven tiles");
  assert(
    new Set(placements.map((p) => p.tileId)).size === placements.length,
    "Use each tile only once",
  );
  assert(
    new Set(placements.map((p) => `${p.row},${p.col}`)).size === placements.length,
    "Place only one tile on each square",
  );
  const placed = placements.map((p) => {
    assert(
      Number.isInteger(p.row) &&
        Number.isInteger(p.col) &&
        p.row >= 0 &&
        p.row < 15 &&
        p.col >= 0 &&
        p.col < 15,
      "Place tiles inside the board",
    );
    assert(
      !board.some((t) => t.row === p.row && t.col === p.col),
      "That square is already occupied",
    );
    const tile = rack.find((t) => t.id === p.tileId);
    assert(tile, "That tile is not on your rack");
    if (tile.letter === "*")
      assert(
        p.letter && p.letter !== "*" && alphabet.includes(p.letter),
        "Choose a letter from this tile set for the joker",
      );
    else assert(!p.letter || p.letter === tile.letter, "A letter tile cannot change its letter");
    return {
      ...tile,
      row: p.row,
      col: p.col,
      letter: tile.letter === "*" ? p.letter! : tile.letter,
      blank: tile.letter === "*",
    };
  });
  assert(
    placed.every((t) => t.row === placed[0]!.row) || placed.every((t) => t.col === placed[0]!.col),
    "Place tiles in one row or one column",
  );
  const combined = [...board, ...placed],
    at = (row: number, col: number) => combined.find((t) => t.row === row && t.col === col);
  const horizontal = placed.every((t) => t.row === placed[0]!.row);
  const coordinates = placed.map((t) => (horizontal ? t.col : t.row)),
    minimum = Math.min(...coordinates),
    maximum = Math.max(...coordinates);
  for (let position = minimum; position <= maximum; position++)
    assert(
      horizontal ? at(placed[0]!.row, position) : at(position, placed[0]!.col),
      "Do not leave gaps between tiles",
    );
  if (!board.length)
    assert(
      placed.some((t) => t.row === 7 && t.col === 7),
      "The first word must cover the centre star",
    );
  else
    assert(
      placed.some((t) =>
        board.some((old) => Math.abs(old.row - t.row) + Math.abs(old.col - t.col) === 1),
      ),
      "Connect your word to tiles already on the board",
    );
  const words = new Map<string, FormedWord>();
  for (const tile of placed)
    for (const [dr, dc] of [
      [0, 1],
      [1, 0],
    ] as const) {
      let row = tile.row,
        col = tile.col;
      while (at(row - dr, col - dc)) {
        row -= dr;
        col -= dc;
      }
      const id = `${row}:${col}:${dr}`;
      let text = "",
        points = 0,
        multiplier = 1,
        length = 0;
      for (let square = at(row, col); square; square = at(row, col)) {
        text += square.letter;
        length++;
        const fresh = placed.some((p) => p.id === square.id),
          bonus = fresh ? premium(row, col) : "";
        points += square.points * (bonus === "DL" ? 2 : bonus === "TL" ? 3 : 1);
        multiplier *= bonus === "DW" ? 2 : bonus === "TW" ? 3 : 1;
        row += dr;
        col += dc;
      }
      if (length >= 2) words.set(id, { id, text, points: points * multiplier });
    }
  assert(words.size > 0, "A word must contain at least two letters");
  return { placed, words: [...words.values()], bonus: placed.length === 7 ? 50 : 0 };
}
export function newGame(owner: { id: string; name: string }): Game {
  return {
    phase: "waiting",
    version: 0,
    players: [{ ...owner, score: 0, rack: [] }],
    board: [],
    bag: [],
    turn: 0,
    scoreless: 0,
    pending: null,
    history: [],
  };
}
export function voteOutcome(pending: NonNullable<Game["pending"]>, opponents: string[]) {
  const outcomes = pending.words.map((word) => {
    const votes = opponents.map((id) => pending.votes[word.id]?.[id]);
    const approvals = votes.filter((v) => v === true).length,
      undecided = votes.filter((v) => v === undefined).length;
    return approvals >= pending.requiredApprovals
      ? "accepted"
      : approvals + undecided < pending.requiredApprovals
        ? "rejected"
        : "pending";
  });
  return outcomes.includes("rejected")
    ? "rejected"
    : outcomes.every((v) => v === "accepted")
      ? "accepted"
      : "pending";
}
export function decideGame(
  current: Game,
  ownerId: string,
  actorId: string,
  command: GameCommand,
  set: TileSet,
  effects: { now: number; draw: (max: number) => number; id: () => string },
): Game {
  const game = structuredClone(current),
    actor = game.players.find((p) => p.id === actorId);
  assert(actor, "Join this room first");
  assert(command.version === game.version, "This game changed. Refresh it and try again");
  const log = (text: string) => {
    game.history.push({ text, at: effects.now });
    game.history = game.history.slice(-100);
  };
  const fill = (player: Player) => {
    while (player.rack.length < 7 && game.bag.length) player.rack.push(game.bag.shift()!);
  };
  const finish = (out: Player | null) => {
    for (const player of game.players) {
      const rest = player.rack.reduce((sum, t) => sum + t.points, 0);
      player.score -= rest;
      if (out && player !== out) out.score += rest;
    }
    game.phase = "finished";
    game.pending = null;
    log("Game finished. Remaining tile points were deducted.");
  };
  const next = (score: number, out: Player | null = null) => {
    game.scoreless = score > 0 ? 0 : game.scoreless + 1;
    const emptied = out && !game.bag.length && !out.rack.length;
    if (emptied || game.scoreless >= game.players.length * 2) finish(emptied ? out : null);
    else {
      game.turn = (game.turn + 1) % game.players.length;
      game.phase = "playing";
      game.pending = null;
    }
  };
  if (command.kind === "start") {
    assert(game.phase === "waiting", "This game has already started");
    assert(actorId === ownerId, "Only the room creator can start the game");
    assert(
      game.players.length >= 2 && game.players.length <= 4,
      "Invite two to four players before starting",
    );
    game.bag = set.tiles.flatMap((t) =>
      Array.from({ length: t.count }, () => ({
        id: effects.id(),
        letter: t.letter,
        points: t.points,
      })),
    );
    for (let i = game.bag.length - 1; i > 0; i--) {
      const j = effects.draw(i + 1);
      assert(j >= 0 && j <= i, "Invalid random tile draw");
      [game.bag[i], game.bag[j]] = [game.bag[j]!, game.bag[i]!];
    }
    game.players.forEach(fill);
    game.phase = "playing";
    log(`${actor.name} started the game.`);
  } else if (command.kind === "vote") {
    assert(game.phase === "voting" && game.pending, "There is no word waiting for votes");
    assert(actorId !== game.pending.authorId, "Opponents vote on the placed words");
    assert(
      new Set(command.votes.map((v) => v.wordId)).size === command.votes.length,
      "Vote once on each word",
    );
    for (const vote of command.votes) {
      assert(
        game.pending.words.some((w) => w.id === vote.wordId),
        "That word is not part of this move",
      );
      const ballots = game.pending.votes[vote.wordId] ?? {};
      assert(ballots[actorId] === undefined, "You already voted on this word");
      ballots[actorId] = vote.approve;
      game.pending.votes[vote.wordId] = ballots;
    }
    const opponents = game.players.filter((p) => p.id !== game.pending!.authorId).map((p) => p.id),
      outcome = voteOutcome(game.pending, opponents);
    if (outcome !== "pending") {
      const author = game.players.find((p) => p.id === game.pending!.authorId)!;
      if (outcome === "accepted") {
        const proposal = game.pending;
        game.board.push(...proposal.placements);
        author.rack = author.rack.filter((t) => !proposal.placements.some((p) => p.id === t.id));
        const score = proposal.words.reduce((sum, w) => sum + w.points, proposal.bonus);
        author.score += score;
        fill(author);
        log(
          `${author.name}: ${proposal.words.map((w) => w.text).join(", ")} accepted (+${score}).`,
        );
        next(score, author);
      } else {
        log(`${author.name}'s move was rejected. Their tiles were returned and the turn ended.`);
        next(0);
      }
    }
  } else {
    assert(game.phase === "playing", "Wait for the current word vote to finish");
    assert(game.players[game.turn]?.id === actorId, "Wait for your turn");
    if (command.kind === "place") {
      const move = evaluateMove(
        game.board,
        actor.rack,
        command.placements,
        set.tiles.filter((t) => t.letter !== "*").map((t) => t.letter),
      );
      game.pending = {
        authorId: actorId,
        placements: move.placed,
        words: move.words,
        bonus: move.bonus,
        votes: {},
        requiredApprovals: Math.ceil((game.players.length - 1) / 2),
      };
      game.phase = "voting";
      log(`${actor.name} placed ${move.words.map((w) => w.text).join(", ")} for approval.`);
    }
    if (command.kind === "pass") {
      log(`${actor.name} passed.`);
      next(0);
    }
    if (command.kind === "exchange") {
      assert(game.bag.length >= 7, "At least seven tiles must remain in the bag to exchange");
      assert(
        new Set(command.tileIds).size === command.tileIds.length,
        "Select each tile only once",
      );
      const returned = command.tileIds.map((id) => {
        const tile = actor.rack.find((t) => t.id === id);
        assert(tile, "That tile is not on your rack");
        return tile;
      });
      actor.rack = actor.rack.filter((t) => !command.tileIds.includes(t.id));
      fill(actor);
      for (const tile of returned) game.bag.splice(effects.draw(game.bag.length + 1), 0, tile);
      log(`${actor.name} exchanged ${returned.length} tiles.`);
      next(0);
    }
  }
  game.version++;
  return game;
}
export function projectGame(
  game: Game,
  viewerId: string,
  room: { id: string; title: string; ownerId: string; tileSet: TileSet },
): Snapshot {
  const viewer = game.players.find((p) => p.id === viewerId);
  assert(viewer, "Join this room first");
  return {
    id: room.id,
    title: room.title,
    ownerId: room.ownerId,
    tileSet: room.tileSet,
    version: game.version,
    phase: game.phase,
    board: game.board,
    bagCount: game.bag.length,
    turnId: game.players[game.turn]!.id,
    players: game.players.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      tileCount: p.rack.length,
    })),
    you: { id: viewerId, rack: viewer.rack },
    pending: game.pending,
    history: game.history,
  };
}

export { presets } from "./presets.ts";
