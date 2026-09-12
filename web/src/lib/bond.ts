// Bond-type logo engine: "tammy" in a pixel face on red, unfolding into a
// molecule with stair-stepped square-pixel bonds, re-scattering, refolding.
// One global ease, bonds computed per-frame from letter positions.

export const TICKS = 61;
export const FPS = 32;

export const EASE_MOVE = [
  0, 0.014, 0.044, 0.193, 0.317, 0.545, 0.621, 0.735, 0.777, 0.838, 0.868,
  0.908, 0.924, 0.95, 0.962, 0.979, 0.985, 0.994, 0.996, 1,
];

export const EASE_RETURN = [
  0.0, 0.0115, 0.023, 0.0475, 0.072, 0.1835, 0.295, 0.3645,
  0.434, 0.534, 0.634, 0.667, 0.7, 0.7495, 0.799, 0.8175,
  0.836, 0.862, 0.888, 0.8995, 0.911, 0.9275, 0.944, 0.949,
  0.954, 0.9685, 0.983, 0.985, 0.987, 0.9915, 0.996, 0.998,
  1.0,
];

export const MOVE2_AT = 20;
export const MOVE3_AT = 40;

export const RED = "#d93a2b";
export const WHITE = "#fdfefd";

export const CAP_H = 64 / 304;
export const FONT_WEIGHT = 400;
export const BASELINE_1 = 168 / 304;

export const JITTER_CELLS = 1;
export const JITTER_S = 5.2;
export const JITTER_GATE = 0.975;
export const JITTER_EASE_TICKS = 6;
export const BOND_CELL_SCALE = 0.5;
export const CAP_PIXELS = 9;
export const BOND_AIR_CELLS = 2;
export const BOND_MIN_CELLS = 1;
export const BOND_WEIGHT_CELLS = 2;
export const BOND_BOW_CELLS = 1;
export const BOND_BOW_S = 7;
export const BOND_ON_TICK = 3;
export const BOND_OFF_BEFORE_HOME = 2;

export const LINES = ["tammy"] as const;

export interface Pose {
  gaps: number[][];
  shift: number[];
  dy: number[][];
}

const S = (v: number) => v / 304;

// Scatter poses for a 5-letter line: 4 gaps + 5 dy values each.
// Contours vary per pose (arc, vee, rake, wave, two-step).
export const POSES: Pose[] = [
  { gaps: [[56, 58, 65, 71].map(S)], shift: [4.5].map(S), dy: [[-30, -13, -6, -13, -30].map(S)] },
  { gaps: [[68, 66, 65, 78].map(S)], shift: [-3.8].map(S), dy: [[-6, -30, -54, -30, -6].map(S)] },
  { gaps: [[61, 61, 69, 68].map(S)], shift: [-13.1].map(S), dy: [[-54, -42, -30, -18, -6].map(S)] },
  { gaps: [[75, 70, 61, 74].map(S)], shift: [-4.6].map(S), dy: [[-27, -6, -33, -54, -27].map(S)] },
  { gaps: [[70, 74, 77, 78].map(S)], shift: [4.9].map(S), dy: [[-54, -54, -54, -6, -6].map(S)] },
  { gaps: [[60, 76, 69, 71].map(S)], shift: [-1.3].map(S), dy: [[-30, -13, -6, -13, -30].map(S)] },
];

export const SCATTERS_MIN = 2;
export const SCATTERS_MAX = 4;
export const MOVE_TICKS = 20;
export const RETURN_TICKS = 17;
export const HOLD_TICKS = 8;
export const ARRIVE_SPREAD = 0.08;

interface Letter {
  ch: string;
  x: number;
  y: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  px: number[];
  py: number[];
}

function edgeDist(hw: number, hh: number, ux: number, uy: number): number {
  const tx = ux !== 0 ? hw / Math.abs(ux) : Infinity;
  const ty = uy !== 0 ? hh / Math.abs(uy) : Infinity;
  return Math.min(tx, ty);
}

function sample(table: number[], t: number): number {
  if (t <= 0) return table[0];
  const i = Math.floor(t);
  if (i >= table.length - 1) return table[table.length - 1];
  return table[i] + (table[i + 1] - table[i]) * (t - i);
}

export class BondType {
  private ctx: CanvasRenderingContext2D | null;
  private raf = 0;
  private t0 = 0;
  private mounted = 0;
  private running = false;
  private dpr = 1;
  private lastTick = -1;
  private letters: Letter[] = [];
  private pairs: [number, number][] = [];
  private seq: number[] = [];
  private cycleTicks = 0;
  private font = "";
  private cell = 1;
  private clock = 0;
  readonly ok: boolean;

  constructor(
    private canvas: HTMLCanvasElement,
    private family: string = "sans-serif",
  ) {
    this.ctx = canvas.getContext("2d");
    this.ok = !!this.ctx;
    if (this.ok) this.resize();
  }

  resize() {
    const c = this.canvas;
    const r = c.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(r.width * this.dpr);
    c.height = Math.round(r.height * this.dpr);
    this.layout();
    this.lastTick = -1;
    if (!this.running) this.renderStill();
  }

  setFont(family: string) {
    this.family = family;
    this.layout();
    if (this.running) {
      if (this.lastTick >= 0) this.render(this.lastTick);
    } else {
      this.renderStill();
    }
  }

  private layout() {
    const ctx = this.ctx;
    if (!ctx) return;
    const H = this.canvas.height;
    const W = this.canvas.width;

    ctx.font = `${FONT_WEIGHT} 100px ${this.family}`;
    const probe = ctx.measureText("H");
    const capAt100 = probe.actualBoundingBoxAscent || 72;
    const size = (CAP_H * H * 100) / capAt100;
    this.font = `${FONT_WEIGHT} ${size}px ${this.family}`;
    ctx.font = this.font;
    this.cell = this.measureCell(size, CAP_H * H) * BOND_CELL_SCALE;

    this.letters = [];
    this.pairs = [];

    LINES.forEach((word, li) => {
      const baseline = BASELINE_1 * H;
      const total = ctx.measureText(word).width;
      const lineLeft = (W - total) / 2;
      const start = this.letters.length;

      for (let i = 0; i < word.length; i++) {
        const x = lineLeft + ctx.measureText(word.slice(0, i)).width;
        const m = ctx.measureText(word[i]);
        this.letters.push({
          ch: word[i],
          x,
          y: baseline,
          left: -(m.actualBoundingBoxLeft || 0),
          right: m.actualBoundingBoxRight || m.width,
          top: -(m.actualBoundingBoxAscent || size * 0.5),
          bottom: m.actualBoundingBoxDescent || 0,
          px: [],
          py: [],
        });
        if (i > 0) this.pairs.push([start + i - 1, start + i]);
      }

      const ls = this.letters.slice(start);
      const cx = (l: Letter) => l.x + (l.left + l.right) / 2;
      const typesetCenter = (cx(ls[0]) + cx(ls[ls.length - 1])) / 2;
      POSES.forEach((pose) => {
        const gaps = pose.gaps[li % pose.gaps.length];
        const dys = pose.dy[li % pose.dy.length];
        const shifts = pose.shift;
        const span = gaps.slice(0, ls.length - 1).reduce((a, g) => a + g, 0) * H;
        let x = typesetCenter + shifts[li % shifts.length] * H - span / 2;
        ls.forEach((l, i) => {
          if (i > 0) x += (gaps[i - 1] ?? gaps[gaps.length - 1]) * H;
          l.px.push(x - cx(l));
          l.py.push((dys[i] ?? 0) * H);
        });
      });
    });
  }

  private measureCell(fontSize: number, capPx: number): number {
    const fallback = Math.max(1, Math.round(capPx / CAP_PIXELS));
    try {
      const w = Math.ceil(fontSize * 4);
      const h = Math.ceil(fontSize * 1.6);
      const off = document.createElement("canvas");
      off.width = w;
      off.height = h;
      const o = off.getContext("2d", { willReadFrequently: true });
      if (!o) return fallback;
      o.fillStyle = "#000";
      o.fillRect(0, 0, w, h);
      o.fillStyle = "#fff";
      o.font = `${FONT_WEIGHT} ${fontSize}px ${this.family}`;
      o.textBaseline = "alphabetic";
      o.fillText("HEIL", 4, h * 0.8);
      const runs: number[] = [];
      for (const fy of [0.45, 0.55, 0.65]) {
        const y = Math.floor(h * 0.8 - capPx * fy);
        if (y < 0 || y >= h) continue;
        const d = o.getImageData(0, y, w, 1).data;
        let run = 0;
        for (let x = 0; x < w; x++) {
          if (d[x * 4] > 127) run++;
          else {
            if (run > 0) runs.push(run);
            run = 0;
          }
        }
        if (run > 0) runs.push(run);
      }
      if (!runs.length) return fallback;
      const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
      let g = runs[0];
      for (const r of runs) g = gcd(g, r);
      return g >= 2 ? g : fallback;
    } catch {
      return fallback;
    }
  }

  private newCycle() {
    const n = SCATTERS_MIN + Math.floor(Math.random() * (SCATTERS_MAX - SCATTERS_MIN + 1));
    const seq: number[] = [];
    let last = -1;
    for (let k = 0; k < n; k++) {
      let p = Math.floor(Math.random() * POSES.length);
      if (p === last) p = (p + 1) % POSES.length;
      seq.push(p);
      last = p;
    }
    this.seq = seq;
    this.cycleTicks = seq.length * MOVE_TICKS + RETURN_TICKS + HOLD_TICKS;
  }

  private arrive(i: number): number {
    const h = Math.sin(i * 12.9898) * 43758.5453;
    return (h - Math.floor(h)) * ARRIVE_SPREAD;
  }

  private offsetAt(l: Letter, i: number, t: number): [number, number] {
    const spread = this.arrive(i);
    const moves = this.seq.length;
    const scatterEnd = moves * MOVE_TICKS;
    if (t < scatterEnd) {
      const k = Math.min(moves - 1, Math.floor(t / MOVE_TICKS));
      const local = t - k * MOVE_TICKS;
      const p = sample(EASE_MOVE, (local / (1 + spread)) * (EASE_MOVE.length - 1) / MOVE_TICKS);
      const from = k === 0 ? [0, 0] : [l.px[this.seq[k - 1]], l.py[this.seq[k - 1]]];
      const to = [l.px[this.seq[k]], l.py[this.seq[k]]];
      return [from[0] + (to[0] - from[0]) * p, from[1] + (to[1] - from[1]) * p];
    }
    const local = t - scatterEnd;
    if (local >= RETURN_TICKS) return [0, 0];
    const p = sample(EASE_RETURN, (local / (1 + spread)) * (EASE_RETURN.length - 1) / RETURN_TICKS);
    const last = this.seq[moves - 1];
    return [l.px[last] * (1 - p), l.py[last] * (1 - p)];
  }

  private unrest(t: number): number {
    const on = BOND_ON_TICK;
    const offAt = this.seq.length * MOVE_TICKS;
    if (t <= on || t >= offAt) return 0;
    const e = Math.min(t - on, offAt - t) / JITTER_EASE_TICKS;
    const u = Math.min(1, Math.max(0, e));
    return u * u * (3 - 2 * u);
  }

  private jitter(i: number, amount: number): [number, number] {
    if (JITTER_CELLS <= 0 || amount <= 0) return [0, 0];
    if (amount < 0.5) return [0, 0];
    const w = (Math.PI * 2) / JITTER_S;
    const sy = Math.sin(this.clock * w + i * 2.9);
    if (Math.abs(sy) >= JITTER_GATE) return [0, Math.sign(sy) * JITTER_CELLS * this.cell];
    const sx = Math.sin(this.clock * w * 0.73 + i * 1.7);
    if (Math.abs(sx) >= JITTER_GATE) return [Math.sign(sx) * JITTER_CELLS * this.cell, 0];
    return [0, 0];
  }

  private render(t: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const H = this.canvas.height;
    const W = this.canvas.width;
    ctx.fillStyle = RED;
    ctx.fillRect(0, 0, W, H);
    ctx.font = this.font;
    ctx.fillStyle = WHITE;

    const unrest = this.unrest(t);
    const off = this.letters.map((l, i) => {
      const [ox, oy] = this.offsetAt(l, i, t);
      const [jx, jy] = this.jitter(i, unrest);
      return [ox + jx, oy + jy] as [number, number];
    });
    this.letters.forEach((l, i) => {
      ctx.fillText(l.ch, l.x + off[i][0], l.y + off[i][1]);
    });

    const on = BOND_ON_TICK;
    const offAt = this.seq.length * MOVE_TICKS + RETURN_TICKS - BOND_OFF_BEFORE_HOME;
    if (t < on || t > offAt) return;

    const cen: [number, number][] = this.letters.map((l, i) => [
      l.x + (l.left + l.right) / 2 + off[i][0],
      l.y + (l.top + l.bottom) / 2 + off[i][1],
    ]);

    ctx.fillStyle = WHITE;
    const cell = this.cell;
    for (const [ia, ib] of this.pairs) {
      const A = this.letters[ia];
      const B = this.letters[ib];
      const dx = cen[ib][0] - cen[ia][0];
      const dy = cen[ib][1] - cen[ia][1];
      const L = Math.hypot(dx, dy);
      if (L < 1) continue;
      const ux = dx / L;
      const uy = dy / L;
      const ea = edgeDist((A.right - A.left) / 2, (A.bottom - A.top) / 2, ux, uy);
      const eb = edgeDist((B.right - B.left) / 2, (B.bottom - B.top) / 2, ux, uy);
      const free = L - ea - eb;
      const air = BOND_AIR_CELLS * cell;
      const usable = free - 2 * air;
      const n = Math.floor(usable / cell);
      if (n < BOND_MIN_CELLS) continue;
      const s0 = ea + air + (usable - n * cell) / 2;
      const bow = BOND_BOW_CELLS * cell * Math.sin(this.clock * ((Math.PI * 2) / BOND_BOW_S) + ia * 1.1);
      const nx = -uy;
      const ny = ux;
      for (let k = 0; k < n; k++) {
        const d = s0 + (k + 0.5) * cell;
        const e = n > 1 ? Math.sin((Math.PI * (k + 0.5)) / n) : 0;
        const px = cen[ia][0] + ux * d + nx * bow * e;
        const py = cen[ia][1] + uy * d + ny * bow * e;
        const w = BOND_WEIGHT_CELLS * cell;
        ctx.fillRect(
          Math.round((px - w / 2) / cell) * cell,
          Math.round((py - w / 2) / cell) * cell,
          w,
          w,
        );
      }
    }
  }

  start() {
    if (this.running || !this.ok) return;
    this.running = true;
    this.t0 = performance.now();
    if (!this.mounted) this.mounted = this.t0;
    if (!this.seq.length) this.newCycle();
    const tick = (now: number) => {
      if (!this.running) return;
      this.clock = (now - this.mounted) / 1000;
      const t = ((now - this.t0) / 1000) * FPS;
      if (t >= this.cycleTicks) {
        this.t0 = now;
        this.newCycle();
        this.lastTick = 0;
        this.render(0);
      } else {
        this.lastTick = t;
        this.render(t);
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  renderStill() {
    if (!this.seq.length) this.newCycle();
    this.render(this.cycleTicks - 1);
  }

  destroy() {
    this.stop();
  }
}
