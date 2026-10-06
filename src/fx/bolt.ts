import type { Rng } from './budget';

/** Number of points a bolt of `levels` subdivision levels occupies. */
export function boltPointCount(levels: number): number {
  return (1 << levels) + 1;
}

/**
 * Jagged lightning path by midpoint displacement: the chord is split in half `levels` times and
 * each new midpoint is pushed sideways by up to `roughness` × the local segment length, so large
 * kinks come first and fine crackle last. Endpoints are preserved exactly.
 *
 * `out` must hold at least 2 × boltPointCount(levels) floats (x,y pairs). Returns the point count.
 */
export function buildBolt(
  out: Float32Array,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  levels: number,
  roughness: number,
  rnd: Rng,
): number {
  const n = 1 << levels;
  out[0] = x0;
  out[1] = y0;
  out[2 * n] = x1;
  out[2 * n + 1] = y1;
  for (let step = n; step > 1; step >>= 1) {
    const half = step >> 1;
    for (let i = 0; i < n; i += step) {
      const ax = out[2 * i] as number;
      const ay = out[2 * i + 1] as number;
      const bx = out[2 * (i + step)] as number;
      const by = out[2 * (i + step) + 1] as number;
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      const off = (rnd() * 2 - 1) * roughness * len;
      const m = i + half;
      out[2 * m] = (ax + bx) / 2 + (dy / len) * off;
      out[2 * m + 1] = (ay + by) / 2 - (dx / len) * off;
    }
  }
  return n + 1;
}
