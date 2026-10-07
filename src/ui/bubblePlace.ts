/**
 * Pure placement of a speech bubble or a note round the thing it points at, and of a toast: whatever the caller
 * asks for, the result stays inside the safe rectangle and the tail moves with the body so it still reaches the target.
 */
import type { Box } from './layoutMath';

export interface BubbleSpec {
  /** What the tail points at. */
  anchor: Box;
  /** Size of the body, tail not included. */
  w: number;
  h: number;
  /** The rectangle the whole bubble, tail included, has to stay in. */
  bounds: Box;
  /** Length of the tail. */
  arrow: number;
  /** How close to a corner of the body the tail may stand. */
  inset: number;
  /** Which side of the target the bubble is wanted on. */
  prefer?: 'above' | 'below';
}

export interface BubblePlace {
  /** Top-left of the body. */
  x: number;
  y: number;
  /** The tail leaves the bottom edge of the body when the bubble is above its target, the top edge when below. */
  side: 'top' | 'bottom';
  /** Where the tail stands along the body, from its left edge. */
  tailX: number;
  /** The tail's tip, where the body's origin would be if it were hung on the target. */
  tipX: number;
  tipY: number;
}

const clamp = (v: number, lo: number, hi: number): number => (hi < lo ? lo : Math.min(hi, Math.max(lo, v)));

/** How far `box` has to move so that it lies inside `bounds` (centred in it when it is bigger). */
export function keepInside(box: Box, bounds: Box): { dx: number; dy: number } {
  const x = clamp(box.x, bounds.x, bounds.x + bounds.w - box.w);
  const y = clamp(box.y, bounds.y, bounds.y + bounds.h - box.h);
  return { dx: box.w > bounds.w ? bounds.x + (bounds.w - box.w) / 2 - box.x : x - box.x, dy: box.h > bounds.h ? bounds.y + (bounds.h - box.h) / 2 - box.y : y - box.y };
}

/**
 * Above the target when there is room (or below, as asked), the other side when there is not, and on the side with more room, pushed in,
 * when neither fits. Sideways the body is pushed in and the tail slides along it to keep pointing at the target's middle.
 */
export function placeBubble(s: BubbleSpec): BubblePlace {
  const { anchor, bounds } = s;
  const cx = anchor.x + anchor.w / 2;
  const x = s.w > bounds.w ? bounds.x + (bounds.w - s.w) / 2 : clamp(cx - s.w / 2, bounds.x, bounds.x + bounds.w - s.w);
  const aboveY = anchor.y - s.arrow - s.h;
  const belowY = anchor.y + anchor.h + s.arrow;
  const fitsAbove = aboveY >= bounds.y;
  const fitsBelow = belowY + s.h <= bounds.y + bounds.h;
  const roomAbove = anchor.y - bounds.y;
  const roomBelow = bounds.y + bounds.h - (anchor.y + anchor.h);
  const above = fitsAbove && fitsBelow ? (s.prefer ?? 'above') === 'above' : fitsAbove || (!fitsBelow && roomAbove >= roomBelow);
  const y = clamp(above ? aboveY : belowY, bounds.y, bounds.y + bounds.h - s.h);
  const tailX = clamp(cx - x, s.inset, s.w - s.inset);
  return { x, y, side: above ? 'bottom' : 'top', tailX, tipX: x + tailX, tipY: above ? y + s.h + s.arrow : y - s.arrow };
}
