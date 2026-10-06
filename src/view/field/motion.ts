/** Pure animation curves of the playfield sprites. They write into a caller-owned `Pose` so a frame allocates nothing. */
import { Ease } from '@/core/tween';
import { TAU } from '@/core/math';

export interface Pose {
  /** Signed travel along the attack direction, in lunge units (1 = the full lunge distance). */
  lunge: number;
  sx: number;
  sy: number;
}

export function makePose(): Pose {
  return { lunge: 0, sx: 1, sy: 1 };
}

/** Seconds of one attack animation: wind-up, strike and recoil. */
export const ATTACK_SECONDS = 0.3;

const WIND = 0.26;
const STRIKE = 0.46;
const PULL_BACK = -0.3;

/**
 * Attack pose for progress k in 0..1: a squashing wind-up that leans away from the target, a quick
 * lunge with a stretch, then a recoil that settles with a small landing squash.
 */
export function attackPose(k: number, out: Pose): Pose {
  if (k <= 0 || k >= 1) {
    out.lunge = 0;
    out.sx = 1;
    out.sy = 1;
    return out;
  }
  if (k < WIND) {
    const p = Ease.quadOut(k / WIND);
    out.lunge = PULL_BACK * p;
    out.sx = 1 + 0.09 * p;
    out.sy = 1 - 0.1 * p;
  } else if (k < STRIKE) {
    const p = Ease.cubicOut((k - WIND) / (STRIKE - WIND));
    out.lunge = PULL_BACK + (1 - PULL_BACK) * p;
    out.sx = 1.09 - 0.15 * p;
    out.sy = 0.9 + 0.2 * p;
  } else {
    const p = (k - STRIKE) / (1 - STRIKE);
    out.lunge = 1 - Ease.cubicOut(p);
    // Landing squash that relaxes with a slight overshoot.
    const s = Math.sin(p * Math.PI * 1.5) * (1 - p) * 0.1;
    out.sx = 0.94 + 0.06 * Ease.quadOut(p) + s * 0.6;
    out.sy = 1.1 - 0.1 * Ease.quadOut(p) - s;
  }
  return out;
}

/** Idle breathing: a slow volume-preserving squash anchored at the feet. `slow` < 1 for a weakened unit. */
export function breathe(time: number, phase: number, slow: number, out: Pose): Pose {
  const w = Math.sin(time * TAU * 0.72 * slow + phase);
  out.lunge = 0;
  out.sy = 1 + 0.028 * w;
  out.sx = 1 - 0.016 * w;
  return out;
}

/** Steps per second of a walking enemy, from its path speed (px/s). */
export function stepRate(speed: number): number {
  return Math.max(1.1, speed / 26);
}

/** Vertical hop (px, upwards positive) of a walk cycle at `age` seconds. */
export function walkBob(age: number, rate: number, amplitude: number): number {
  return Math.abs(Math.sin(age * Math.PI * rate)) * amplitude;
}

/** Side-to-side waddle (radians) of a walk cycle at `age` seconds. */
export function walkTilt(age: number, rate: number, amplitude: number): number {
  return Math.sin(age * Math.PI * rate) * amplitude;
}

/** Scale of a dying enemy over k in 0..1: a quick swell, then it collapses to nothing. */
export function deathScale(k: number): number {
  const swell = 0.4;
  if (k < swell) return 1 + 0.18 * Ease.quadOut(k / swell);
  return 1.18 * (1 - Ease.backIn((k - swell) / (1 - swell)));
}

/** Position of a hop between two points: the offset (0..1 progress) plus an arc height in px. */
export function hopArc(k: number, height: number): number {
  return -height * Math.sin(Math.PI * k);
}
