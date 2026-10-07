/** Pure rules of the summon result chip (no display objects): how long it stays, how big it is, where a stack puts each one, and how it makes way for a note. */
import type { Rect } from './layoutMath';

/** Seconds a chip stays up (the last `CHIP_FADE` of it is the fade). */
export const CHIP_SECONDS = 1.5;
export const CHIP_FADE = 0.25;
/** Plate height and the gap between stacked chips. */
export const CHIP_H = 84;
export const CHIP_GAP = 10;
/** The most chips on screen at once: a fourth summon in a second sends the oldest away. */
export const CHIP_MAX = 3;
/** An older chip makes room for a newer one by leaving within this many seconds. */
export const CHIP_YIELD = 0.7;

/** Size of the chip by rarity index (common .. mythic): each rank is visibly bigger than the one before. */
const SCALE: readonly number[] = [1, 1.06, 1.15, 1.26, 1.36];

export function chipScale(tier: number): number {
  return SCALE[Math.max(0, Math.min(SCALE.length - 1, Math.floor(tier)))] ?? 1;
}

/** Epic and better come with a flat sunburst behind them; legendary and mythic with a second, bigger ring of rays. */
export function chipRays(tier: number): number {
  return tier >= 3 ? 2 : tier >= 2 ? 1 : 0;
}

/** Width of the plate round a name and a rank line: portrait, text, padding; never narrower than a thumb-sized chip nor wider than the screen allows. */
export function chipWidth(textWidth: number): number {
  return Math.max(250, Math.min(420, 16 + 80 + 14 + textWidth + 22));
}

/** Where chip number `i` of a stack rests above the button (0 = the newest, nearest to it), before its own scale. */
export function chipRise(i: number): number {
  return 0 - i * (CHIP_H + CHIP_GAP);
}

/** Seconds a chip has left once `newer` chips have arrived after it: it makes room by leaving sooner. */
export function chipLifeLeft(left: number, newer: number): number {
  return newer > 0 ? Math.min(left, CHIP_YIELD) : left;
}

/** Opacity of a chip with `left` seconds to go. */
export function chipAlpha(left: number): number {
  return left >= CHIP_FADE ? 1 : Math.max(0, left / CHIP_FADE);
}

/**
 * The rule against lesson notes and cards: a chip only ever lies on free paper. Whatever lies above the chips (a lesson's note, a
 * first-encounter card) is their ceiling; a chip whose top edge would come within `CHIP_CEIL_GAP` of it waits (up to `CHIP_WAIT`
 * seconds, then it is dropped: a result nobody could see for that long is no news, the NEW tag on the cell said it already), and a
 * chip that is up when a note arrives over it leaves within `CHIP_SQUEEZE`.
 */
export const CHIP_CEIL_GAP = 6;
export const CHIP_WAIT = 1.2;
export const CHIP_SQUEEZE = 0.2;
/** Half the width of the widest chip: the column the chips use, and the cheer sticker keeps clear of. */
export const CHIP_HALF_W = 210;

/** Top edge (in the same space as `originY`, the centre line of slot 0) of the chip in `slot` at its own scale. */
export function chipTop(originY: number, slot: number, scale: number): number {
  return originY + chipRise(slot) - (CHIP_H * scale) / 2;
}

/** Whether a chip in `slot` at `scale` clears the ceiling (null: nothing lies above the chips). */
export function chipFits(originY: number, slot: number, scale: number, ceiling: number | null): boolean {
  return ceiling === null || chipTop(originY, slot, scale) >= ceiling + CHIP_CEIL_GAP;
}

/** The bottom edge of `r` when it lies over the chips' column (it overlaps it sideways and starts above the first slot's centre line), else null. */
function overColumn(r: Rect | null, originY: number, centerX: number): number | null {
  if (!r || r.x >= centerX + CHIP_HALF_W || r.x + r.w <= centerX - CHIP_HALF_W) return null;
  // A rectangle that starts below the first chip's centre line is the summon button's own row, not something over the chips.
  return r.y > originY ? null : r.y + r.h;
}

function lower(a: number | null, b: number | null): number | null {
  return a === null ? b : b === null ? a : Math.max(a, b);
}

/**
 * The lowest bottom edge among the rectangles that lie over the chips' column, or null: a lesson's note, a first-encounter card, the
 * cheer sticker and the class chips' row (the chips are never stacked over it, a lesson or not).
 */
export function chipCeiling(originY: number, centerX: number, note: Rect | null, card: Rect | null, cheer: Rect | null, classes: Rect | null): number | null {
  return lower(lower(overColumn(note, originY, centerX), overColumn(card, originY, centerX)), lower(overColumn(cheer, originY, centerX), overColumn(classes, originY, centerX)));
}

/** The column the chips use, from the top of the third chip to the bottom of the first (at its largest), as one rectangle. */
export function chipColumn(originY: number, centerX: number): Rect {
  const top = chipTop(originY, CHIP_MAX - 1, SCALE[SCALE.length - 1] ?? 1);
  const bottom = originY + (CHIP_H * (SCALE[SCALE.length - 1] ?? 1)) / 2;
  return { x: centerX - CHIP_HALF_W, y: top, w: CHIP_HALF_W * 2, h: bottom - top };
}
