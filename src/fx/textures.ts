import { CanvasSource, Rectangle, Texture } from 'pixi.js';
import { putTex } from '@/core/assets';

/**
 * One procedural atlas for every particle shape, so the particle layer is a single draw call.
 * Shapes are evaluated per pixel from signed-distance functions: perfectly anti-aliased and flat (cut
 * paper has hard edges and no glow), white on transparent so a particle's colour comes purely from its tint. The two exceptions
 * are `glow` (a soft round light for the battle effects, which are not paper) and `bubble` (a thin ring, a faint film and a highlight). The atlas
 * is painted at 2x and registered with resolution 2, so a cell's size in the table below is already
 * in design px.
 */
export const FX_TEX_IDS = [
  'disc',
  'dot',
  'ring',
  'ringThick',
  'spark',
  'sparkle',
  'star',
  'smoke',
  'shard',
  'confetti',
  'paw',
  'heart',
  'plus',
  'droplet',
  'crystal',
  'wedge',
  'pillar',
  'slash',
  'bolt',
  'starburst',
  'coin',
  'beam',
  'vortex',
  'tuft',
  'puddle',
  'zapGlyph',
  'streak',
  'patch',
  'sun',
  'glow',
  'bubble',
] as const;

export type FxTexId = (typeof FX_TEX_IDS)[number];

export interface FxTexture {
  id: FxTexId;
  texture: Texture;
  /** Size in design px. */
  w: number;
  h: number;
  /** Natural anchor: where the shape's origin sits (0..1). */
  ax: number;
  ay: number;
}

const RES = 2;
const PAD = 4;
const ATLAS_W = 1024;

type Painter = (x: number, y: number) => number;

interface Cell {
  id: FxTexId;
  w: number;
  h: number;
  ax: number;
  ay: number;
  paint: Painter;
  /** Optional grey level 0..1 (default 1 = white) for shapes that need internal shading. */
  shade?: Painter;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (e0: number, e1: number, x: number): number => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
/** Signed distance in atlas px -> coverage; 1 px wide anti-aliasing. */
const aa = (d: number): number => clamp01(0.5 - d);
const len = Math.hypot;

function sdSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): { d: number; t: number } {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const t = clamp01((pax * bax + pay * bay) / (bax * bax + bay * bay));
  segOut.d = len(pax - bax * t, pay - bay * t);
  segOut.t = t;
  return segOut;
}
const segOut = { d: 0, t: 0 };

/** Signed distance to a polygon given as flat x,y pairs (negative inside). */
function sdPoly(px: number, py: number, v: readonly number[]): number {
  const n = v.length / 2;
  let d = (px - v[0]!) * (px - v[0]!) + (py - v[1]!) * (py - v[1]!);
  let s = 1;
  for (let i = 0, j = n - 1; i < n; j = i, i++) {
    const vix = v[2 * i]!;
    const viy = v[2 * i + 1]!;
    const vjx = v[2 * j]!;
    const vjy = v[2 * j + 1]!;
    const ex = vjx - vix;
    const ey = vjy - viy;
    const wx = px - vix;
    const wy = py - viy;
    const t = clamp01((wx * ex + wy * ey) / (ex * ex + ey * ey));
    const bx = wx - ex * t;
    const by = wy - ey * t;
    d = Math.min(d, bx * bx + by * by);
    const c1 = py >= viy;
    const c2 = py < vjy;
    const c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * Math.sqrt(d);
}

function sdBox(px: number, py: number, hx: number, hy: number): number {
  const dx = Math.abs(px) - hx;
  const dy = Math.abs(py) - hy;
  return len(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
}

/** Approximate signed distance to an axis-aligned ellipse (good enough for AA edges). */
function sdEllipse(px: number, py: number, rx: number, ry: number): number {
  return (len(px / rx, py / ry) - 1) * Math.min(rx, ry);
}

/** iq's heart distance (unit heart, tip at the origin, +y up). */
function sdHeart(px: number, py: number): number {
  const x = Math.abs(px);
  const y = py;
  if (y + x > 1) {
    return len(x - 0.25, y - 0.75) - Math.SQRT2 / 4;
  }
  const a = len(x, y - 1);
  const m = 0.5 * Math.max(x + y, 0);
  const b = len(x - m, y - m);
  return Math.min(a, b) * Math.sign(x - y);
}

function star5(outer: number, inner: number): number[] {
  const v: number[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    v.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  return v;
}


/** Distance to a curved leaf: a quadratic curve whose radius swells to `rmax` mid-way and is pointed at both ends. */
function sdLeaf(px: number, py: number, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, rmax: number): number {
  const steps = 10;
  let best = Infinity;
  let ax = x0;
  let ay = y0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const bx = u * u * x0 + 2 * u * t * cx + t * t * x1;
    const by = u * u * y0 + 2 * u * t * cy + t * t * y1;
    const s = sdSegment(px, py, ax, ay, bx, by);
    const tt = (i - 1 + s.t) / steps;
    best = Math.min(best, s.d - rmax * Math.pow(Math.sin(Math.PI * tt), 0.7));
    ax = bx;
    ay = by;
  }
  return best;
}

const BOLT_GLYPH = [8, -30, -16, 6, -3, 6, -9, 30, 17, -8, 4, -8, 14, -30];

const STAR = star5(52, 22);
const SHARD = [-21, -15, 29, -1, -9, 22];

interface Toe {
  x: number;
  y: number;
  rx: number;
  ry: number;
  rot: number;
}
const TOES: Toe[] = [
  { x: -33, y: -8, rx: 9, ry: 13, rot: -0.5 },
  { x: -12, y: -27, rx: 9.5, ry: 13.5, rot: -0.15 },
  { x: 12, y: -27, rx: 9.5, ry: 13.5, rot: 0.15 },
  { x: 33, y: -8, rx: 9, ry: 13, rot: 0.5 },
];

const ARM_COUNT = 6;
const CRYSTAL_ARM = 50;

function sdCrystal(px: number, py: number): number {
  let best = len(px, py) - 8; // central hub
  for (let i = 0; i < ARM_COUNT; i++) {
    const a = (i * Math.PI * 2) / ARM_COUNT - Math.PI / 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const s = sdSegment(px, py, 0, 0, ca * CRYSTAL_ARM, sa * CRYSTAL_ARM);
    best = Math.min(best, s.d - (4.2 - 3.1 * s.t));
    // Two barbs per arm at 55% of its length, swept back 60 degrees.
    const bx = ca * CRYSTAL_ARM * 0.55;
    const by = sa * CRYSTAL_ARM * 0.55;
    for (let k = -1; k <= 1; k += 2) {
      const ba = a + k * 1.0;
      const b = sdSegment(px, py, bx, by, bx + Math.cos(ba) * 17, by + Math.sin(ba) * 17);
      best = Math.min(best, b.d - (2.6 - 2.0 * b.t));
    }
  }
  return best;
}

/** Flat star with `n` points (alternating outer and inner radius), pointing up. */
function starN(n: number, outer: number, inner: number): number[] {
  const v: number[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    v.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  return v;
}

const SPARKLE = [0, -60, 12, -12, 60, 0, 12, 12, 0, 60, -12, 12, -60, 0, -12, -12];
const BURST = starN(9, 62, 28);
const SUN = starN(12, 62, 40);

/** Circles whose union is the flat paper puff. */
const PUFF: ReadonlyArray<readonly [number, number, number]> = [
  [0, 8, 36],
  [-30, 12, 25],
  [30, 12, 25],
  [-14, -16, 27],
  [18, -14, 23],
];

function sdPuff(x: number, y: number): number {
  let d = Infinity;
  for (const [cx, cy, r] of PUFF) d = Math.min(d, len(x - cx, y - cy) - r);
  return d;
}

const CELLS: Cell[] = [
  // The three big round shapes are painted twice as large: shockwaves, summon rings and ground discs are drawn up to
  // 600 px wide, where a 128 px cell would blur the cut edge of the paper.
  { id: 'disc', w: 256, h: 256, ax: 0.5, ay: 0.5, paint: (x, y) => aa(len(x, y) - 124) },
  { id: 'dot', w: 48, h: 48, ax: 0.5, ay: 0.5, paint: (x, y) => aa(len(x, y) - 21) },
  { id: 'ring', w: 256, h: 256, ax: 0.5, ay: 0.5, paint: (x, y) => aa(Math.abs(len(x, y) - 110) - 6) },
  { id: 'ringThick', w: 256, h: 256, ax: 0.5, ay: 0.5, paint: (x, y) => aa(Math.abs(len(x, y) - 104) - 20) },
  {
    id: 'spark',
    w: 128,
    h: 32,
    ax: 0.5,
    ay: 0.5,
    paint: (x, y) => {
      // A flat lens: a rounded head at the right, a pointed tail at the left.
      const u = (x + 64) / 128;
      const head = 0.9;
      const hh = u < head ? 9.5 * Math.pow(u / head, 1.05) : 9.5 * Math.sqrt(Math.max(0, 1 - ((u - head) / (1 - head)) ** 2));
      return aa(Math.abs(y) - hh) * smooth(0, 0.04, u);
    },
  },
  { id: 'sparkle', w: 128, h: 128, ax: 0.5, ay: 0.5, paint: (x, y) => aa(sdPoly(x, y, SPARKLE) - 1) },
  { id: 'star', w: 112, h: 112, ax: 0.5, ay: 0.5, paint: (x, y) => aa(sdPoly(x, y + 2, STAR) - 4) },
  { id: 'smoke', w: 128, h: 128, ax: 0.5, ay: 0.5, paint: (x, y) => aa(sdPuff(x, y)) },
  { id: 'shard', w: 64, h: 64, ax: 0.5, ay: 0.5, paint: (x, y) => aa(sdPoly(x, y, SHARD) - 0.6) },
  { id: 'confetti', w: 40, h: 24, ax: 0.5, ay: 0.5, paint: (x, y) => aa(sdBox(x, y, 15, 7) - 2) },
  {
    id: 'paw',
    w: 112,
    h: 112,
    ax: 0.5,
    ay: 0.5,
    paint: (x, y) => {
      // Main pad: a rounded trefoil made from three overlapping ellipses.
      let d = Math.min(
        sdEllipse(x, y - 14, 25, 20),
        sdEllipse(x + 15, y - 8, 15, 15),
        sdEllipse(x - 15, y - 8, 15, 15),
      );
      for (const t of TOES) {
        const c = Math.cos(t.rot);
        const s = Math.sin(t.rot);
        const lx = (x - t.x) * c + (y - t.y) * s;
        const ly = -(x - t.x) * s + (y - t.y) * c;
        d = Math.min(d, sdEllipse(lx, ly, t.rx, t.ry));
      }
      return aa(d);
    },
  },
  {
    id: 'heart',
    w: 112,
    h: 112,
    ax: 0.5,
    ay: 0.5,
    paint: (x, y) => aa(sdHeart(x / 80, (46 - y) / 80) * 80),
  },
  {
    id: 'plus',
    w: 96,
    h: 96,
    ax: 0.5,
    ay: 0.5,
    paint: (x, y) => aa(Math.min(sdBox(x, y, 31, 7) - 5, sdBox(x, y, 7, 31) - 5)),
  },
  {
    id: 'droplet',
    w: 56,
    h: 80,
    ax: 0.5,
    ay: 0.5,
    paint: (x, y) => {
      const cy = 14;
      const r = 20;
      const tipY = -37;
      const dist = cy - tipY;
      const tx = r * Math.sqrt(1 - (r / dist) ** 2);
      const ty = cy - (r * r) / dist;
      const circle = len(x, y - cy) - r;
      const cone = sdPoly(x, y, [0, tipY, tx, ty, -tx, ty]);
      return aa(Math.min(circle, cone));
    },
  },
  { id: 'crystal', w: 112, h: 112, ax: 0.5, ay: 0.5, paint: (x, y) => aa(sdCrystal(x, y)) },
  {
    id: 'wedge',
    w: 256,
    h: 64,
    ax: 0,
    ay: 0.5,
    // A flat triangle with its apex at the origin: one ray of a paper sunburst.
    paint: (x, y) => aa(Math.abs(y) - (32 * (x + 128)) / 256) * smooth(0, 0.03, (x + 128) / 256),
  },
  {
    id: 'pillar',
    w: 64,
    h: 256,
    ax: 0.5,
    ay: 0.94,
    // A flat strip that widens upwards, square at the top, tapering to a point at the foot.
    paint: (x, y) => {
      const t = (y + 128) / 256;
      return aa(Math.abs(x) - (6 + 24 * t)) * smooth(0, 0.03, t);
    },
  },
  {
    id: 'slash',
    w: 160,
    h: 160,
    ax: 0.5,
    ay: 0.5,
    paint: (x, y) => {
      const px = x - 4;
      const dA = len(px + 20, y) - 68;
      const dB = len(px + 62, y) - 68;
      return aa(Math.max(dA, -dB));
    },
  },
  { id: 'bolt', w: 64, h: 16, ax: 0, ay: 0.5, paint: (x, y) => aa(Math.max(Math.abs(y) - 2.6, Math.abs(x) - 30)) },
  { id: 'starburst', w: 128, h: 128, ax: 0.5, ay: 0.5, paint: (x, y) => aa(sdPoly(x, y, BURST)) },
  {
    id: 'coin',
    w: 64,
    h: 64,
    ax: 0.5,
    ay: 0.5,
    paint: (x, y) => aa(len(x, y) - 28),
    // Two flat tones: a slightly darker rim and a thin inner ring, no highlight.
    shade: (x, y) => {
      const r = len(x, y);
      return clamp01(0.82 + 0.18 * smooth(20, 23.5, r) - 0.16 * Math.exp(-(((r - 12.5) / 1.6) ** 2)));
    },
  },
  { id: 'beam', w: 64, h: 256, ax: 0.5, ay: 0.5, paint: (x, y) => aa(sdBox(x, y, 26, 118) - 6) },
  {
    id: 'vortex',
    w: 128,
    h: 128,
    ax: 0.5,
    ay: 0.5,
    paint: (x, y) => {
      const r = len(x, y) / 64;
      const th = Math.atan2(y, x);
      // Three crisp spiral arms that thin out towards the rim, round a flat hub.
      const arm = 0.5 + 0.5 * Math.cos(3 * th - 7.5 * Math.log(r + 0.12));
      const body = clamp01((arm - (0.45 + 0.35 * r)) * 9) * smooth(0.08, 0.16, r) * (1 - smooth(0.72, 0.96, r));
      return clamp01(Math.max(body, 1 - smooth(0.12, 0.17, r)));
    },
  },
  {
    id: 'tuft',
    w: 64,
    h: 64,
    ax: 0.5,
    ay: 0.52,
    paint: (x, y) => {
      // Four curved, pointed wisps sprouting from one base: a tuft of fur.
      const d = Math.min(
        sdLeaf(x, y, -2, 28, -22, 6, -8, -26, 4.4),
        sdLeaf(x, y, 0, 28, -5, 0, 10, -30, 4.8),
        sdLeaf(x, y, 2, 28, 16, 10, 26, -10, 3.8),
        sdLeaf(x, y, -2, 28, -26, 20, -28, 2, 3.0),
      );
      return aa(d);
    },
  },
  {
    id: 'puddle',
    w: 128,
    h: 64,
    ax: 0.5,
    ay: 0.5,
    paint: (x, y) => {
      const th = Math.atan2(y * 2.2, x);
      const edge = 1 + 0.07 * Math.sin(3 * th + 0.7) + 0.045 * Math.sin(5 * th + 2.1);
      const e = len(x / 59, y / 27) / edge;
      return aa((e - 1) * 24);
    },
  },
  { id: 'zapGlyph', w: 64, h: 64, ax: 0.5, ay: 0.5, paint: (x, y) => aa(sdPoly(x, y, BOLT_GLYPH) - 1.5) },
  {
    id: 'streak',
    w: 256,
    h: 16,
    ax: 0,
    ay: 0.5,
    paint: (x, y) => {
      const u = (x + 128) / 256;
      // Pointed at both ends, fullest a little before the middle: a flat swipe.
      const h = 5.6 * Math.pow(Math.sin(Math.PI * Math.pow(clamp01(u), 0.72)), 0.85);
      return aa(Math.abs(y) - (0.4 + h * 0.62)) * smooth(0, 0.03, u) * (1 - smooth(0.97, 1, u));
    },
  },
  { id: 'patch', w: 128, h: 128, ax: 0.5, ay: 0.5, paint: (x, y) => aa(sdBox(x, y, 56, 56) - 8) },
  { id: 'sun', w: 128, h: 128, ax: 0.5, ay: 0.5, paint: (x, y) => aa(sdPoly(x, y, SUN)) },
  {
    id: 'glow',
    w: 128,
    h: 128,
    ax: 0.5,
    ay: 0.5,
    paint: (x, y) => {
      const d = len(x, y) / 62;
      return d >= 1 ? 0 : Math.pow(1 - d * d, 2);
    },
  },
  {
    id: 'bubble',
    w: 96,
    h: 96,
    ax: 0.5,
    ay: 0.5,
    paint: (x, y) => {
      const d = len(x, y);
      const rim = aa(Math.abs(d - 43) - 2.4);
      // A thin film that thickens toward the edge, and a bright slanted highlight at the upper left.
      const film = d < 43 ? 0.1 + 0.22 * smooth(24, 43, d) : 0;
      const hl = aa(sdEllipse(x + 17, y + 18, 11, 5.2)) * 0.95;
      return Math.max(rim, film, hl);
    },
  },
];

interface Packed {
  cell: Cell;
  x: number;
  y: number;
}

function pack(): { items: Packed[]; height: number } {
  const order = CELLS.slice().sort((a, b) => b.h - a.h || b.w - a.w);
  const items: Packed[] = [];
  let x = PAD;
  let y = PAD;
  let rowH = 0;
  for (const cell of order) {
    if (x + cell.w + PAD > ATLAS_W) {
      x = PAD;
      y += rowH + PAD;
      rowH = 0;
    }
    items.push({ cell, x, y });
    x += cell.w + PAD;
    rowH = Math.max(rowH, cell.h);
  }
  let height = 256;
  while (height < y + rowH + PAD) height *= 2;
  return { items, height };
}

let atlas: Record<FxTexId, FxTexture> | null = null;
let vignette: Texture | null = null;
let atlasSource: CanvasSource | null = null;

function paintAtlas(): Record<FxTexId, FxTexture> {
  const { items, height } = pack();
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_W;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('fx: 2D canvas unavailable');
  const img = ctx.createImageData(ATLAS_W, height);
  const data = img.data;
  for (const { cell, x: ox, y: oy } of items) {
    const hw = cell.w / 2;
    const hh = cell.h / 2;
    for (let j = 0; j < cell.h; j++) {
      for (let i = 0; i < cell.w; i++) {
        const lx = i + 0.5 - hw;
        const ly = j + 0.5 - hh;
        const a = cell.paint(lx, ly);
        if (a <= 0) continue;
        const k = ((oy + j) * ATLAS_W + ox + i) * 4;
        const g = cell.shade ? Math.round(cell.shade(lx, ly) * 255) : 255;
        data[k] = g;
        data[k + 1] = g;
        data[k + 2] = g;
        data[k + 3] = Math.round(clamp01(a) * 255);
      }
    }
  }
  ctx.putImageData(img, 0, 0);

  const source = new CanvasSource({ resource: canvas, resolution: RES, autoGarbageCollect: false });
  atlasSource = source;
  const out = {} as Record<FxTexId, FxTexture>;
  for (const { cell, x, y } of items) {
    const w = cell.w / RES;
    const h = cell.h / RES;
    const texture = new Texture({
      source,
      frame: new Rectangle(x / RES, y / RES, w, h),
      label: `fx_${cell.id}`,
    });
    out[cell.id] = { id: cell.id, texture, w, h, ax: cell.ax, ay: cell.ay };
    putTex(`fx_${cell.id}`, texture);
  }
  return out;
}

function paintVignette(): Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('fx: 2D canvas unavailable');
  const img = ctx.createImageData(size, size);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const u = ((i + 0.5) / size) * 2 - 1;
      const v = ((j + 0.5) / size) * 2 - 1;
      // Superellipse distance: reads as a rounded-rectangle frame once stretched to the screen.
      const d = Math.pow(Math.pow(Math.abs(u), 3) + Math.pow(Math.abs(v), 3), 1 / 3);
      const a = Math.pow(smooth(0.42, 1.12, d), 1.25);
      const k = (j * size + i) * 4;
      img.data[k] = 255;
      img.data[k + 1] = 255;
      img.data[k + 2] = 255;
      img.data[k + 3] = Math.round(clamp01(a) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return new Texture({ source: new CanvasSource({ resource: canvas, autoGarbageCollect: false }), label: 'fx_vignette' });
}

/** Paint and upload the atlas. Idempotent and cheap after the first call (one-off ~20 ms). */
export function ensureFxTextures(): void {
  if (atlas) return;
  atlas = paintAtlas();
  vignette = paintVignette();
  putTex('fx_vignette', vignette);
}

export function fxTex(id: FxTexId): FxTexture {
  ensureFxTextures();
  return (atlas as Record<FxTexId, FxTexture>)[id];
}

/** Plain Texture handle for a shape (use with Sprite / any Pixi API). */
export function fxTexture(id: FxTexId): Texture {
  return fxTex(id).texture;
}

/** Large soft frame vignette (transparent centre, opaque rim). Stretch it over the screen. */
export function fxVignette(): Texture {
  ensureFxTextures();
  return vignette as Texture;
}

/** The shared atlas source; every particle texture must come from it to stay in one batch. */
export function fxAtlasSource(): CanvasSource {
  ensureFxTextures();
  return atlasSource as CanvasSource;
}
