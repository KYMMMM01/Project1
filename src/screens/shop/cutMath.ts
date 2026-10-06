/** Pure geometry of the shop's cut-paper shapes (no Pixi), so the die-cut coupon and the scissor wobble are unit-testable. */
import { makeRng } from '@/ui/paperMath';

/** Subdivide a closed polygon so every long edge wanders a pixel or so, like scissors on paper. Deterministic per seed. */
export function cutPoly(pts: readonly number[], seed: number, amp = 1.1, step = 26): number[] {
  const rnd = makeRng(seed);
  const out: number[] = [];
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const x0 = pts[i * 2] as number;
    const y0 = pts[i * 2 + 1] as number;
    const j = (i + 1) % n;
    const x1 = pts[j * 2] as number;
    const y1 = pts[j * 2 + 1] as number;
    out.push(x0, y0);
    const len = Math.hypot(x1 - x0, y1 - y0);
    const k = Math.round(len / step);
    for (let s = 1; s < k; s++) {
      const u = s / k;
      const d = (rnd() - 0.5) * 2 * amp;
      out.push(x0 + (x1 - x0) * u - ((y1 - y0) / len) * d, y0 + (y1 - y0) * u + ((x1 - x0) / len) * d);
    }
  }
  return out;
}

/** The same polygon moved down by `dy` (a flat shadow). */
export function lowered(pts: readonly number[], dy: number): number[] {
  const out = new Array<number>(pts.length);
  for (let i = 0; i < pts.length; i += 2) {
    out[i] = pts[i] as number;
    out[i + 1] = (pts[i + 1] as number) + dy;
  }
  return out;
}

export interface CouponCut {
  /** 'x': a vertical perforation at x = at (notches in the top and bottom edges); 'y': a horizontal one at y = at. */
  axis: 'x' | 'y';
  at: number;
  r: number;
}

/** A rounded rectangle with a semicircular notch on each side of the perforation line, clockwise from the top-left. */
export function couponPath(w: number, h: number, cut: CouponCut, corner = 20): number[] {
  const pts: number[] = [];
  const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n = 8): void => {
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
  };
  const { r, at } = cut;
  const vertical = cut.axis === 'x';
  arc(corner, corner, corner, Math.PI, Math.PI * 1.5);
  if (vertical) arc(at, 0, r, Math.PI, 0, 10);
  arc(w - corner, corner, corner, Math.PI * 1.5, Math.PI * 2);
  if (!vertical) arc(w, at, r, Math.PI * 1.5, Math.PI * 0.5, 10);
  arc(w - corner, h - corner, corner, 0, Math.PI * 0.5);
  if (vertical) arc(at, h, r, 0, -Math.PI, 10);
  arc(corner, h - corner, corner, Math.PI * 0.5, Math.PI);
  if (!vertical) arc(0, at, r, Math.PI * 0.5, -Math.PI * 0.5, 10);
  return pts;
}
