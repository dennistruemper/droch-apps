import { describe, expect, it } from "vitest";
import { createApplication } from "./index.ts";
import { databaseDefinitions } from "../registry/index.ts";

describe("HTTP composition", () => {
  const app = createApplication({
    ready: async () => true,
    readFrontend: async (_id, path) =>
      path.includes(".") ? null : { body: "frontend", contentType: "text/html" },
  });
  it("mounts app APIs and redirects app roots", async () => {
    expect(await (await app.request("/api/observo/status")).json()).toEqual({
      app: "observo",
      stage: "monitoring",
    });
    expect((await app.request("/observo")).headers.get("location")).toBe("/observo/");
    expect(await (await app.request("/api/poker/status")).json()).toEqual({
      app: "poker",
      stage: "foundation",
    });
    expect(await (await app.request("/api/vortoj/status")).json()).toEqual({
      app: "vortoj",
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
  it("serves Schlezaz without calling the database options provider", async () => {
    const composed = createApplication({
      ready: async () => true,
      readFrontend: async () => ({ body: "Schlezaz", contentType: "text/html" }),
      applicationOptions: (id) => {
        if (id === "schlezaz") throw new Error("A browser-only app has no database");
        return undefined!;
      },
    });
    const redirect = await composed.request("/schlezaz");
    expect(redirect.status).toBe(308);
    expect(redirect.headers.get("location")).toBe("/schlezaz/");
    expect(await (await composed.request("/schlezaz/")).text()).toBe("Schlezaz");
    expect((await composed.request("/api/schlezaz/status")).status).toBe(404);
    expect(databaseDefinitions.map(({ id }) => id)).not.toContain("schlezaz");
    expect(await (await composed.request("/")).text()).toContain('href="/schlezaz/"');
  });
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
