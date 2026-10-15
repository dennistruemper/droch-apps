import { createServer } from "node:http";
import { getRequestListener } from "@hono/node-server";
import { createAuthService, createAuthRoutes } from "@repo/shared/auth";
import { createMailSender, createTestMailSender } from "@repo/shared/mail";
import { connectDatabase } from "@repo/shared/database";
import { createApplication } from "./http/index.ts";
import { readConfiguration, accountPolicy } from "./config/index.ts";
import { createFrontendReader } from "./frontend/index.ts";
import { applications, databaseDefinitions } from "./registry/index.ts";

const configuration = readConfiguration(process.env);
const root = process.cwd();
const cleanupHandlers = new Set<() => void>();
const databases = databaseDefinitions.map(({ id }) => ({
  id,
  connection: connectDatabase(configuration.DATA_DIRECTORY, id, { mustExist: true }),
  migrationsFolder: `${root}/migrations/${id}`,
}));
const development =
  process.env.DROCH_BUILD !== "production" && configuration.NODE_ENV === "development";
const developmentServers = new Map<string, import("vite").ViteDevServer>();
const server = createServer();

if (development) {
  const { createServer: createViteServer } = await import("vite");
  const { frontendConfig } = await import("../../tooling/frontend.ts");
  const { resolve } = await import("node:path");
  for (const application of applications) {
    const vite = await createViteServer({
      ...frontendConfig(resolve(root, "apps", application.id), application.id, root),
      appType: "custom",
      server: {
        middlewareMode: true,
        fs: { allow: [root] },
        watch: { usePolling: true, interval: 500 },
        hmr: {
          server,
          path: `/${application.id}/hmr`,
          clientPort: new URL(configuration.APP_ORIGIN).port
            ? Number(new URL(configuration.APP_ORIGIN).port)
            : 80,
        },
      },
    });
    developmentServers.set(application.id, vite);
  }
}

const readFrontend = createFrontendReader({
  root,
  development,
  ...(development
    ? {
        async transformHtml(appId: string, pathname: string, html: string) {
          const vite = developmentServers.get(appId);
          if (!vite) throw new Error("Missing development frontend");
          return vite.transformIndexHtml(pathname, html);
        },
      }
    : {}),
});
const authDatabase = databases.find((database) => database.id === "auth")!;
const policy = accountPolicy(configuration);
const auth =
  configuration.AUTH_SECRET && policy.ready
    ? createAuthService({
        db: authDatabase.connection.db,
        secret: configuration.AUTH_SECRET,
        testMode: policy.testMode,
        mailDelivery: policy.sendMail,
        send: policy.sendMail
          ? createMailSender({
              ...(configuration.MAILTRAP_TOKEN ? { token: configuration.MAILTRAP_TOKEN } : {}),
              ...(configuration.MAIL_FROM ? { from: configuration.MAIL_FROM } : {}),
              ...(configuration.MAILTRAP_SANDBOX_ID
                ? { sandboxId: configuration.MAILTRAP_SANDBOX_ID }
                : {}),
            })
          : createTestMailSender(),
      })
    : null;
const app = createApplication({
  authRoutes: createAuthRoutes({
    service: auth,
    origin: configuration.APP_ORIGIN,
    cookieName: configuration.SESSION_COOKIE_NAME,
    secure: configuration.NODE_ENV === "production",
    ready: () => authDatabase.connection.ready(authDatabase.migrationsFolder),
  }),
  ready: async () =>
    databases.every(({ connection, migrationsFolder }) => connection.ready(migrationsFolder)),
  readFrontend,
  applicationOptions: (id) => {
    const database = databases.find((entry) => entry.id === id);
    if (!database) throw new Error(`Missing database for ${id}`);
    return {
      db: database.connection.db,
      resolveUser: (token) => auth?.lookup(token) ?? null,
      ready: () => database.connection.ready(database.migrationsFolder),
      origin: configuration.APP_ORIGIN,
      cookieName: configuration.SESSION_COOKIE_NAME,
      secureCookies: configuration.NODE_ENV === "production",
      registerCleanup: (cleanup) => {
        cleanupHandlers.add(cleanup);
      },
    };
  },
});
const listener = getRequestListener(app.fetch);
server.on("request", (request, response) => {
  const originalUrl = request.url;
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  const vite = [...developmentServers].find(([id]) => pathname.startsWith(`/${id}/`))?.[1];
  if (vite)
    vite.middlewares(request, response, () => {
      request.url = originalUrl;
      void listener(request, response);
    });
  else void listener(request, response);
});
server.listen(configuration.PORT, "0.0.0.0", () => {
  console.log(`Droch apps listening on ${configuration.APP_ORIGIN}`);
});

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  for (const cleanup of cleanupHandlers) cleanup();
  const deadline = setTimeout(() => {
    server.closeAllConnections();
  }, 5000);
  deadline.unref();
  await Promise.all([...developmentServers.values()].map((vite) => vite.close()));
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  clearTimeout(deadline);
  for (const { connection } of databases) connection.close();
}
process.on("SIGTERM", () => {
  void shutdown();
});
process.on("SIGINT", () => {
  void shutdown();
});
