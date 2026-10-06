import { fmt } from '@/core/format';
import { clamp } from '@/core/math';

/** Pure number count-up helpers (no Pixi) so the maths is unit-testable. */

/** Roll-up length in seconds: 0.4 s for a small change, growing with magnitude, capped at 0.8 s. */
export function countUpDuration(delta: number): number {
  const mag = Math.abs(delta);
  if (mag < 1) return 0;
  return clamp(0.4 + Math.log10(mag) * 0.1, 0.4, 0.8);
}

/**
 * Displayed integer for eased progress `k` between `from` and `to`. Always an integer and never
 * overshoots `to`, even when the easing does (back/elastic) — a counter must never show a value the
 * player does not have.
 */
export function countUpValue(from: number, to: number, k: number): number {
  if (k >= 1) return Math.round(to);
  if (k <= 0) return Math.round(from);
  const v = from + (to - from) * k;
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  return Math.round(clamp(v, lo, hi));
}

/** Text shown while counting: full digits with separators up to 9,999, then 만/억/조 (ko) or K/M/B/T (en). */
export function formatCount(n: number): string {
  return fmt(n);
}

/** "+120" / "-30" style delta text for floating change callouts. */
export function formatDelta(delta: number): string {
  const body = fmt(Math.abs(delta));
  return delta < 0 ? '-' + body : '+' + body;
}
