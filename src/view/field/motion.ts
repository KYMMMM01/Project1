/** Pure animation curves of the playfield sprites. They write into a caller-owned `Pose` so a frame allocates nothing. */
import { Ease } from '@/core/tween';
import { TAU, clamp01 } from '@/core/math';
import type { PoseSpec } from '../weapons';

export interface Pose {
  /** Signed travel along the attack direction, in lunge units (1 = the full lunge distance). */
  lunge: number;
  sx: number;
  sy: number;
  /** Turn toward the target in radians (the caller flips it for a cat facing left). */
  rot: number;
  /** Hop up in px (negative = pressed down). */
  rise: number;
}

export function makePose(): Pose {
  return { lunge: 0, sx: 1, sy: 1, rot: 0, rise: 0 };
}

function rest(out: Pose): Pose {
  out.lunge = 0;
  out.sx = 1;
  out.sy = 1;
  out.rot = 0;
  out.rise = 0;
  return out;
}

/** The wind-up held at `coil` (0..1): the cat leans, squashes and rises as its weapon's spec says, in the `lead` seconds before the release. */
export function coilPose(spec: PoseSpec, coil: number, out: Pose): Pose {
  const c = Ease.quadOut(clamp01(coil));
  const k = spec.coil;
  out.lunge = k.lunge * c;
  out.rot = k.rot * c;
  out.sx = 1 + (k.sx - 1) * c;
  out.sy = 1 + (k.sy - 1) * c;
  out.rise = k.rise * c;
  return out;
}

/**
 * The pose `t` seconds after the release, for a cat that had coiled to `coil0`: it starts exactly where the coil left it, reaches the
 * contact pose after `strike` seconds (fast and decelerating, so the contact is on the frame of the sound) and comes back to rest
 * over `recover` seconds, the squash rebounding and the turn shivering by `twang`.
 */
export function releasePose(spec: PoseSpec, t: number, coil0: number, out: Pose): Pose {
  if (t <= 0) return coilPose(spec, coil0, out);
  const hit = spec.hit;
  if (t < spec.strike) {
    coilPose(spec, coil0, out);
    const p = Ease.cubicOut(t / spec.strike);
    out.lunge += (hit.lunge - out.lunge) * p;
    out.rot += (hit.rot - out.rot) * p;
    out.sx += (hit.sx - out.sx) * p;
    out.sy += (hit.sy - out.sy) * p;
    out.rise += (hit.rise - out.rise) * p;
    return out;
  }
  const q = clamp01((t - spec.strike) / spec.recover);
  if (q >= 1) return rest(out);
  const back = 1 - Ease.cubicOut(q);
  const bounce = 1 - Ease.elasticOut(q);
  out.lunge = hit.lunge * back;
  out.rot = hit.rot * back + spec.twang * Math.sin(q * Math.PI * 3) * (1 - q);
  out.sx = 1 + (hit.sx - 1) * bounce;
  out.sy = 1 + (hit.sy - 1) * bounce;
  out.rise = hit.rise * back;
  return out;
}

/** Idle breathing: a slow volume-preserving squash anchored at the feet. `slow` < 1 for a weakened unit. */
export function breathe(time: number, phase: number, slow: number, out: Pose): Pose {
  const w = Math.sin(time * TAU * 0.72 * slow + phase);
  out.lunge = 0;
  out.rot = 0;
  out.rise = 0;
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
