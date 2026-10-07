/** Pure rules of the summon result chip (no display objects): how long it stays, how big it is, where a stack puts each one. */

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
