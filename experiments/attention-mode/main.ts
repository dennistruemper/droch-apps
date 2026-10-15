import { effects, render } from "./effects.ts";
const get = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const grid = get<HTMLDivElement>("#grid"),
  stage = get<HTMLElement>("#stage"),
  stageCanvas = get<HTMLCanvasElement>("#stage canvas");
const chosen = new Set<string>();
let paused = matchMedia("(prefers-reduced-motion: reduce)").matches,
  shuffle = false,
  current = 0,
  time = 0,
  last = performance.now(),
  lastSwap = 0;
const canvases: HTMLCanvasElement[] = [];
const visible = new Set<HTMLCanvasElement>();
const observer = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) visible.add(e.target as HTMLCanvasElement);
    else visible.delete(e.target as HTMLCanvasElement);
  }
});
function show(index: number) {
  current = index;
  stage.hidden = false;
  get("#stage h2").textContent = `${String(index + 1).padStart(2, "0")} · ${effects[index]!.name}`;
  get("#stage p").textContent = effects[index]!.description;
  stageCanvas.setAttribute("aria-label", effects[index]!.description);
  render(stageCanvas, effects[index]!, time);
}
effects.forEach((effect, index) => {
  const article = document.createElement("article");
  article.innerHTML = `<canvas width="720" height="450" role="img" aria-label="${effect.description}"></canvas><div class="meta"><h2><span class="number">${String(index + 1).padStart(2, "0")}</span>${effect.name}</h2><div class="actions"><button type="button" class="view">Ansehen</button><button type="button" class="favorite" aria-pressed="false">Merken</button></div></div><p>${effect.description}</p>`;
  const canvas = article.querySelector("canvas")!;
  canvases.push(canvas);
  render(canvas, effect, 0);
  observer.observe(canvas);
  article.querySelector(".view")!.addEventListener("click", () => {
    show(index);
    stage.scrollIntoView({ behavior: paused ? "instant" : "smooth", block: "start" });
  });
  const favorite = article.querySelector<HTMLButtonElement>(".favorite")!;
  favorite.addEventListener("click", () => {
    if (chosen.has(effect.id)) chosen.delete(effect.id);
    else chosen.add(effect.id);
    favorite.setAttribute("aria-pressed", String(chosen.has(effect.id)));
    favorite.textContent = chosen.has(effect.id) ? "Gemerkt ✓" : "Merken";
    get("#selection").textContent = chosen.size
      ? `Deine Auswahl: ${effects.flatMap((e, i) => (chosen.has(e.id) ? [`${String(i + 1).padStart(2, "0")} ${e.name}`] : [])).join(" · ")}`
      : "Favoriten markieren und anschließend im Chat die Nummern nennen.";
  });
  grid.append(article);
});
const pause = get<HTMLButtonElement>("#pause");
function updatePause() {
  pause.setAttribute("aria-pressed", String(paused));
  pause.textContent = paused ? "Abspielen" : "Pausieren";
}
updatePause();
pause.addEventListener("click", () => {
  paused = !paused;
  updatePause();
});
get("#shuffle").addEventListener("click", () => {
  shuffle = !shuffle;
  lastSwap = time;
  get("#shuffle").setAttribute("aria-pressed", String(shuffle));
  get("#shuffle").textContent = shuffle ? "Zufallswechsel läuft" : "Zufallswechsel testen";
  if (shuffle) {
    show(current);
    stage.scrollIntoView({ behavior: paused ? "instant" : "smooth" });
  }
});
get("#overview").addEventListener("click", () => {
  shuffle = false;
  get("#shuffle").setAttribute("aria-pressed", "false");
  get("#shuffle").textContent = "Zufallswechsel testen";
  stage.hidden = true;
  grid.scrollIntoView({ behavior: paused ? "instant" : "smooth" });
});
function tick(now: number) {
  if (!paused && !document.hidden) {
    time += Math.min((now - last) / 1000, 0.1);
    if (shuffle && time - lastSwap >= Number(get<HTMLSelectElement>("#interval").value)) {
      const pool = effects
        .map((e, i) => ({ e, i }))
        .filter(({ e, i }) => i !== current && (!chosen.size || chosen.has(e.id)));
      if (pool.length) show(pool[Math.floor(Math.random() * pool.length)]!.i);
      lastSwap = time;
    }
    for (const [i, canvas] of canvases.entries())
      if (visible.has(canvas)) render(canvas, effects[i]!, time);
    if (!stage.hidden) render(stageCanvas, effects[current]!, time);
  }
  last = now;
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
const requested = new URLSearchParams(location.search).get("effect");
if (requested) {
  const i = effects.findIndex((e) => e.id === requested);
  if (i >= 0) {
    show(i);
    document.body.classList.add("recording");
  }
}
// Explicit inspection/capture hook; rendering accepts time, with no network or simulation dependencies.
Object.assign(window, {
  attentionLab: {
    effects: effects.map(({ id, name }) => ({ id, name })),
    show,
    draw: (index: number, t: number) => {
      paused = true;
      show(index);
      render(stageCanvas, effects[index]!, t);
    },
    canvas: stageCanvas,
  },
});
