# Attention mode: isolated motion experiment

Ten procedural Canvas 2D effects for choosing future poker attention-mode content.
No runtime dependencies, remote assets, video embeds, audio, APIs, app registration,
or production poker changes. The page uses existing Vite tooling and TypeScript.

From the checkout root, using the pinned mise environment:

```sh
mise exec -- pnpm exec vite experiments/attention-mode --host 127.0.0.1 --port 0
```

Open the printed URL. Mark favorites, inspect effects individually, and try random
rotation after 12, 20, or 30 seconds. Rotation uses the chosen effects (all effects
if none are selected) and avoids immediate repetition when multiple are available.
Choices are transient. A single favorite stays on screen. Reduced-motion preference
starts paused; the user can explicitly play. Hidden tabs pause the timeline;
offscreen gallery canvases skip drawing. Canvas dimensions remain fixed while CSS
scales the scene to fit desktop and mobile layouts.

`effects.ts` exposes the catalog and a time-driven renderer. There is no animation
loop or other effect on module import; `main.ts` explicitly owns the preview loop.
Scenes are stylized visual illusions rather than physical simulations.

## Checks and recordings

```sh
mise exec -- pnpm exec tsc --project experiments/attention-mode/tsconfig.json
mise exec -- pnpm exec oxlint --threads=1 --deny-warnings experiments/attention-mode
mise exec -- pnpm exec oxfmt --check experiments/attention-mode
mise exec -- node --import tsx experiments/attention-mode/capture.ts
```

Capture requires locally installed Google Chrome. It uses an allocated loopback port,
checks favorites, selection-restricted rotation, mobile overflow, reduced motion,
browser exceptions, and external requests, then records twelve silent seconds per
effect. MP4 is preferred when supported; otherwise it writes WebM. The generated
build, clips, screenshots, and `videos.html` go to ignored
`.local/attention-mode-preview/`. Pass an absolute output directory as the first
argument to write elsewhere. No dependencies or browsers are downloaded. Preview
that directory with Vite to inspect the gallery and recordings together.

The original ten-effect experiment is preserved as a reference. Poker now includes
nine selected scenes (all except the olive machine) in its client, with an optional
Settings toggle and random pair rotation after 60 visible seconds. The prototype
controls remain independent; its short capture duration does not limit animation
runtime. Future scene changes belong in the poker client.
