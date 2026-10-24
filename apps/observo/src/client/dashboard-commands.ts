import { dashboardSchema } from "../contracts/index.ts";
import type { Command, Message } from "./dashboard-model.ts";

export async function execute(command: Command, signal: AbortSignal): Promise<Message> {
  const response = await fetch("/api/observo/sites", {
    signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    credentials: "omit",
  });
  if (!response.ok) throw new Error("Could not load monitoring data. Please try again.");
  return { kind: "loaded", id: command.id, data: dashboardSchema.parse(await response.json()) };
}
