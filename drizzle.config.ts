import { defineConfig } from "drizzle-kit";
import { databaseDefinitions } from "@repo/server/registry";

const definition = databaseDefinitions.find(({ id }) => id === process.env.DATABASE_ID);
if (!definition) throw new Error("Use pnpm db:generate [auth|app-id] to select a database");
export default defineConfig({
  dialect: "sqlite",
  schema: definition.schema,
  out: `./migrations/${definition.id}`,
});
