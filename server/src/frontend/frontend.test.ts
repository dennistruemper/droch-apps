import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createFrontendReader } from "./index.ts";

let root: string;
beforeAll(async () => {
  root = await mkdtemp(resolve(tmpdir(), "droch-frontends-"));
  await mkdir(resolve(root, "dist/client/poker/assets"), { recursive: true });
  await writeFile(resolve(root, "dist/client/poker/index.html"), "<h1>Poker</h1>");
  await writeFile(resolve(root, "dist/client/poker/assets/app.js"), "console.log('poker')");
  await writeFile(resolve(root, "secret.txt"), "private");
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("frontend serving", () => {
  it("serves frontend navigation and built assets", async () => {
    const read = createFrontendReader({ root });
    expect((await read("poker", "/poker/room/abc"))?.body).toBe("<h1>Poker</h1>");
    expect((await read("poker", "/poker/assets/app.js"))?.contentType).toBe(
      "text/javascript; charset=utf-8",
    );
    expect(await read("poker", "/poker/assets/nope.js")).toBeNull();
  });
  it.each([
    "/poker/%2e%2e/%2e%2e/secret.txt",
    "/poker/%5c..%5csecret.txt",
    "/poker/%00",
    "/poker/%invalid",
    "/poker/assets/missing",
  ])("rejects unsafe or missing path %s", async (path) => {
    expect(await createFrontendReader({ root })("poker", path)).toBeNull();
  });
});
