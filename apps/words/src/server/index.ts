import { Hono } from "hono";
import { appDefinition, statusSchema } from "../contracts/index.ts";

export * from "./schema.ts";
export { appDefinition };

export function createRoutes() {
  return new Hono().get("/status", (context) =>
    context.json(statusSchema.parse({ app: appDefinition.id, stage: "foundation" })),
  );
}
