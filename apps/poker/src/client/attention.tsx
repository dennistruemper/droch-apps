import {
  createContext,
  createEffect,
  createSignal,
  Show,
  useContext,
  type Accessor,
  type Element,
} from "solid-js";
import { createAppStorage } from "@repo/shared/storage";
import { effects, render, type Effect } from "./attention-scenes.ts";

const AttentionContext = createContext<{
  enabled: Accessor<boolean>;
  setEnabled: (enabled: boolean) => void;
}>();
export function AttentionProvider(props: { children: Element }) {
  const storage = createAppStorage("poker", localStorage);
  const [enabled, setEnabled] = createSignal(storage.get("attention-mode") === "true");
  return (
    <AttentionContext
      value={{
        enabled,
        setEnabled: (next) => {
          storage.set("attention-mode", String(next));
          setEnabled(next);
        },
      }}
    >
      {props.children}
    </AttentionContext>
  );
}
export function AttentionSettings() {
  const attention = useContext(AttentionContext);
  return (
    <section>
      <label for="poker-attention-mode">
        <input
          id="poker-attention-mode"
          type="checkbox"
          checked={attention.enabled()}
          onChange={(event) => attention.setEnabled(event.currentTarget.checked)}
        />
        Attention mode
      </label>
    </section>
  );
}
function choosePair(previous: readonly Effect[]): readonly [Effect, Effect] {
  const available = effects.filter((effect) => !previous.includes(effect));
  const take = () => available.splice(Math.floor(Math.random() * available.length), 1)[0]!;
  return [take(), take()];
}
function AttentionScenes() {
  const [pair, setPair] = createSignal(choosePair([]));
  const canvases: HTMLCanvasElement[] = [];
  createEffect(
    () => true,
    () => {
      const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
      const visible = new Set<HTMLCanvasElement>();
      let frame = 0,
        last: number | undefined,
        elapsed = 0,
        lastDraw = -Infinity;
      function draw() {
        canvases.forEach((canvas, index) => {
          if (visible.has(canvas)) render(canvas, pair()[index]!, elapsed);
        });
      }
      function tick(now: number) {
        if (last !== undefined) elapsed += (now - last) / 1000;
        last = now;
        if (elapsed >= 60) {
          setPair(choosePair(pair()));
          elapsed = 0;
        }
        if (now - lastDraw >= 1000 / 30) {
          draw();
          lastDraw = now;
        }
        frame = requestAnimationFrame(tick);
      }
      function sync() {
        cancelAnimationFrame(frame);
        last = undefined;
        draw();
        if (!document.hidden && !reducedMotion.matches && visible.size)
          frame = requestAnimationFrame(tick);
      }
      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target as HTMLCanvasElement);
          else visible.delete(entry.target as HTMLCanvasElement);
        }
        sync();
      });
      canvases.forEach((canvas, index) => {
        render(canvas, pair()[index]!, 0);
        observer.observe(canvas);
      });
      document.addEventListener("visibilitychange", sync);
      reducedMotion.addEventListener("change", sync);
      return () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        document.removeEventListener("visibilitychange", sync);
        reducedMotion.removeEventListener("change", sync);
      };
    },
  );
  return (
    <>
      <aside
        class="attention-scene attention-scene-left"
        aria-hidden="true"
        data-attention-effect={pair()[0].id}
      >
        <canvas
          width="720"
          height="450"
          ref={(canvas) => {
            canvases[0] = canvas;
          }}
        />
        <small>{pair()[0].name}</small>
      </aside>
      <aside
        class="attention-scene attention-scene-right"
        aria-hidden="true"
        data-attention-effect={pair()[1].id}
      >
        <canvas
          width="720"
          height="450"
          ref={(canvas) => {
            canvases[1] = canvas;
          }}
        />
        <small>{pair()[1].name}</small>
      </aside>
    </>
  );
}
export function AttentionFrame(props: { children: Element }) {
  const attention = useContext(AttentionContext);
  return (
    <div class="attention-frame" data-active={attention.enabled() ? "true" : undefined}>
      <div class="attention-voting">{props.children}</div>
      <Show when={attention.enabled()}>
        <AttentionScenes />
      </Show>
    </div>
  );
}
