import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import type { FrontendReader } from "../http/index.ts";

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

export function createFrontendReader(options: {
  root: string;
  development?: boolean;
  transformHtml?: (appId: string, pathname: string, html: string) => Promise<string>;
}): FrontendReader {
  return async (appId, pathname) => {
    let relativePath: string;
    try {
      relativePath = decodeURIComponent(pathname.slice(`/${appId}/`.length));
    } catch {
      return null;
    }
    if (
      relativePath.includes("\\") ||
      relativePath.includes("\0") ||
      relativePath.split("/").includes("..")
    )
      return null;
    const directory =
      appId === "styles"
        ? resolve(options.root, options.development ? "shared/src/styles" : "dist/styles")
        : resolve(options.root, options.development ? "apps" : "dist/client", appId);
    const filename = resolve(directory, relativePath || "index.html");
    if (!filename.startsWith(directory + sep)) return null;
    try {
      if ((await stat(filename)).isFile()) {
        const body = await readFile(filename);
        if (extname(filename) === ".html" && options.transformHtml) {
          return {
            body: await options.transformHtml(appId, pathname, body.toString("utf8")),
            contentType: contentTypes[".html"]!,
          };
        }
        return { body, contentType: contentTypes[extname(filename)] ?? "application/octet-stream" };
      }
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    // Only navigation-like paths use SPA fallback; missing assets stay missing.
    if (
      appId === "styles" ||
      relativePath.startsWith("assets/") ||
      relativePath.split("/").some((part) => part.includes("."))
    )
      return null;
    let html = await readFile(resolve(directory, "index.html"), "utf8");
    if (options.transformHtml) html = await options.transformHtml(appId, pathname, html);
    return { body: html, contentType: "text/html; charset=utf-8" };
  };
}
