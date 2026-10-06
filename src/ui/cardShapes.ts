import type { Graphics } from 'pixi.js';

/**
 * Silhouettes for the unit-card frame. The outline of the plate changes with rarity (plain, chamfered
 * corners, winged, flame-crested) so a tier can be told apart without colour. Pure point maths plus one
 * path helper, kept apart from CardFrame so the geometry is unit-testable.
 */

/** Append a closed polygon with every corner rounded by up to `r` (a quadratic through each vertex) to the current path. */
export function roundedPolyPath(g: Graphics, pts: readonly number[], r: number): void {
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const p = (i + n - 1) % n;
    const q = (i + 1) % n;
    const vx = pts[i * 2] as number;
    const vy = pts[i * 2 + 1] as number;
    const d1x = (pts[p * 2] as number) - vx;
    const d1y = (pts[p * 2 + 1] as number) - vy;
    const d2x = (pts[q * 2] as number) - vx;
    const d2y = (pts[q * 2 + 1] as number) - vy;
    const l1 = Math.hypot(d1x, d1y) || 1;
    const l2 = Math.hypot(d2x, d2y) || 1;
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const ax = vx + (d1x / l1) * rr;
    const ay = vy + (d1y / l1) * rr;
    const bx = vx + (d2x / l2) * rr;
    const by = vy + (d2y / l2) * rr;
    if (i === 0) g.moveTo(ax, ay);
    else g.lineTo(ax, ay);
    g.quadraticCurveTo(vx, vy, bx, by);
  }
  g.closePath();
}

/** Rectangle with its four corners cut off diagonally by `c` (the epic frame). Clockwise from the top-left cut. */
export function chamferPoints(x: number, y: number, w: number, h: number, c: number): number[] {
  const x1 = x + w;
  const y1 = y + h;
  return [x + c, y, x1 - c, y, x1, y + c, x1, y1 - c, x1 - c, y1, x + c, y1, x, y1 - c, x, y + c];
}

/**
 * The mythic outline: chamfered corners, a three-tipped flame crest along the top (the middle tip is
 * the tallest) and two small flame tips on each side. `o` is how far the side tips reach outwards.
 */
export function flamePoints(x: number, y: number, w: number, h: number, c: number, o: number): number[] {
  const x1 = x + w;
  const y1 = y + h;
  const bw = w * 0.07;
  const tipH = [h * 0.034, h * 0.06, h * 0.034] as const;
  const at = [0.24, 0.5, 0.76] as const;
  const pts: number[] = [x + c, y];
  for (let i = 0; i < 3; i++) {
    const cx = x + w * (at[i] as number);
    const half = i === 1 ? bw * 1.25 : bw;
    pts.push(cx - half, y, cx, y - (tipH[i] as number), cx + half, y);
  }
  pts.push(x1 - c, y);
  pts.push(x1, y + c);
  for (const t of [0.3, 0.6]) {
    const cy = y + h * t;
    pts.push(x1, cy - 11, x1 + o, cy, x1, cy + 11);
  }
  pts.push(x1, y1 - c, x1 - c, y1, x + c, y1, x, y1 - c);
  for (const t of [0.6, 0.3]) {
    const cy = y + h * t;
    pts.push(x, cy + 11, x - o, cy, x, cy - 11);
  }
  pts.push(x, y + c);
  return pts;
}

/**
 * One feathered wing (the legendary frame) rooted on a side edge at height `ym`. `side` is +1 for the
 * right edge and -1 for the left; `ex` is the x of that edge, `o` how far the wing reaches, `s` scales
 * the vertical dimensions with the card height.
 */
export function wingPoints(side: 1 | -1, ex: number, ym: number, o: number, s: number): number[] {
  const rel: readonly (readonly [number, number])[] = [
    [-5, -46],
    [o * 0.95, -58],
    [o * 0.5, -38],
    [o * 1.15, -37],
    [o * 0.55, -19],
    [o * 0.95, -10],
    [-5, 10],
  ];
  const out: number[] = [];
  for (const [dx, dy] of rel) out.push(ex + side * dx, ym + dy * s);
  return out;
}
