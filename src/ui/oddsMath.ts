import { clamp } from '@/core/math';

/**
 * Pure helpers behind OddsTable (no Pixi), so the probability text players are legally shown is
 * unit-testable.
 */

/**
 * Percentage text for a chance in 0..1. At most two decimals, trailing zeros dropped ("60%", "12.5%",
 * "0.25%"). A real chance is never shown as "0%" or "100%": below 0.01 % it reads "<0.01%", and
 * anything short of certain stops at "99.99%".
 */
export function formatOdds(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return '0%';
  if (p >= 1) return '100%';
  const v = p * 100;
  if (v < 0.01) return '<0.01%';
  const s = v.toFixed(2);
  if (s === '100.00') return '99.99%';
  return s.replace(/\.?0+$/, '') + '%';
}

/** Filled length of an odds bar: proportional to the chance, but a real chance always leaves a visible sliver. */
export function oddsBarWidth(p: number, trackWidth: number, minPx = 8): number {
  if (!(p > 0)) return 0;
  return clamp(p * trackWidth, Math.min(minPx, trackWidth), trackWidth);
}

/** Sum of the chances in a table; a drawable table should total 1 (within rounding). */
export function oddsTotal(values: readonly number[]): number {
  let sum = 0;
  for (const v of values) sum += v > 0 ? v : 0;
  return sum;
}
