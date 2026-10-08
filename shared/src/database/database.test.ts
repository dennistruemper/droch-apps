import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connectDatabase, migrateDatabase } from "./index.ts";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function fixture(sql = "CREATE TABLE records (id INTEGER PRIMARY KEY, value TEXT NOT NULL);") {
  const root = mkdtempSync(join(tmpdir(), "droch-sqlite-"));
  directories.push(root);
  const migrations = join(root, "migrations");
  mkdirSync(join(migrations, "meta"), { recursive: true });
  writeFileSync(
    join(migrations, "meta/_journal.json"),
    JSON.stringify({
      version: "7",
      dialect: "sqlite",
      entries: [{ idx: 0, version: "6", when: 1, tag: "0000_initial", breakpoints: true }],
    }),
  );
  writeFileSync(join(migrations, "0000_initial.sql"), sql);
  return { root, migrations, data: join(root, "data") };
}

describe("SQLite persistence", () => {
  it("keeps app files independent and preserves data across migration reruns and reconnects", () => {
    const { data, migrations } = fixture();
    for (const id of ["auth", "poker", "vortoj"]) migrateDatabase(data, id, migrations);
    const poker = connectDatabase(data, "poker", { mustExist: true });
    poker.db.$client.prepare("INSERT INTO records (value) VALUES (?)").run("poker only");
    poker.close();
    migrateDatabase(data, "poker", migrations);
    const reopened = connectDatabase(data, "poker", { mustExist: true });
    const words = connectDatabase(data, "vortoj", { mustExist: true });
    try {
      expect(reopened.db.$client.prepare("SELECT value FROM records").get()).toEqual({
        value: "poker only",
      });
      expect(words.db.$client.prepare("SELECT value FROM records").all()).toEqual([]);
      expect(reopened.ready(migrations)).toBe(true);
      expect(reopened.db.$client.pragma("journal_mode", { simple: true })).toBe("wal");
    } finally {
      reopened.close();
      words.close();
    }
  });
  it("enforces foreign keys and rolls back a failed transaction", () => {
    const { data, migrations } = fixture(
      "CREATE TABLE parents (id INTEGER PRIMARY KEY);\n--> statement-breakpoint\nCREATE TABLE children (parent_id INTEGER REFERENCES parents(id));",
    );
    migrateDatabase(data, "vortoj", migrations);
    const connection = connectDatabase(data, "vortoj");
    try {
      expect(() =>
        connection.db.$client.transaction(() => {
          connection.db.$client.exec("INSERT INTO parents VALUES (1)");
          connection.db.$client.exec("INSERT INTO children VALUES (2)");
        })(),
      ).toThrow(/FOREIGN KEY/);
      expect(connection.db.$client.prepare("SELECT * FROM parents").all()).toEqual([]);
    } finally {
      connection.close();
    }
  });
  it("rejects missing databases and reports pending or edited migrations as unready", () => {
    const { data, migrations } = fixture();
    expect(() => connectDatabase(data, "vortoj", { mustExist: true })).toThrow();
    const connection = connectDatabase(data, "vortoj");
    expect(connection.ready(migrations)).toBe(false);
    connection.close();
    migrateDatabase(data, "vortoj", migrations);
    const migrated = connectDatabase(data, "vortoj");
    try {
      writeFileSync(join(migrations, "0000_initial.sql"), "CREATE TABLE changed (id INTEGER);");
      expect(migrated.ready(migrations)).toBe(false);
      expect(() => connectDatabase(data, "../auth")).toThrow("Invalid database ID");
    } finally {
      migrated.close();
    }
  });
  it("does not leave partially applied SQL after a migration fails", () => {
    const { data, migrations } = fixture(
      "CREATE TABLE records (id INTEGER);\n--> statement-breakpoint\nINVALID SQL;",
    );
    expect(() => migrateDatabase(data, "poker", migrations)).toThrow();
    const connection = connectDatabase(data, "poker");
    try {
      expect(
        connection.db.$client
          .prepare("SELECT name FROM sqlite_master WHERE name = 'records'")
          .all(),
      ).toEqual([]);
      expect(connection.ready(migrations)).toBe(false);
    } finally {
      connection.close();
    }
  });
});
