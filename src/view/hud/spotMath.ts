/**
 * When a lesson's note and paw are laid, and when they are left alone. A lesson is measured a few times a second against the control it
 * points at; a control that is still arriving (it pops in, a strip rises, a sheet slides up) moves for a third of a second, and laying
 * the note and the paw afresh at every step of that made the note blink and the paw hop between spots. `SpotSettle` decides, from the
 * rectangles it is fed, whether to wait for the target to come to rest, to lay the note and the paw once, to let only the lit window
 * follow, or to keep what is there while the target blinks out for a moment. Pure: Tutorial.ts draws what it says.
 */
import type { Rect } from './layoutMath';

/** Seconds between two measurements of where the target is. */
export const MEASURE_EVERY = 0.1;
/** The target has not moved when its centre and size changed by less than this (px) since the measure before. */
export const STILL = 2;
/** The target has settled after this many measures in a row without movement (it is then laid at once). */
export const SETTLE_MEASURES = 2;
/** A target that never comes to rest (something keeps nudging it) is laid anyway after this many measures. */
export const SETTLE_LIMIT = 8;
/** A target that has settled elsewhere is laid again only when it is this far (px) from where it was laid. */
export const LAY_AGAIN = 56;
/** A target that cannot be measured for this many measures in a row is gone: the note and the paw leave (a blink is not). */
export const MISSING_LIMIT = 5;

export const NO_SPOT: Rect = { x: 0, y: 0, w: 0, h: 0 };

/** How far `b` is from `a`: the largest change of centre or size (px). */
export function shift(a: Rect, b: Rect): number {
  return Math.max(
    Math.abs(a.x + a.w / 2 - (b.x + b.w / 2)),
    Math.abs(a.y + a.h / 2 - (b.y + b.h / 2)),
    Math.abs(a.w - b.w),
    Math.abs(a.h - b.h),
  );
}

/**
 * What to do with a measurement:
 *  - `wait`   the target is still moving and nothing is laid yet: only the lit window follows
 *  - `lay`    put the note and the paw down for this rectangle (they stay where they are laid until the next `lay`)
 *  - `follow` the note and the paw stay; the lit window follows the target
 *  - `keep`   the target is not measurable for a moment: everything stays as it is
 *  - `clear`  the target is gone for good: the note and the paw leave
 */
export type SpotPlan = 'wait' | 'lay' | 'follow' | 'keep' | 'clear';

export class SpotSettle {
  private laid: Rect | null = null;
  private last: Rect | null = null;
  private calm = 0;
  private waited = 0;
  private missing = 0;

  /** The lesson or its target changed: the next rectangle starts a new settling, and what was laid is forgotten. */
  reset(): void {
    this.laid = null;
    this.last = null;
    this.calm = 0;
    this.waited = 0;
    this.missing = 0;
  }

  /**
   * The note and the paw were taken away for a while (a sticker, a popup) or the paw has to point somewhere else: they are laid again at the
   * next measure of a target that has not moved, without another settling (what was measured is kept).
   */
  suspend(): void {
    this.laid = null;
    this.waited = 0;
    this.missing = 0;
  }

  /** Where the note and the paw were last laid, or null. */
  get at(): Rect | null {
    return this.laid;
  }

  step(now: Rect): SpotPlan {
    if (now.w <= 0 || now.h <= 0) {
      this.last = null;
      this.calm = 0;
      if (this.laid === null) return 'clear';
      if (++this.missing < MISSING_LIMIT) return 'keep';
      this.laid = null;
      this.waited = 0;
      return 'clear';
    }
    this.missing = 0;
    this.calm = this.last && shift(this.last, now) < STILL ? this.calm + 1 : 0;
    this.last = now;
    if (this.laid === null) {
      this.waited++;
      if (this.calm < SETTLE_MEASURES && this.waited < SETTLE_LIMIT) return 'wait';
      this.laid = now;
      this.waited = 0;
      return 'lay';
    }
    if (shift(this.laid, now) >= LAY_AGAIN && this.calm >= SETTLE_MEASURES) {
      this.laid = now;
      return 'lay';
    }
    return 'follow';
  }
}

/** True when the two windows differ enough to be drawn again (a breathing control stays inside this). */
export function windowMoved(a: Rect, b: Rect): boolean {
  return shift(a, b) >= 0.5;
}
