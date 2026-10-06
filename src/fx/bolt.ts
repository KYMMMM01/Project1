import type { Rng } from './budget';
import type { ParticleSystem } from './particles';

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

/**
 * Draw a bolt path as a chain of stretched 'bolt' particles, a wide coloured glow pass under a
 * thin bright core, so it batches with the other effects and obeys the particle budget. Stops early
 * (leaving a partial bolt) when the budget refuses.
 */
export function strokeBolt(
  ps: ParticleSystem,
  pts: Float32Array,
  n: number,
  thick: number,
  color: number,
  core: number,
  delay: number,
  life: number,
  alpha: number,
  prio: 0 | 1 | 2 | 3,
): void {
  for (let i = 0; i < n - 1; i++) {
    const ax = pts[2 * i] as number;
    const ay = pts[2 * i + 1] as number;
    const bx = pts[2 * i + 2] as number;
    const by = pts[2 * i + 3] as number;
    const len = Math.hypot(bx - ax, by - ay);
    const ang = Math.atan2(by - ay, bx - ax);
    // Glow pass first so the bright core is drawn on top of it.
    for (let pass = 0; pass < 2; pass++) {
      const p = ps.alloc('bolt', 'add', prio);
      if (!p) return;
      const glowPass = pass === 0;
      p.x = ax;
      p.y = ay;
      p.rot = ang;
      p.sx0 = p.sx1 = (len + 3) / 32;
      p.sy0 = p.sy1 = (glowPass ? thick * 3.6 : thick) / 8;
      p.life = life;
      p.age = -delay;
      p.alpha = glowPass ? alpha * 0.8 : alpha;
      p.fadeIn = 0;
      p.fadeOut = 0.5;
      p.ramp.setSolid(glowPass ? color : core);
      ps.commit(p);
    }
  }
}
