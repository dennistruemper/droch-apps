import type { Vote, RoomSnapshot } from "../contracts/index.ts";

export type RoomState = {
  id: string;
  title: string;
  creatorId: string;
  round: number;
  version: number;
  revealed: boolean;
};
export type Participant = { id: string; name: string; vote: Vote | null };
export type Command =
  | { kind: "vote"; round: number; vote: Vote | null }
  | { kind: "reveal" | "reset"; round: number };
export type RuleError = "stale-round" | "already-revealed" | "no-votes";

export function decideCommand(
  room: RoomState,
  participants: readonly Participant[],
  command: Command,
): { ok: true; next: RoomState } | { ok: false; error: RuleError } {
  if (command.round !== room.round) return { ok: false, error: "stale-round" };
  if (command.kind !== "reset" && room.revealed) return { ok: false, error: "already-revealed" };
  if (command.kind === "reveal" && !participants.some((member) => member.vote !== null))
    return { ok: false, error: "no-votes" };
  return {
    ok: true,
    next: {
      ...room,
      version: room.version + 1,
      round: command.kind === "reset" ? room.round + 1 : room.round,
      revealed: command.kind === "reveal" ? true : command.kind === "reset" ? false : room.revealed,
    },
  };
}

export function projectRoom(
  room: RoomState,
  members: readonly Participant[],
  viewer: Participant,
): RoomSnapshot {
  return {
    id: room.id,
    title: room.title,
    round: room.round,
    version: room.version,
    revealed: room.revealed,
    participants: members.map((member) => ({
      id: member.id,
      name: member.name,
      isCreator: member.id === room.creatorId,
      hasVoted: member.vote !== null,
      vote: room.revealed ? member.vote : null,
    })),
    you: { id: viewer.id, isCreator: viewer.id === room.creatorId, vote: viewer.vote },
  };
}
