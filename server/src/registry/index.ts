import { appDefinition as poker, createRoutes as createPokerRoutes } from "@repo/poker/server";
import { appDefinition as words, createRoutes as createWordsRoutes } from "@repo/words/server";

// The only application registration list. Build, development, and HTTP mounting use it.
export const applications = [
  { ...poker, createRoutes: createPokerRoutes },
  { ...words, createRoutes: createWordsRoutes },
] as const;

export function validateApplications(apps: readonly { id: string }[]) {
  const seen = new Set<string>();
  for (const app of apps) {
    if (!/^[a-z][a-z0-9-]*$/.test(app.id) || seen.has(app.id)) {
      throw new Error(`Invalid or duplicate application ID: ${app.id}`);
    }
    seen.add(app.id);
  }
}

// File names and schema locations follow the registered app IDs. Auth is shared.
export const databaseDefinitions = [
  { id: "auth", schema: "./shared/src/auth/schema.ts" },
  ...applications.map((app) => ({ id: app.id, schema: `./apps/${app.id}/src/server/schema.ts` })),
] as const;
