import { chromium } from "@playwright/test";
import { createServer, build } from "vite";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve("experiments/attention-mode");
const output = resolve(process.argv[2] ?? ".local/attention-mode-preview");
await mkdir(output, { recursive: true });
await build({ root, configFile: false, build: { outDir: output, emptyOutDir: false } });
const server = await createServer({
  root: output,
  configFile: false,
  server: { host: "127.0.0.1", port: 0 },
});
await server.listen();
const origin = server.resolvedUrls!.local[0]!;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors: string[] = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin);
  await page.waitForSelector("article canvas");
  const catalog = await page.evaluate(
    () =>
      (window as unknown as { attentionLab: { effects: { id: string; name: string }[] } })
        .attentionLab.effects,
  );
  await page.screenshot({ path: resolve(output, "overview.png"), fullPage: true });
  await page.getByRole("button", { name: "Merken", exact: true }).nth(0).click();
  await page.getByRole("button", { name: "Merken", exact: true }).nth(2).click();
  if (!(await page.locator("#selection").innerText()).includes("Murmel-Meditation"))
    throw new Error("Selection did not update");
  await page.getByRole("button", { name: "Zufallswechsel testen" }).click();
  const first = await page.locator("#stage h2").innerText();
  await page.waitForTimeout(13200);
  const next = await page.locator("#stage h2").innerText();
  if (first === next) throw new Error("Shuffle did not change effect");
  if (!/Murmel-Meditation|Tiny Parkour/.test(next))
    throw new Error("Shuffle left selected effects");
  await page.getByRole("button", { name: "Alle Effekte", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
    throw new Error("Mobile overflow");
  await page.screenshot({ path: resolve(output, "mobile.png"), fullPage: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  if ((await page.locator("#pause").textContent()) !== "Abspielen")
    throw new Error("Reduced motion not respected");
  const recordings: { id: string; name: string; file: string }[] = [];
  // Three concurrent recordings keep the renderer responsive; capture is silent and local.
  for (let start = 0; start < catalog.length; start += 3) {
    await Promise.all(
      catalog.slice(start, start + 3).map(async (effect) => {
        const p = await browser.newPage({ viewport: { width: 720, height: 450 } });
        p.on("pageerror", (e) => errors.push(e.message));
        const requests: string[] = [];
        p.on("request", (r) => {
          if (!r.url().startsWith(origin) && !r.url().startsWith("data:")) requests.push(r.url());
        });
        await p.goto(`${origin}?effect=${effect.id}`);
        await p.waitForSelector("body.recording");
        const clip = await p.evaluate(async () => {
          const canvas = document.querySelector<HTMLCanvasElement>("#stage canvas")!;
          const mime = ["video/mp4;codecs=avc1.42001f", "video/webm;codecs=vp9", "video/webm"].find(
            (m) => MediaRecorder.isTypeSupported(m),
          )!;
          const stream = canvas.captureStream(30),
            recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 3_000_000 });
          const chunks: Blob[] = [];
          recorder.ondataavailable = (e) => chunks.push(e.data);
          const complete = new Promise<string>((resolve) => {
            recorder.onstop = () => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result).split(",")[1]!);
              reader.readAsDataURL(new Blob(chunks, { type: mime }));
            };
          });
          recorder.start();
          await new Promise((resolve) => setTimeout(resolve, 12000));
          recorder.stop();
          const data = await complete;
          stream.getTracks().forEach((track) => track.stop());
          return { data, extension: mime.startsWith("video/mp4") ? "mp4" : "webm" };
        });
        const file = `${String(catalog.indexOf(effect) + 1).padStart(2, "0")}-${effect.id}.${clip.extension}`;
        await writeFile(resolve(output, file), Buffer.from(clip.data, "base64"));
        await p.screenshot({ path: resolve(output, `${effect.id}.png`) });
        if (requests.length) throw new Error(`External requests: ${requests.join(", ")}`);
        recordings.push({ ...effect, file });
        console.log(`Recorded ${file}`);
        await p.close();
      }),
    );
  }
  recordings.sort((a, b) => a.file.localeCompare(b.file));
  await writeFile(
    resolve(output, "videos.html"),
    `<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Attention mode · 10 Clips</title><style>body{background:#0d1019;color:#edf0f7;font:16px system-ui;margin:0;padding:32px}main{max-width:1200px;margin:auto}h1{font-size:40px;letter-spacing:-.04em}p{color:#abb4c8}section{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:30px 24px}video{width:100%;border-radius:12px}h2{font-size:19px}a{color:#a4edd4}@media(max-width:650px){section{grid-template-columns:1fr}body{padding:18px}}</style><main><h1>Attention mode.</h1><p>Zehn lokale Effekte · je 12 Sekunden · ohne Ton.</p><p><a href="index.html">Interaktive Vorschau mit Favoriten und Zufallswechsel öffnen →</a></p><section>${recordings.map((r, i) => `<article><h2>${String(i + 1).padStart(2, "0")} · ${r.name}</h2><video controls loop muted playsinline preload="metadata" poster="${r.id}.png" src="${r.file}"></video></article>`).join("")}</section></main></html>`,
  );
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    JSON.stringify({
      output,
      checks: [
        "10 effects recorded",
        "no external requests",
        "favorite selection",
        "shuffle within selection without immediate repeat",
        "mobile no overflow",
        "reduced motion starts paused",
        "no browser errors",
      ],
    }),
  );
} finally {
  await browser.close();
  await server.close();
}
