import { z } from "zod";

export const slots = ["A", "B", "C", "X", "Y", "Z"] as const;
export const teamNames = ["Heim", "Gast"] as const;

export const schedule = [
  [0, 3],
  [1, 4],
  [2, 5],
  "double",
  [1, 3],
  [0, 5],
  [2, 4],
  [1, 5],
  [2, 3],
  [0, 4],
] as const;

export const pairs = ["01", "02", "12"] as const;
export const pairIndices = { "01": [0, 1], "02": [0, 2], "12": [1, 2] } as const;

export const draftSchema = z.object({
  players: z.array(z.object({ name: z.string().max(64), rating: z.string().max(5) })).length(6),
  doubles: z.tuple([z.enum(pairs).nullable(), z.enum(pairs).nullable()]),
});

export type Draft = z.infer<typeof draftSchema>;

export const savedSchema = z.object({ version: z.literal(1), draft: draftSchema });

export type Side = 0 | 1;

export type Score = [number, number];

export function emptyDraft(): Draft {
  return {
    players: slots.map(() => ({ name: "", rating: "" })),
    doubles: [null, null],
  };
}

export function rating(value: string): number | null {
  if (!/^\d{1,5}$/.test(value)) return null;
  const parsed = Number(value);

  return parsed <= 10000 ? parsed : null;
}

export function playerName(draft: Draft, index: number): string {
  return draft.players[index]!.name.trim() || slots[index]!;
}

/** Starting points for the weaker side in every set, from the supplied June 2014 table. */
export function handicap(left: number, right: number): Score {
  const difference = Math.abs(left - right);
  const points = Math.min(8, Math.max(0, Math.ceil((difference - 50) / 100)));

  return left < right ? [points, 0] : [0, points];
}

export type Pairing = { label: string; names: [string, string] } & (
  | { kind: "pending"; reason: string }
  | { kind: "ready"; ratings: Score; start: Score }
);

export function pairing(draft: Draft, index: number): Pairing | null {
  const game = schedule[index];

  if (!game) return null;
  let names: [string, string], values: [number | null, number | null];

  if (game === "double") {
    if (!draft.doubles[0] || !draft.doubles[1])
      return {
        label: "Doppel",
        names: ["Doppel Heim", "Doppel Gast"],
        kind: "pending",
        reason: "Doppel noch aufstellen",
      };

    const left = pairIndices[draft.doubles[0]],
      right = pairIndices[draft.doubles[1]].map((i) => i + 3);

    names = [
      left.map((i) => playerName(draft, i)).join(" / "),
      right.map((i) => playerName(draft, i)).join(" / "),
    ];

    const highest = (indices: readonly number[]) => {
      const ratings = indices.map((i) => rating(draft.players[i]!.rating));

      return ratings.every((n) => n !== null) ? Math.max(...ratings) : null;
    };

    values = [highest(left), highest(right)];
  } else {
    names = [playerName(draft, game[0]), playerName(draft, game[1])];
    values = [rating(draft.players[game[0]]!.rating), rating(draft.players[game[1]]!.rating)];
  }

  const label = game === "double" ? "Doppel" : `${slots[game[0]]} : ${slots[game[1]]}`;
  const [left, right] = values;

  return left === null || right === null
    ? { label, names, kind: "pending", reason: "Live-PZ ergänzen" }
    : { label, names, kind: "ready", ratings: [left, right], start: handicap(left, right) };
}
