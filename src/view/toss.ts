/**
 * The sticker a summon tosses from the button to its cell. Pure maths and timing, so the field (which flies it),
 * the director (which holds the reveal until it lands) and the HUD (which shows the result chip) agree.
 */
import type { SummonSource } from '@/game/api';

/** Seconds from the press to the landing: fast enough to feel instant, slow enough to follow with the eye. */
export const TOSS_SECONDS = 0.26;

/** The ring on the landing cell shows this long (the "NEW" tag stays much longer, see `NEW_TAG_SECONDS`). */
export const LAND_RING_SECONDS = 0.7;

/** A freshly arrived cat wears its "NEW" tag this long (on the field's animation clock, which stands still while paused). */
export const NEW_TAG_SECONDS = 2;

/**
 * Seconds the new cat's own reveal waits for the toss: the button's and the script's summons are tossed, a pick of three
 * lands from the popup, and relic gifts simply appear. Reduced motion has no flight (the ring, the tag and the chip remain).
 */
export function tossFor(source: SummonSource, reduced: boolean): number {
  if (reduced) return 0;
  return source === 'button' || source === 'script' || source === 'choice' ? TOSS_SECONDS : 0;
}

export interface TossPoint {
  x: number;
  y: number;
  /** 0..1 along the flight. */
  k: number;
}

/**
 * A point on the toss: a quadratic arc from (x0, y0) to (x1, y1) whose control point is lifted by `lift` px,
 * so the sticker rises and drops onto the cell. Writes into `out`.
 */
export function tossPoint(k: number, x0: number, y0: number, x1: number, y1: number, lift: number, out: TossPoint): TossPoint {
  const u = k < 0 ? 0 : k > 1 ? 1 : k;
  const cx = (x0 + x1) / 2;
  const cy = Math.min(y0, y1) - lift;
  const a = (1 - u) * (1 - u);
  const b = 2 * (1 - u) * u;
  const c = u * u;
  out.x = a * x0 + b * cx + c * x1;
  out.y = a * y0 + b * cy + c * y1;
  out.k = u;
  return out;
}

/** How high the arc rises for a flight of this length: a short hop for a near cell, never more than 150 px. */
export function tossLift(distance: number): number {
  return Math.min(150, 50 + distance * 0.28);
}

/** Scale of the flying sticker along the flight: it starts small off the button, swells at the top and lands full size. */
export function tossScale(k: number): number {
  const u = k < 0 ? 0 : k > 1 ? 1 : k;
  return 0.7 + 0.7 * Math.sin(Math.PI * Math.min(1, u * 1.15)) + 0.55 * u;
}
