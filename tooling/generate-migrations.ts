import { spawnSync } from "node:child_process";
import { databaseDefinitions } from "@repo/server/registry";

const requested = process.argv[2];
const selected = requested
  ? databaseDefinitions.filter(({ id }) => id === requested)
  : databaseDefinitions;
if (!selected.length) throw new Error(`Unknown database: ${requested}`);
for (const { id } of selected) {
  const result = spawnSync("pnpm", ["exec", "drizzle-kit", "generate"], {
    env: { ...process.env, DATABASE_ID: id },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
