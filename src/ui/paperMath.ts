/**
 * Deterministic geometry for the hand-cut paper look. Pure maths, no Pixi: paper.ts turns these
 * point lists into Graphics, and the tests exercise them directly. Every generator is seeded, so the
 * same shape always wobbles the same way (nothing shimmers between frames, resizes or reloads).
 */

const TAU = Math.PI * 2;

/** Stable 32-bit mix of up to four numbers. */
export function hash32(a: number, b = 0, c = 0, d = 0): number {
  let h = 0x9e3779b9 ^ (a | 0);
  h = Math.imul(h ^ (b | 0), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h ^ (c | 0), 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h ^ (d | 0), 0x27d4eb2f);
  h ^= h >>> 15;
  return h >>> 0;
}

/** mulberry32: a tiny seeded generator returning floats in [0, 1). */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ outlines */

export type TornSide = 'top' | 'bottom' | 'left' | 'right';
export type TornSides = TornSide | readonly TornSide[] | undefined;

const SIDE_BIT: Record<TornSide, number> = { top: 1, bottom: 2, left: 4, right: 8 };

export function tornMask(t: TornSides): number {
  if (!t) return 0;
  if (typeof t === 'string') return SIDE_BIT[t];
  let m = 0;
  for (const s of t) m |= SIDE_BIT[s];
  return m;
}

export interface PaperPath {
  /** Closed polygon, clockwise, flat x/y pairs inside [0, w] x [0, h]. */
  pts: number[];
  /** One open polyline per torn side (same coordinates), for the pale fibre line along a tear. */
  torn: number[][];
}

/** How far a cut edge strays from a straight line: 1 to 2.1 px, a little more on bigger pieces. */
export function wobbleAmp(w: number, h: number, scale = 1): number {
  return Math.min(2.1, 0.75 + Math.min(w, h) * 0.01) * scale;
}

const STEP = 9;

/**
 * A rounded rectangle cut by hand: its edge drifts by up to `amp` px along a few slow waves plus
 * a little per-vertex jitter. Sides in `mask` (see tornMask) are torn instead: short irregular
 * teeth that bite inwards. The wobble stays inside the box, so a piece never exceeds its w x h.
 */
export function paperPath(w: number, h: number, radius: number, seed: number, amp: number, mask = 0): PaperPath {
  const rnd = makeRng(seed);
  const m = amp + 0.5;
  const x0 = m;
  const y0 = m;
  const x1 = Math.max(x0 + 1, w - m);
  const y1 = Math.max(y0 + 1, h - m);
  const bw = x1 - x0;
  const bh = y1 - y0;
  const r = Math.max(0, Math.min(radius, bw / 2, bh / 2));
  const tear = Math.min(5.5, Math.max(3, amp * 2.2));
  const perimeter = Math.max(1, 2 * (bw - 2 * r) + 2 * (bh - 2 * r) + TAU * r);
  const ph1 = rnd() * TAU;
  const ph2 = rnd() * TAU;
  const ph3 = rnd() * TAU;
  const f1 = Math.max(2, Math.round(perimeter / 140));
  const f2 = Math.max(3, Math.round(perimeter / 58));
  const f3 = Math.max(5, Math.round(perimeter / 27));
  const wob = (s: number): number => {
    const u = (TAU * s) / perimeter;
    return amp * (0.55 * Math.sin(u * f1 + ph1) + 0.3 * Math.sin(u * f2 + ph2) + 0.15 * Math.sin(u * f3 + ph3));
  };

  const pts: number[] = [];
  const torn: number[][] = [];
  let s = 0;

  const edge = (ax: number, ay: number, bx: number, by: number, nx: number, ny: number, bit: number): void => {
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 0.5) return;
    const ux = (bx - ax) / len;
    const uy = (by - ay) / len;
    if ((mask & bit) !== 0) {
      const line: number[] = [];
      let pos = 0;
      let i = 0;
      while (pos < len - 3) {
        // Teeth alternate between a deep bite and a shallow one, at irregular spacing.
        const depth = tear * (i % 2 === 0 ? 0.55 + 0.45 * rnd() : 0.08 + 0.3 * rnd()) + (i === 0 ? 0 : wob(s + pos) * 0.4);
        const px = ax + ux * pos - nx * depth;
        const py = ay + uy * pos - ny * depth;
        pts.push(px, py);
        line.push(px, py);
        pos += 5 + rnd() * 7;
        i++;
      }
      line.push(bx, by);
      torn.push(line);
    } else {
      const n = Math.max(1, Math.ceil(len / STEP));
      for (let i = 0; i < n; i++) {
        const t = (i / n) * len;
        const d = wob(s + t) + (rnd() - 0.5) * amp * 0.25;
        pts.push(ax + ux * t + nx * d, ay + uy * t + ny * d);
      }
    }
    s += len;
  };

  const arc = (cx: number, cy: number, a0: number): void => {
    if (r <= 0.01) {
      pts.push(cx, cy);
      return;
    }
    const n = Math.max(3, Math.ceil((r * Math.PI) / 2 / 5));
    const len = (r * Math.PI) / 2;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * (Math.PI / 2);
      const cs = Math.cos(a);
      const sn = Math.sin(a);
      const d = wob(s + (i / n) * len) + (rnd() - 0.5) * amp * 0.25;
      pts.push(cx + cs * (r + d), cy + sn * (r + d));
    }
    s += len;
  };

  edge(x0 + r, y0, x1 - r, y0, 0, -1, 1);
  arc(x1 - r, y0 + r, -Math.PI / 2);
  edge(x1, y0 + r, x1, y1 - r, 1, 0, 8);
  arc(x1 - r, y1 - r, 0);
  edge(x1 - r, y1, x0 + r, y1, 0, 1, 2);
  arc(x0 + r, y1 - r, Math.PI / 2);
  edge(x0, y1 - r, x0, y0 + r, -1, 0, 4);
  arc(x0 + r, y0 + r, Math.PI);
  return { pts, torn };
}

const pathCache = new Map<string, PaperPath>();
const PATH_CACHE_MAX = 600;

/** paperPath, memoised per size: a shape is computed once however many pieces share it. */
export function cachedPaperPath(w: number, h: number, radius: number, seed: number, amp: number, mask = 0): PaperPath {
  const key = `${Math.round(w * 10)}|${Math.round(h * 10)}|${Math.round(radius * 10)}|${seed}|${Math.round(amp * 100)}|${mask}`;
  let p = pathCache.get(key);
  if (!p) {
    p = paperPath(w, h, radius, seed, amp, mask);
    pathCache.set(key, p);
    if (pathCache.size > PATH_CACHE_MAX) {
      const oldest = pathCache.keys().next();
      if (!oldest.done) pathCache.delete(oldest.value);
    }
  }
  return p;
}

/* ------------------------------------------------------------------- bubbles */

export interface BubbleTail {
  /** Which edge the tail leaves from. */
  side: 'top' | 'bottom';
  /** Tip x, relative to the body's left edge. */
  x: number;
  /** How far the tip sticks out of the body. */
  len: number;
  /** Half width of the tail where it joins the body. */
  half: number;
}

/**
 * The cut outline of a speech bubble: paperPath with a small tail spliced into the top or bottom edge,
 * so one stroked line runs round body and tail. The tail tip lies outside [0, h] on that side.
 */
export function bubblePath(w: number, h: number, radius: number, seed: number, amp: number, tail: BubbleTail): number[] {
  const base = cachedPaperPath(w, h, radius, seed, amp).pts;
  const half = tail.half;
  const tx = Math.max(radius + half + 2, Math.min(w - radius - half - 2, tail.x));
  const bottom = tail.side === 'bottom';
  // Clockwise: the bottom edge runs right to left, the top edge left to right.
  const first = bottom ? tx + half : tx - half;
  const last = bottom ? tx - half : tx + half;
  const tipY = bottom ? h + tail.len : -tail.len;
  const tipX = tx + (bottom ? -1 : 1) * half * 0.5;
  const out: number[] = [];
  const n = base.length / 2;
  let inserted = false;
  let skipping = false;
  for (let i = 0; i < n; i++) {
    const x = base[i * 2] as number;
    const y = base[i * 2 + 1] as number;
    const onSide = bottom ? y > h * 0.5 : y < h * 0.5;
    const px = base[((i + n - 1) % n) * 2] as number;
    const crosses = bottom ? px >= first && x < first : px <= first && x > first;
    if (!inserted && onSide && crosses) {
      const edgeY = y;
      out.push(first, edgeY, tipX, tipY, last, edgeY);
      inserted = true;
      skipping = true;
    }
    if (skipping) {
      const stillInside = bottom ? x > last : x < last;
      if (onSide && stillInside) continue;
      skipping = false;
    }
    out.push(x, y);
  }
  return out;
}

/* --------------------------------------------------------------------- dashes */

/**
 * Cut a polyline into dashes. Returns one flat polyline per dash (a dash that crosses a corner
 * bends with it), so the caller draws moveTo/lineTo per run and strokes once.
 */
export function dashRuns(pts: readonly number[], closed: boolean, dash: number, gap: number, phase = 0): number[][] {
  const runs: number[][] = [];
  const n = pts.length / 2;
  if (n < 2 || dash <= 0) return runs;
  const skip = ((phase % (dash + gap)) + dash + gap) % (dash + gap);
  let drawing = skip < dash;
  let left = drawing ? dash - skip : dash + gap - skip;
  let cur: number[] | null = null;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const ax = pts[i * 2] as number;
    const ay = pts[i * 2 + 1] as number;
    const j = (i + 1) % n;
    const bx = pts[j * 2] as number;
    const by = pts[j * 2 + 1] as number;
    const len = Math.hypot(bx - ax, by - ay);
    if (len === 0) continue;
    const ux = (bx - ax) / len;
    const uy = (by - ay) / len;
    let at = 0;
    if (drawing && !cur) cur = [ax, ay];
    while (len - at > left) {
      at += left;
      const x = ax + ux * at;
      const y = ay + uy * at;
      if (drawing) {
        (cur as number[]).push(x, y);
        runs.push(cur as number[]);
        cur = null;
        drawing = false;
        left = gap;
      } else {
        cur = [x, y];
        drawing = true;
        left = dash;
      }
    }
    left -= len - at;
    if (drawing && cur) cur.push(bx, by);
  }
  if (cur && cur.length >= 4) runs.push(cur);
  return runs;
}

/* ---------------------------------------------------------------------- tape */

/**
 * A strip of washi tape centred on the origin with zig-zag cut ends: `tooth` px deep, one tooth
 * every ~7 px of height, with a hair of irregularity so two strips never match exactly.
 */
export function tapeOutline(w: number, h: number, tooth: number, seed: number): number[] {
  const rnd = makeRng(seed);
  const n = Math.max(3, Math.round(h / 7));
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const y = -h / 2 + (h * i) / n;
    out.push(w / 2 - (i % 2 === 0 ? 0 : tooth * (0.8 + 0.4 * rnd())), y);
  }
  for (let i = n; i >= 0; i--) {
    const y = -h / 2 + (h * i) / n;
    out.push(-w / 2 + (i % 2 === 0 ? 0 : tooth * (0.8 + 0.4 * rnd())), y);
  }
  return out;
}

/** Clip a convex polygon to the vertical slab xmin <= x <= xmax (Sutherland-Hodgman, two edges). */
export function clipPolyX(pts: readonly number[], xmin: number, xmax: number): number[] {
  const clip = (src: readonly number[], keepGreater: boolean, at: number): number[] => {
    const out: number[] = [];
    const n = src.length / 2;
    for (let i = 0; i < n; i++) {
      const ax = src[i * 2] as number;
      const ay = src[i * 2 + 1] as number;
      const j = (i + 1) % n;
      const bx = src[j * 2] as number;
      const by = src[j * 2 + 1] as number;
      const aIn = keepGreater ? ax >= at : ax <= at;
      const bIn = keepGreater ? bx >= at : bx <= at;
      if (aIn) out.push(ax, ay);
      if (aIn !== bIn) {
        const t = (at - ax) / (bx - ax);
        out.push(at, ay + (by - ay) * t);
      }
    }
    return out;
  };
  return clip(clip(pts, true, xmin), false, xmax);
}

/* ---------------------------------------------------------------- painted fill */

/**
 * The silhouette of a brush-painted bar of length w and height h: a round left cap and a leading edge
 * that stops a little unevenly. `edgeNoise` also roughens the long top and bottom edges (a real
 * length; 0 for a texture that gets stretched).
 */
export function paintPath(w: number, h: number, seed: number, edgeNoise = 0): number[] {
  const rnd = makeRng(seed);
  const r = h / 2;
  const out: number[] = [];
  const cap = 9;
  for (let i = 0; i <= cap; i++) {
    const a = Math.PI / 2 + (i / cap) * Math.PI;
    out.push(r + Math.cos(a) * r, r + Math.sin(a) * r);
  }
  const run = (y: number, flip: boolean): void => {
    if (edgeNoise <= 0) return;
    const n = Math.floor((w - 2 * r) / 36);
    for (let i = 1; i <= n; i++) {
      const x = flip ? w - r - ((w - 2 * r) * i) / (n + 1) : r + ((w - 2 * r) * i) / (n + 1);
      out.push(x, y + (rnd() - 0.5) * edgeNoise);
    }
  };
  run(0, false);
  const e0 = h * (0.16 + 0.08 * rnd());
  out.push(w - e0, 0);
  const mid = [0.25, 0.5, 0.75];
  for (const t of mid) out.push(w - h * (0.04 + 0.14 * rnd()), h * t);
  const e1 = h * (0.16 + 0.08 * rnd());
  out.push(w - e1, h);
  run(h, true);
  return out;
}
