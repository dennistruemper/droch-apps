import {
  appDefinition as kunludo,
  createRoutes as createKunludoRoutes,
  type KunludoOptions,
} from "@repo/kunludo/server";
import { appDefinition as enigmo } from "@repo/enigmo/contracts";
import { appDefinition as schlezaz } from "@repo/schlezaz/contracts";
import { appDefinition as poker, createRoutes as createPokerRoutes } from "@repo/poker/server";
import { appDefinition as words, createRoutes as createWordsRoutes } from "@repo/vortoj/server";

// The only application registration list. Build, development, and HTTP mounting use it.
export const applications = [
  { ...kunludo, createRoutes: createKunludoRoutes },
  { ...poker, createRoutes: createPokerRoutes },
  { ...words, createRoutes: createWordsRoutes },
  schlezaz,
  enigmo,
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

// Server-backed apps own databases; browser-only entries need no storage. Auth is shared.
export const databaseDefinitions = [
  { id: "auth", schema: "./shared/src/auth/schema.ts" },
  ...applications
    .filter((app) => "createRoutes" in app)
    .map((app) => ({
      id: app.id,
      schema: `./apps/${app.id}/src/server/schema.ts`,
    })),
] as const;

import type { PokerOptions } from "@repo/poker/server";
import type { VortojOptions } from "@repo/vortoj/server";

export type ApplicationOptions = PokerOptions &
  Pick<VortojOptions, "resolveUser"> &
  Pick<KunludoOptions, "joinSecret" | "sendMail" | "deliveryAddress">;
