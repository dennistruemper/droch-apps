import { resolve } from "node:path";
import { mkdir, rm } from "node:fs/promises";

export default async function setup() {
  await prepareBrowserCoverage(process.cwd());
}

export async function prepareBrowserCoverage(root: string) {
  await rm(resolve(root, "coverage/browser"), { recursive: true, force: true });
  await rm(resolve(root, ".local/browser-coverage"), { recursive: true, force: true });
  await mkdir(resolve(root, ".local/browser-coverage"), { recursive: true });
}
