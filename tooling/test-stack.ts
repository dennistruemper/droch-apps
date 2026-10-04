import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { worktreeIdentity } from "./worktree.ts";

const root = process.cwd();
const identity = worktreeIdentity(root);
const projectName = `${identity.projectName}-test`;
const image = `droch-apps:check-${identity.id}`;
const directory = resolve(root, ".local/test");
const override = resolve(directory, "compose.json");
const command = process.argv[2];
if (!["build", "up", "stop", "logs"].includes(command ?? ""))
  throw new Error("Expected build, up, stop, or logs");

function docker(args: string[]) {
  const result = spawnSync("docker", args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Docker command failed (${result.status})`);
}

function compose(args: string[]) {
  docker([
    "compose",
    "--project-name",
    projectName,
    "--env-file",
    resolve(directory, ".env"),
    "-f",
    "compose.yaml",
    "-f",
    override,
    ...args,
  ]);
}

async function availablePort() {
  const socket = createServer();
  await new Promise<void>((ready, reject) => {
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", ready);
  });
  const address = socket.address();
  if (!address || typeof address === "string") throw new Error("Could not allocate test port");
  const port = address.port;
  await new Promise<void>((closed) => socket.close(() => closed()));
  return port;
}

if (command === "build") {
  docker(["build", "--target", "production", "-t", image, "."]);
} else if (command === "up") {
  await mkdir(directory, { recursive: true });
  const origin = `http://localhost:${await availablePort()}`;
  await writeFile(
    resolve(directory, ".env"),
    `APP_ORIGIN=${origin}\nSESSION_COOKIE_NAME=${identity.cookieName}_test\n`,
    { mode: 0o600 },
  );
  await writeFile(resolve(directory, "browser.env"), `TEST_BASE_URL=${origin}\n`);
  await writeFile(
    override,
    JSON.stringify({
      services: {
        migrate: { image },
        application: { image, ports: [`127.0.0.1:${new URL(origin).port}:3000`] },
      },
    }),
  );
  compose(["up", "--no-build", "-d", "--force-recreate", "migrate", "application"]);
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch(`${origin}/health/ready`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // The migration gate or application may still be starting.
    }
    await new Promise<void>((done) => setTimeout(done, 500));
  }
  if (!ready) {
    compose(["logs", "--tail", "100", "migrate", "application"]);
    throw new Error("Production test server did not become ready");
  }
  console.log(`Production test stack: ${origin}\nTEST_BASE_URL=${origin} pnpm test:e2e`);
} else if (existsSync(override)) {
  // Only this checkout's disposable test data is removed; development data is separate.
  compose(command === "stop" ? ["down", "--volumes"] : ["logs", "--tail", "100"]);
}
