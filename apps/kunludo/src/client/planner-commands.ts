import { snapshotSchema, resultSchema, codeSchema } from "../contracts/index.ts";
import { request } from "./api.ts";
import type { Effect, Message } from "./planner-model.ts";
export async function execute(effect: Effect, signal: AbortSignal): Promise<Message> {
  if (effect.kind === "load")
    return {
      kind: "loaded",
      id: effect.id,
      data: snapshotSchema.parse(await request("/api/kunludo/snapshot", signal)),
    };
  if (effect.kind === "code")
    return {
      kind: "coded",
      id: effect.id,
      code: codeSchema.parse(
        await request(`/api/kunludo/teams/${encodeURIComponent(effect.teamId)}/code`, signal),
      ),
    };
  const v = resultSchema.parse(
    await request("/api/kunludo/command", signal, {
      commandId: effect.commandId,
      version: effect.version,
      action: effect.action,
    }),
  );
  return {
    kind: "saved",
    id: effect.id,
    data: v.snapshot,
    notice: v.message,
    ...(v.teamId ? { teamId: v.teamId } : {}),
  };
}
