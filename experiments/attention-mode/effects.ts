export type Effect = {
  id: string;
  name: string;
  description: string;
  draw: (c: CanvasRenderingContext2D, t: number) => void;
};
const W = 720,
  H = 450,
  tau = Math.PI * 2;
const colors = ["#ffbe63", "#f27ca5", "#83e4ce", "#a89bff", "#6cc9ff"];
const col = (i: number) => colors[((i % colors.length) + colors.length) % colors.length]!;
const fract = (x: number) => x - Math.floor(x);
const ease = (x: number) => x * x * (3 - 2 * x);
function ball(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  const g = c.createRadialGradient(x - r * 0.32, y - r * 0.4, r * 0.05, x, y, r);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.23, color);
  g.addColorStop(1, color + "55");
  c.fillStyle = g;
  c.shadowColor = color;
  c.shadowBlur = 16;
  c.beginPath();
  c.arc(x, y, r, 0, tau);
  c.fill();
  c.shadowBlur = 0;
}
function line(c: CanvasRenderingContext2D, points: number[][], color: string, width = 2) {
  c.strokeStyle = color;
  c.lineWidth = width;
  c.lineCap = "round";
  c.lineJoin = "round";
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x!, y!) : c.moveTo(x!, y!)));
  c.stroke();
}
function rect(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  r = 6,
) {
  c.fillStyle = color;
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fill();
}
function base(c: CanvasRenderingContext2D, a = "#151a32", b = "#080d1a") {
  const g = c.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  c.fillStyle = "#ffffff08";
  for (let y = 20; y < H; y += 30)
    for (let x = 20; x < W; x += 30) {
      c.beginPath();
      c.arc(x, y, 1, 0, tau);
      c.fill();
    }
}
function label(c: CanvasRenderingContext2D, text: string, x: number, y: number, color = "#b7c2d9") {
  c.fillStyle = color;
  c.font = "12px monospace";
  c.fillText(text, x, y);
}
export const effects: Effect[] = [
  {
    id: "marbles",
    name: "Murmel-Meditation",
    description: "Leuchtende Murmeln auf einer endlosen Wellenbahn.",
    draw(c, t) {
      base(c);
      for (let lane = 0; lane < 3; lane++) {
        const path = (x: number) => 95 + lane * 126 + Math.sin(x / 91 + lane) * 32;
        const points = Array.from({ length: 145 }, (_, i) => [i * 5, path(i * 5)]);
        line(c, points, "#00000066", 22);
        line(c, points, "#53617c", 12);
        line(
          c,
          points.map(([x, y]) => [x!, y! - 5]),
          "#9aaccb",
          2,
        );
        for (let i = 0; i < 7; i++) {
          const x = fract(t * 0.105 + i / 7 + lane * 0.1) * 810 - 45;
          ball(c, x, path(x) - 17, 15, col(i + lane));
        }
      }
      label(c, "GRAVITY IS A SUGGESTION", 24, 426);
    },
  },
  {
    id: "plinko",
    name: "Plinko-Konfetti",
    description: "Ein permanenter Kugelregen zwischen goldenen Pins.",
    draw(c, t) {
      base(c, "#231b32", "#100f21");
      for (let row = 0; row < 8; row++)
        for (let j = 0; j < 12; j++) {
          const x = 52 + j * 56 + (row % 2) * 28,
            y = 67 + row * 42;
          ball(c, x, y, 3.5, "#e4b978");
        }
      for (let i = 0; i < 45; i++) {
        const age = fract(t * 0.19 + i * 0.618),
          step = age * 9,
          row = Math.floor(step),
          f = fract(step);
        const seed = i * 12.9898;
        const zig = (n: number) => Math.sin(seed + n * 2.3) * Math.min(n, 5) * 19;
        const x = 360 + Math.sin(seed) * 180 + zig(row) + (zig(row + 1) - zig(row)) * ease(f);
        ball(c, x, 18 + age * 378 - Math.sin(f * Math.PI) * 9, 7, col(i));
      }
      for (let i = 0; i < 11; i++) {
        rect(c, 44 + i * 58, 405, 48, 22, col(i) + "40");
        rect(c, 44 + i * 58, 427, 48, 3, col(i));
      }
    },
  },
  {
    id: "stack",
    name: "Perfect Stack",
    description: "Pastellblöcke landen auf den Millimeter genau.",
    draw(c, t) {
      base(c, "#1c2539", "#0b1526");
      const cycle = fract((t + 3) / 12) * 16,
        count = Math.floor(cycle),
        phase = fract(cycle);
      const bottom = 395 + Math.max(0, count - 11) * 22;
      c.save();
      c.translate(360, bottom);
      for (let i = 0; i < count; i++) {
        const y = -i * 25;
        rect(c, -108, y, 216, 20, col(i));
        rect(c, -108, y + 14, 216, 6, "#00000022", 3);
      }
      const x = (count % 2 ? 1 : -1) * (1 - ease(Math.min(phase / 0.8, 1))) * 470;
      rect(c, x - 108, -count * 25, 216, 20, col(count));
      if (phase > 0.78) {
        c.strokeStyle = "#ffffff";
        c.globalAlpha = (1 - phase) * 4;
        c.lineWidth = 2;
        c.strokeRect(-114, -count * 25 - 6, 228, 32);
        c.globalAlpha = 1;
      }
      c.restore();
      label(c, `${String(count + 1).padStart(2, "0")} / PERFECT`, 28, 40);
      label(c, "JUST ONE MORE BLOCK", 28, 426);
    },
  },
  {
    id: "parkour",
    name: "Tiny Parkour",
    description: "Ein kleiner Würfel springt durch eine bonbonfarbene Welt.",
    draw(c, t) {
      base(c, "#292851", "#132339");
      for (let layer = 0; layer < 3; layer++)
        for (let i = 0; i < 12; i++) {
          const x = fract(i * 0.137 - t * 0.008 * (layer + 1)) * 900 - 90;
          rect(c, x, 180 - layer * 42, 55, 230, "#9c91dd" + ["12", "18", "20"][layer], 14);
        }
      const spacing = 160,
        speed = 125,
        phase = fract((t * speed) / spacing),
        jump = Math.sin(phase * Math.PI);
      for (let i = -1; i < 7; i++) {
        const x = i * spacing - phase * spacing;
        rect(c, x, 335, 110, 100, "#253d56");
        rect(c, x, 330, 110, 10, col(i + 2));
        for (let j = 0; j < 3; j++) ball(c, x + 32 + j * 23, 270, 3, "#ffda88");
      }
      for (let i = 6; i >= 1; i--)
        rect(
          c,
          210 - i * 15,
          298 - jump * 105 + i * 4,
          17,
          17,
          "#83e4ce" +
            Math.floor((1 - i / 8) * 90)
              .toString(16)
              .padStart(2, "0"),
        );
      c.save();
      c.translate(230, 308 - jump * 116);
      c.rotate(-phase * tau);
      rect(c, -19, -19, 38, 38, "#8ef0d0", 9);
      rect(c, -9, -7, 5, 6, "#173645", 2);
      rect(c, 5, -7, 5, 6, "#173645", 2);
      c.restore();
      label(c, "NO THOUGHTS. ONLY JUMPS.", 24, 40);
    },
  },
  {
    id: "sand",
    name: "Sand Symphony",
    description: "Farbige Sandströme zeichnen langsam eine Landschaft.",
    draw(c, t) {
      base(c, "#231c32", "#100f20");
      c.save();
      c.beginPath();
      c.roundRect(84, 38, 552, 375, 18);
      c.clip();
      for (let layer = 15; layer >= 0; layer--) {
        c.fillStyle = col(layer);
        c.beginPath();
        c.moveTo(84, 420);
        for (let x = 84; x <= 636; x += 4) {
          const y =
            405 -
            layer * 15 +
            Math.sin(x / 80 + layer * 0.44 + t * 0.16) * 16 +
            Math.sin(x / 31 + layer * 0.2) * 4;
          c.lineTo(x, y);
        }
        c.lineTo(636, 420);
        c.closePath();
        c.fill();
      }
      for (let s = 0; s < 3; s++) {
        const x = 180 + s * 180 + Math.sin(t * 0.45 + s * 2) * 65;
        for (let i = 0; i < 100; i++) {
          const p = fract(i * 0.618 + t * 0.85);
          const y = 35 + p * 175;
          rect(
            c,
            x + Math.sin(i * 21) * 3 + p * Math.sin(i) * 8,
            y,
            2,
            3,
            col(s + Math.floor(t / 5)),
          );
        }
        rect(c, x - 22, 30, 44, 8, "#c4cadb");
      }
      c.restore();
      c.strokeStyle = "#ffffff25";
      c.lineWidth = 2;
      c.beginPath();
      c.roundRect(84, 38, 552, 375, 18);
      c.stroke();
    },
  },
  {
    id: "machine",
    name: "Oliven-Industrie",
    description: "Eine aufwendige Maschine transportiert genau eine Olive.",
    draw(c, t) {
      base(c, "#192e32", "#0d1b24");
      for (const [x, y, r, dir] of [
        [160, 170, 72, 1],
        [292, 170, 55, -1],
        [390, 155, 36, 1],
      ] as const) {
        c.save();
        c.translate(x, y);
        c.rotate(t * dir * 0.8);
        for (let i = 0; i < 14; i++) {
          c.save();
          c.rotate((i * tau) / 14);
          rect(c, r - 5, -8, 19, 16, "#88a8a5", 3);
          c.restore();
        }
        c.strokeStyle = "#88a8a5";
        c.lineWidth = 15;
        c.beginPath();
        c.arc(0, 0, r - 8, 0, tau);
        c.stroke();
        for (let i = 0; i < 3; i++) {
          c.save();
          c.rotate((i * tau) / 3);
          line(
            c,
            [
              [0, 0],
              [r - 10, 0],
            ],
            "#88a8a5",
            9,
          );
          c.restore();
        }
        ball(c, 0, 0, 12, "#ffbe63");
        c.restore();
      }
      rect(c, 60, 315, 600, 55, "#304748", 27);
      for (let i = 0; i < 22; i++) {
        const x = 70 + fract(i / 22 + t * 0.12) * 575;
        line(
          c,
          [
            [x, 326],
            [x - 14, 355],
          ],
          "#83e4ce55",
          3,
        );
      }
      const x = 95 + fract(t / 7) * 530;
      c.save();
      c.translate(x, 302);
      c.rotate(t * 2);
      ball(c, 0, 0, 19, "#b3ce70");
      ball(c, 3, -6, 5, "#e28564");
      c.restore();
      line(
        c,
        [
          [570, 105],
          [570, 230],
          [620, 230],
        ],
        "#e2bd81",
        10,
      );
      const py = 142 + Math.sin(t * 2) * 35;
      rect(c, 548, py, 44, 20, "#e2bd81");
      label(c, "OLIVE PROCESSING FACILITY", 26, 40);
      label(c, "THROUGHPUT: 1 OLIVE / ETERNITY", 26, 418);
    },
  },
  {
    id: "dvd",
    name: "Corner Satisfaction",
    description: "Ein schwebendes Logo trifft endlich die perfekte Ecke.",
    draw(c, t) {
      base(c, "#191831", "#090e20");
      const bw = 112,
        bh = 66,
        period = 4.5,
        leg = Math.floor(t / period),
        p = fract(t / period),
        k = leg % 4;
      const from = [
          [0, 0],
          [W - bw, H - bh],
          [0, H - bh],
          [W - bw, 0],
        ][k]!,
        to = [
          [W - bw, H - bh],
          [0, H - bh],
          [W - bw, 0],
          [0, 0],
        ][k]!;
      const x = from[0]! + (to[0]! - from[0]!) * p,
        y = from[1]! + (to[1]! - from[1]!) * p;
      const hit = fract(t / period);
      if (hit < 0.24 && leg > 0) {
        const cx = from[0]! + bw / 2,
          cy = from[1]! + bh / 2;
        for (let i = 0; i < 35; i++) {
          const a = i * 2.4;
          rect(
            c,
            cx + Math.cos(a) * hit * 640,
            cy + Math.sin(a) * hit * 640 + hit * hit * 400,
            5,
            8,
            col(i),
          );
        }
      }
      c.shadowColor = col(leg);
      c.shadowBlur = 25;
      rect(c, x, y, bw, bh, col(leg), 16);
      c.shadowBlur = 0;
      c.fillStyle = "#101327";
      c.font = "bold 23px monospace";
      c.fillText("FOCUS", x + 20, y + 40);
      label(c, "THE NEXT CORNER WILL FIX EVERYTHING", 210, 230, "#a9aec955");
    },
  },
  {
    id: "jellyfish",
    name: "Cosmic Aquarium",
    description: "Biolumineszente Quallen schweben durch einen stillen Kosmos.",
    draw(c, t) {
      base(c, "#101e39", "#080c23");
      for (let i = 0; i < 65; i++) {
        const x = fract(Math.sin(i * 7) * 0.5 + 0.5 + t * 0.004) * W,
          y = fract(i * 0.618 - t * 0.012) * H;
        ball(c, x, y, i % 3 === 0 ? 1.5 : 0.7, "#8db6de");
      }
      for (let i = 0; i < 7; i++) {
        const x = 85 + i * 91 + Math.sin(t * 0.5 + i * 2) * 24,
          y = 110 + Math.sin(i * 3) * 70 + Math.sin(t * 0.65 + i) * 28 + (i % 2) * 100,
          r = 23 + (i % 3) * 7,
          pulse = 1 + Math.sin(t * 2 + i) * 0.09;
        c.save();
        c.translate(x, y);
        c.scale(pulse, pulse);
        c.shadowBlur = 22;
        c.shadowColor = col(i);
        c.fillStyle = col(i) + "70";
        c.beginPath();
        c.ellipse(0, 0, r, r * 0.72, 0, Math.PI, 0);
        c.bezierCurveTo(r * 0.6, 13, -r * 0.6, 13, -r, 0);
        c.fill();
        c.shadowBlur = 0;
        for (let j = 0; j < 7; j++) {
          const pts = Array.from({ length: 35 }, (_, n) => [
            ((j - 3) * r) / 4 + Math.sin(n * 0.17 - t * 2 + i + j) * n * 0.23,
            n * 2.3 + 5,
          ]);
          line(c, pts, col(i) + (j % 2 ? "65" : "aa"), 1.4);
        }
        line(
          c,
          Array.from({ length: 30 }, (_, n) => {
            const a = Math.PI + (n / 29) * Math.PI;
            return [Math.cos(a) * r, Math.sin(a) * r * 0.72];
          }),
          col(i),
          1.5,
        );
        c.restore();
      }
    },
  },
  {
    id: "tunnel",
    name: "Neon Drift",
    description: "Eine endlose Fahrt durch einen fließenden Neon-Tunnel.",
    draw(c, t) {
      base(c, "#170f2d", "#080c20");
      const cx = 360 + Math.sin(t * 0.35) * 75,
        cy = 225 + Math.cos(t * 0.4) * 35;
      for (let i = 30; i >= 0; i--) {
        const z = fract(i / 31 - t * 0.12),
          s = 18 / (z + 0.055);
        if (s > 700) continue;
        const x = cx + Math.sin(z * 5 + t * 0.5) * z * 65,
          y = cy + Math.cos(z * 4 + t * 0.4) * z * 40;
        c.strokeStyle =
          col(i % 5) +
          Math.floor((1 - z) * 180 + 30)
            .toString(16)
            .padStart(2, "0");
        c.lineWidth = 1 + (1 - z) * 2;
        c.beginPath();
        for (let j = 0; j < 6; j++) {
          const a = (j * tau) / 6 + t * 0.08;
          const px = x + Math.cos(a) * s * 1.5,
            py = y + Math.sin(a) * s;
          if (j) c.lineTo(px, py);
          else c.moveTo(px, py);
        }
        c.closePath();
        c.stroke();
      }
      ball(c, cx, cy, 5, "#e5c7ff");
    },
  },
  {
    id: "zipper",
    name: "Zip Therapy",
    description: "Zwei Reihen weicher Zähne verschmelzen zu einem Reißverschluss.",
    draw(c, t) {
      base(c, "#2b2036", "#141329");
      const join = 235 + Math.sin(t * 0.65) * 70;
      for (let i = -2; i < 23; i++) {
        const y = i * 25 + fract(t * 0.9) * 25,
          spread = Math.max(0, join - y) * 0.55;
        for (const side of [-1, 1]) {
          const yy = y + (side === 1 ? 12.5 : 0),
            x = 360 + side * (spread + 8);
          rect(c, x - (side === 1 ? 0 : 46), yy, 46, 17, side === 1 ? "#f5b6cd" : "#b4a8f5", 7);
          rect(c, x + (side === 1 ? 4 : -42), yy + 3, 32, 3, "#ffffff45", 2);
        }
      }
      c.save();
      c.translate(360, join);
      rect(c, -31, -30, 62, 74, "#dce1ee", 16);
      rect(c, -21, -23, 42, 52, "#838da8", 11);
      rect(c, -11, -12, 22, 93, "#e1e6f5", 10);
      rect(c, -5, 43, 10, 23, "#343d59", 5);
      c.restore();
      label(c, "EVERYTHING IS COMING TOGETHER", 24, 425);
    },
  },
];
export function render(canvas: HTMLCanvasElement, effect: Effect, t: number) {
  const c = canvas.getContext("2d");
  if (!c) return;
  c.save();
  c.scale(canvas.width / W, canvas.height / H);
  effect.draw(c, t);
  c.restore();
}
