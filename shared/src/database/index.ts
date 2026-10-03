import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

export function connectDatabase(
  directory: string,
  id: string,
  options: { mustExist?: boolean } = {},
) {
  if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new Error("Invalid database ID");
  if (!options.mustExist) mkdirSync(directory, { recursive: true, mode: 0o700 });
  const client = new Database(resolve(directory, `${id}.sqlite`), {
    fileMustExist: options.mustExist ?? false,
    timeout: 5000,
    ...(process.env.DROCH_BUILD === "production"
      ? { nativeBinding: resolve(process.cwd(), "dist/native/better_sqlite3.node") }
      : {}),
  });
  try {
    client.pragma("journal_mode = WAL");
    client.pragma("foreign_keys = ON");
    client.pragma("synchronous = FULL");
  } catch (error) {
    client.close();
    throw error;
  }
  const db = drizzle(client);
  return {
    db,
    ready(migrationsFolder: string) {
      try {
        const applied = client.prepare("SELECT hash FROM __drizzle_migrations").all() as {
          hash: string;
        }[];
        const hashes = new Set(applied.map((migration) => migration.hash));
        return readMigrationFiles({ migrationsFolder }).every((migration) =>
          hashes.has(migration.hash),
        );
      } catch {
        return false;
      }
    },
    close: () => client.close(),
  };
}

export function migrateDatabase(directory: string, id: string, migrationsFolder: string) {
  const connection = connectDatabase(directory, id);
  try {
    migrate(connection.db, { migrationsFolder });
    if (!connection.ready(migrationsFolder)) throw new Error(`Incomplete migrations for ${id}`);
  } finally {
    connection.close();
  }
}
