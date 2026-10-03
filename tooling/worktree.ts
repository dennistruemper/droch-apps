import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";

export function worktreeIdentity(directory: string) {
  const id = createHash("sha256").update(realpathSync(directory)).digest("hex").slice(0, 12);
  return { id, projectName: `droch-${id}`, cookieName: `droch_session_${id}` };
}
