import { Hono } from "hono";
import { applications, validateApplications, type ApplicationOptions } from "../registry/index.ts";

export type FrontendResponse = { body: Uint8Array | string; contentType: string };
export type FrontendReader = (appId: string, pathname: string) => Promise<FrontendResponse | null>;

export function createApplication(options: {
  ready: () => Promise<boolean>;
  readFrontend: FrontendReader;
  applicationOptions?: (id: string) => ApplicationOptions;
}) {
  validateApplications(applications);
  const app = new Hono();
  app.onError((error, context) => {
    console.error("Request failed", error.name);
    return context.json({ error: "Internal server error" }, 500);
  });
  app.get("/health/live", (context) => context.json({ status: "ok" }));
  app.get("/health/ready", async (context) => {
    try {
      const ready = await options.ready();
      return context.json({ status: ready ? "ready" : "not-ready" }, ready ? 200 : 503);
    } catch {
      return context.json({ status: "not-ready" }, 503);
    }
  });
  for (const application of applications) {
    app.route(
      `/api/${application.id}`,
      application.createRoutes(options.applicationOptions?.(application.id)),
    );
    app.get(`/${application.id}`, (context) => context.redirect(`/${application.id}/`, 308));
    app.get(`/${application.id}/*`, async (context) => {
      const frontend = await options.readFrontend(application.id, context.req.path);
      if (!frontend) return context.notFound();
      context.header("Content-Type", frontend.contentType);
      context.header("X-Content-Type-Options", "nosniff");
      context.header(
        "Cache-Control",
        /\/assets\//.test(context.req.path) ? "public, max-age=31536000, immutable" : "no-cache",
      );
      return new Response(
        typeof frontend.body === "string" ? frontend.body : new Uint8Array(frontend.body),
        { headers: context.res.headers },
      );
    });
  }
  app.get("/", (context) =>
    context.html(`<!doctype html>
<html lang="en" data-theme="paper"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Droch apps</title><link rel="stylesheet" href="/styles/index.css"></head>
<body><header><strong>Droch apps</strong><small>A little collection of hobby apps</small></header>
<main><h1>Pick something to play.</h1>${applications.map((application) => `<article><h2><a href="/${application.id}/">${application.title}</a></h2><p>${application.description}</p></article>`).join("")}</main></body></html>`),
  );
  app.get("/styles/*", async (context) => {
    const stylesheet = await options.readFrontend("styles", context.req.path);
    if (!stylesheet) return context.notFound();
    context.header("Content-Type", stylesheet.contentType);
    return new Response(
      typeof stylesheet.body === "string" ? stylesheet.body : new Uint8Array(stylesheet.body),
      { headers: context.res.headers },
    );
  });
  return app;
}
