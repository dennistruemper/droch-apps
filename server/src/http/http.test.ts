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
  it("removes Observo routes, discovery and database registration", async () => {
    for (const path of [
      "/observo",
      "/observo/",
      "/api/observo/status",
      "/api/observo/sites",
      "/api/observo/activate",
    ]) {
      expect(
        (await app.request(path, { method: path.endsWith("activate") ? "POST" : "GET" })).status,
      ).toBe(404);
    }

    expect(await (await app.request("/")).text()).not.toContain("observo");
    expect(databaseDefinitions.map(({ id }) => id)).toEqual(["auth", "kunludo", "poker", "vortoj"]);
  });
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
  it("serves Enigmo QR targets without API or database provisioning", async () => {
    expect((await app.request("/enigmo")).headers.get("location")).toBe("/enigmo/");
    expect(await (await app.request("/enigmo/?code=YMIR")).text()).toBe("frontend");
    expect((await app.request("/api/enigmo/status")).status).toBe(404);
    expect(databaseDefinitions.map(({ id }) => id)).not.toContain("enigmo");
    expect(await (await app.request("/")).text()).toContain('href="/enigmo/"');
  });
  it("serves Kunludo under its new name without old planner aliases", async () => {
    expect(await (await app.request("/api/kunludo/status")).json()).toEqual({
      app: "kunludo",
      stage: "ready",
    });
    expect((await app.request("/zusammenspiel/")).status).toBe(404);
    expect((await app.request("/api/zusammenspiel/status")).status).toBe(404);
    const index = await (await app.request("/")).text();
    expect(index).toContain('href="/kunludo/"');
    expect(index).toContain("Kunludo");
    expect(index).not.toContain("Zusammenspiel");
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
  it("mounts the browser-only calculator without an API or database", async () => {
    expect((await app.request("/avantago")).headers.get("location")).toBe("/avantago/");
    expect((await app.request("/avantago/")).status).toBe(200);
    expect((await app.request("/api/avantago/status")).status).toBe(404);
    expect(databaseDefinitions.map((database) => database.id)).not.toContain("avantago");
    expect(await (await app.request("/")).text()).toContain('href="/avantago/"');
  });
});
