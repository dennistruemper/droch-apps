import { spawnSync } from "node:child_process";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "node:net";
import { worktreeIdentity } from "./worktree.ts";

const root = process.cwd();
const identity = worktreeIdentity(root);
const directory = resolve(root, ".local/dev");
const override = resolve(directory, "compose.json");
const command = process.argv[2] ?? "up";
if (!["up", "stop", "logs"].includes(command)) throw new Error("Expected up, stop, or logs");

function docker(args: string[]) {
  const result = spawnSync(
    "docker",
    [
      "compose",
      "--project-name",
      identity.projectName,
      "--env-file",
      resolve(directory, ".env"),
      "-f",
      "compose.yaml",
      "-f",
      override,
      ...args,
    ],
    { cwd: root, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function availablePort() {
  const socket = createServer();
  await new Promise<void>((ready, reject) => {
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", ready);
  });
  const address = socket.address();
  if (!address || typeof address === "string")
    throw new Error("Could not allocate development port");
  const port = address.port;
  await new Promise<void>((closed) => socket.close(() => closed()));
  return port;
}

if (command === "up") {
  await mkdir(directory, { recursive: true });
  const port = await availablePort();
  const packages = [
    "server",
    "shared",
    ...(await readdir(resolve(root, "apps"), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => `apps/${entry.name}`),
  ];
  const volumes: Record<string, object> = { dependencies: {} };
  const mounts = [
    { type: "bind", source: root, target: "/workspace" },
    { type: "volume", source: "dependencies", target: "/workspace/node_modules" },
  ];
  for (const pkg of packages) {
    const name = `dependencies-${pkg.replaceAll("/", "-")}`;
    volumes[name] = {};
    mounts.push({ type: "volume", source: name, target: `/workspace/${pkg}/node_modules` });
  }
  const developmentService = {
    build: { target: "development" },
    working_dir: "/workspace",
    user: "0:0",
    volumes: mounts,
  };
  await writeFile(
    resolve(directory, ".env"),
    `DATA_DIRECTORY=/data\nAPP_ORIGIN=http://localhost:${port}\nSESSION_COOKIE_NAME=${identity.cookieName}\nAPP_PORT=${port}\n`,
    { mode: 0o600 },
  );
  await writeFile(
    override,
    JSON.stringify(
      {
        services: {
          application: {
            ...developmentService,
            ports: [`127.0.0.1:${port}:3000`],
            command: [
              "sh",
              "-c",
              "chown -R node:node /data /workspace/node_modules /workspace/server/node_modules /workspace/shared/node_modules /workspace/apps/*/node_modules && runuser -u node -- sh -c 'pnpm install --frozen-lockfile --store-dir /pnpm/store && pnpm dev:server'",
            ],
            environment: {
              NODE_ENV: "development",
              CHOKIDAR_USEPOLLING: "true",
              CHOKIDAR_INTERVAL: "500",
            },
          },
          migrate: {
            ...developmentService,
            command: [
              "sh",
              "-c",
              "chown -R node:node /data /workspace/node_modules /workspace/server/node_modules /workspace/shared/node_modules /workspace/apps/*/node_modules && runuser -u node -- sh -c 'pnpm install --frozen-lockfile --store-dir /pnpm/store && pnpm db:migrate'",
            ],
          },
        },
        volumes,
      },
      null,
      2,
    ),
  );
  docker(["up", "--build", "-d", "--remove-orphans", "--force-recreate", "migrate", "application"]);
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch(`http://localhost:${port}/health/ready`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // The application may still be installing dependencies or starting Vite.
    }
    await new Promise<void>((done) => setTimeout(done, 500));
  }
  if (!ready) throw new Error("Development server did not become ready; use pnpm dev:logs");
  console.log(
    `\nWorktree ${identity.projectName}: http://localhost:${port}\nUse pnpm dev:logs for logs and pnpm dev:stop to stop this worktree.`,
  );
} else {
  docker(command === "stop" ? ["down"] : ["logs", "--tail", "100", "-f", "application"]);
}
