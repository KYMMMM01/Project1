import { clamp01 } from '@/core/math';
import { Ease } from '@/core/tween';

/** How the lock ring snaps onto its enemy: it starts this many times its size and closes in over `LOCK_SNAP` seconds. */
export const LOCK_FROM = 2.4;
export const LOCK_SNAP = 0.22;
/** The ping that leaves the enemy as the dot locks on grows to this many times the ring's size and is gone after `LOCK_PING` seconds. */
export const LOCK_PING = 0.5;
export const LOCK_PING_TO = 1.9;
/** Seconds the marker takes to fade when the lock ends (the enemy died or the dot was moved away). */
export const LOCK_FADE = 0.18;
/** How far outside the enemy's drawn body (and the shield ring round it) the ring lies, px, on each side. */
const LOCK_MARGIN = 14;

/** Diameter of the lock ring round a body whose picture is `size` px across. */
export function lockDiameter(size: number): number {
  return size + 2 * LOCK_MARGIN;
}

/** Scale of the ring and its brackets `age` seconds after the lock: closing in from `LOCK_FROM` with a small overshoot past 1, then breathing. */
export function lockScale(age: number, time: number, reduced: boolean): number {
  if (reduced) return 1;
  const k = clamp01(age / LOCK_SNAP);
  const closing = LOCK_FROM + (1 - LOCK_FROM) * Ease.backOut(k);
  return k < 1 ? closing : 1 + 0.035 * Math.sin(time * 6);
}

/** Opacity of the ring: it appears over the first third of the snap. */
export function lockAlpha(age: number, reduced: boolean): number {
  return reduced ? 1 : clamp01(age / (LOCK_SNAP / 3));
}

/** The ping: [scale multiplier, opacity] `age` seconds after the lock, or null once it is over. */
export function lockPing(age: number): readonly [number, number] | null {
  if (age < 0 || age >= LOCK_PING) return null;
  const k = age / LOCK_PING;
  pingOut[0] = 1 + (LOCK_PING_TO - 1) * Ease.cubicOut(k);
  pingOut[1] = 0.8 * (1 - k) * (1 - k);
  return pingOut;
}
const pingOut: [number, number] = [1, 0];
