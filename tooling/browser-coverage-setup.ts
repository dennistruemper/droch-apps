import { mkdir, rm } from "node:fs/promises";

export default async function setup() {
  await rm("coverage/browser", { recursive: true, force: true });
  await rm(".local/browser-coverage", { recursive: true, force: true });
  await mkdir(".local/browser-coverage", { recursive: true });
}
