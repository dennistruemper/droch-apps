import { describe, expect, it } from "vitest";
import { createApplication } from "./index.ts";

describe("HTTP composition", () => {
  const app = createApplication({
    ready: async () => true,
    readFrontend: async (_id, path) =>
      path.includes(".") ? null : { body: "frontend", contentType: "text/html" },
  });
  it("mounts app APIs and redirects app roots", async () => {
    expect(await (await app.request("/api/poker/status")).json()).toEqual({
      app: "poker",
      stage: "foundation",
    });
    expect(await (await app.request("/api/words/status")).json()).toEqual({
      app: "words",
      stage: "foundation",
    });
    const response = await app.request("/poker");
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("/poker/");
  });
  it.each(["/api/poker/missing", "/api/unknown/", "/poker/assets/missing.js", "/unknown/"])(
    "does not turn %s into SPA HTML",
    async (path) => {
      expect((await app.request(path)).status).toBe(404);
    },
  );
  it("keeps liveness separate from database readiness", async () => {
    const unready = createApplication({
      ready: async () => {
        throw new Error("database unavailable");
      },
      readFrontend: async () => null,
    });
    expect((await unready.request("/health/live")).status).toBe(200);
    expect((await unready.request("/health/ready")).status).toBe(503);
  });
});
