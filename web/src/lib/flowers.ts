// Flower lattice: blue line-drawn blinking flowers on paper, drifting lattice.
// Simplified drawings (open 8-petal / closed 5-petal rings generated in code),
// faithful motion: 12fps discrete ticks, one-pitch-per-loop uniform drift,
// even-odd fills, heavy frame on top. Theme-matched: paper + royal blue.

export const TICKS = 96;
export const FPS = 12;
export const PAPER = "#ece9e0";
export const INK = "#2f6fed";
export const PITCH = 0.5;
export const ROWS: number[] = [0.5];
export const MARGIN = 0.05;
export const BORDER = 1 / 30;
export const FLOWER_R = 0.46;
export const TRAVEL_PER_LOOP = 1;

type Ring = number[];

function petalRing(petals: number, r0: number, r1: number, rot: number): Ring {
  const pts: number[] = [];
  const steps = 6;
  for (let p = 0; p < petals; p++) {
    const a0 = rot + (p / petals) * Math.PI * 2;
    const a1 = rot + ((p + 0.5) / petals) * Math.PI * 2;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const a = a0 + (a1 - a0) * t;
      const r = r0 + (r1 - r0) * Math.sin(Math.PI * t);
      pts.push(Math.cos(a) * r, Math.sin(a) * r);
    }
  }
  return pts;
}

// 12 poses: open (8 thin petals) <-> closed (5 fat petals), alternating.
function buildPoses(): Ring[][] {
  const poses: Ring[][] = [];
  for (let k = 0; k < 12; k++) {
    const phase = k / 12;
    const open = Math.abs(Math.sin(phase * Math.PI * 2));
    const petals = open > 0.5 ? 8 : 5;
    const spread = open > 0.5 ? 0.46 : 0.3;
    const rings: Ring[] = [petalRing(petals, 0.08, spread, (k * 0.13) % 1)];
    rings.push(petalRing(Math.max(3, petals - 3), 0.04, spread * 0.55, 0.3 + k * 0.07));
    poses.push(rings);
  }
  return poses;
}

export class FlowerLattice {
  private ctx: CanvasRenderingContext2D | null;
  private raf = 0;
  private t0 = 0;
  private running = false;
  private dpr = 1;
  private lastTick = -1;
  private poses: Path2D[];
  readonly ok: boolean;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d");
    this.ok = !!this.ctx;
    this.poses = buildPoses().map((rings) => {
      const p = new Path2D();
      for (const r of rings) {
        p.moveTo(r[0], r[1]);
        for (let i = 2; i < r.length; i += 2) p.lineTo(r[i], r[i + 1]);
        p.closePath();
      }
      return p;
    });
    if (this.ok) this.resize();
  }

  resize() {
    const c = this.canvas;
    const r = c.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(r.width * this.dpr);
    c.height = Math.round(r.height * this.dpr);
    this.lastTick = -1;
    if (!this.running) this.renderStill();
  }

  start() {
    if (this.running || !this.ok) return;
    this.running = true;
    this.t0 = performance.now();
    this.lastTick = -1;
    const tick = (now: number) => {
      if (!this.running) return;
      const t = Math.floor(((now - this.t0) / 1000) * FPS) % TICKS;
      if (t !== this.lastTick) {
        this.lastTick = t;
        this.draw(t);
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  renderStill() {
    if (this.ok) this.draw(0);
  }

  destroy() {
    this.stop();
    this.ctx = null;
  }

  private draw(tick: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const { dpr } = this;
    const W = this.canvas.width / dpr;
    const H = this.canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);

    const pitch = PITCH * H;
    const margin = MARGIN * H;
    const border = BORDER * H;
    const inset = margin + border;

    ctx.save();
    ctx.beginPath();
    ctx.rect(inset, inset, W - inset * 2, H - inset * 2);
    ctx.clip();

    const pose = this.poses[tick % this.poses.length];
    const travel = (TRAVEL_PER_LOOP * tick * pitch) / TICKS;
    const reach = FLOWER_R * pitch;
    ctx.fillStyle = INK;
    for (let r = 0; r < ROWS.length; r++) {
      const cy = ROWS[r] * H;
      const drift = -travel;
      const start = (((W / 2 + drift) % pitch) + pitch) % pitch - pitch;
      for (let x = start; x < W + reach; x += pitch) {
        if (x < -reach) continue;
        ctx.save();
        ctx.translate(x, cy);
        ctx.scale(pitch, pitch);
        ctx.fill(pose, "evenodd");
        ctx.restore();
      }
    }
    ctx.restore();

    ctx.beginPath();
    ctx.rect(margin, margin, W - margin * 2, H - margin * 2);
    ctx.rect(inset, inset, W - inset * 2, H - inset * 2);
    ctx.fillStyle = INK;
    ctx.fill("evenodd");
  }
}
