import { resolve } from "node:path";
import { migrateDatabase } from "@repo/shared/database";
import { databaseDefinitions } from "@repo/server/registry";

const directory = process.env.DATA_DIRECTORY;
if (!directory) throw new Error("DATA_DIRECTORY is required for migrations");
for (const { id } of databaseDefinitions) {
  migrateDatabase(directory, id, resolve(process.cwd(), "migrations", id));
}
console.log("SQLite migrations complete.");
