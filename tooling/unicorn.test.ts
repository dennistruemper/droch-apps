import { afterAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
const executable = resolve("node_modules/.bin/oxlint");
const directory = mkdtempSync(join(tmpdir(), "droch-unicorn-"));

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const policy: unknown = JSON.parse(readFileSync(resolve("tooling/unicorn-policy.json"), "utf8"));
const config: unknown = JSON.parse(readFileSync(resolve(".oxlintrc.json"), "utf8"));

assert.ok(isRecord(policy) && isRecord(policy.rules));

assert.ok(isRecord(config) && isRecord(config.rules) && Array.isArray(config.plugins));

const choices = policy.rules;
const configuredRules = config.rules;
const plugins = config.plugins;

const nativeRules = Object.fromEntries(
  Object.entries(choices).map(([name, choice]) => {
    assert.ok(isRecord(choice) && (choice.status === "error" || choice.status === "off"));
    assert.ok(typeof choice.reason === "string" && choice.reason.length >= 20);

    return [`unicorn/${name}`, choice.status];
  }),
);

const fixtureConfig = join(directory, "oxlint.json");

writeFileSync(
  fixtureConfig,
  JSON.stringify({ plugins: ["unicorn"], categories: { correctness: "off" }, rules: nativeRules }),
);

afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe("reviewed Unicorn policy", () => {
  it("requires a reviewed explicit decision for every rule in the pinned registry", () => {
    const result = spawnSync(executable, ["--rules", "--format=json"], {
      cwd: root,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    const registry: unknown = JSON.parse(result.stdout);
    assert.ok(Array.isArray(registry));

    const rules = registry.map((rule: unknown) => {
      assert.ok(isRecord(rule) && typeof rule.scope === "string" && typeof rule.value === "string");

      return { scope: rule.scope, value: rule.value };
    });

    expect(Object.keys(choices).sort()).toEqual(
      rules
        .filter((rule) => rule.scope === "unicorn")
        .map((rule) => rule.value)
        .sort(),
    );
    expect(plugins).toContain("unicorn");

    for (const [name, choice] of Object.entries(choices)) {
      assert.ok(isRecord(choice));
      expect(configuredRules[`unicorn/${name}`]).toBe(choice.status);
    }
  });

  it("documents every supported and wider upstream rule name", () => {
    const upstream: unknown = JSON.parse(
      readFileSync(resolve("tooling/unicorn-upstream.json"), "utf8"),
    );

    assert.ok(isRecord(upstream) && Array.isArray(upstream.rules));
    assert.ok(typeof upstream.sha === "string" && upstream.sha.length === 40);

    const upstreamNames = upstream.rules.filter(
      (name: unknown): name is string => typeof name === "string",
    );

    expect(upstreamNames).toHaveLength(upstream.rules.length);

    const document = readFileSync(resolve("docs/unicorn-lint-policy.md"), "utf8");

    for (const name of new Set([...Object.keys(choices), ...upstreamNames]))
      expect(document).toContain(`\`${name}\``);
  });

  it.each([
    [
      "no-invalid-remove-event-listener",
      'const target = new EventTarget(); target.removeEventListener("click", () => {});',
    ],
    ["no-array-fill-with-reference-type", "const cells = Array(5).fill({ points: 0 });"],
    ["no-invalid-fetch-options", 'fetch("/api", { method: "GET", body: "ignored" });'],
    ["no-accessor-recursion", "const model = { get value() { return this.value; } };"],
    ["require-post-message-target-origin", 'window.postMessage("secret");'],
  ])("rejects %s mistakes through the real linter", (name, source) => {
    const file = join(directory, `${name}.ts`);
    writeFileSync(file, source);

    const result = spawnSync(executable, ["-c", fixtureConfig, file], {
      cwd: root,
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain(name);
  });

  it("allows matching cleanup and the project's null/reduce/immutable model conventions", () => {
    const file = join(directory, "valid.ts");
    writeFileSync(
      file,
      'const target = new EventTarget(); const handler = () => {}; target.addEventListener("click", handler); target.removeEventListener("click", handler); const value = [1, 2].reduce((total, n) => total + n, 0); const model = { value, pending: null }; const next = { ...model, value: 3 };',
    );

    const result = spawnSync(executable, ["-c", fixtureConfig, file], {
      cwd: root,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
  });
});
