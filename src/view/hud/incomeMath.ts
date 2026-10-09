/** The fish a second as the tag beside the fish pill shows it: at most two decimals, none when it is a whole number ("0.5", "0.65", "1", "1.3"). */
export function incomeShown(perSecond: number): string {
  return String(Number((Math.round(perSecond * 100) / 100).toFixed(2)));
}

/** Where the pieces of the currency row stand (design px of the 720 wide row): the fish pill, the tag beside it, the purr pill after the tag. */
export const CURRENCY_ROW = {
  /** Left edge of the fish pill and its width: the number and the icon fit 180 px (it shrinks a long number). */
  left: 40,
  fishW: 180,
  /** The tag's box, 8 px after the pill. */
  gap: 8,
  tagW: 108,
  /** The purr counter: its heart sticks out 22 px to the left of its pill, and the pity chip (104 px at least) must stay clear of its right edge. */
  purrIcon: 22,
  purrW: 116,
} as const;

/** Centre of the fish pill while the purr counter stands beside it, and the centre of the purr pill that follows the tag. */
export const FISH_X = CURRENCY_ROW.left + CURRENCY_ROW.fishW / 2;
export const PURR_X =
  FISH_X + CURRENCY_ROW.fishW / 2 + CURRENCY_ROW.gap + CURRENCY_ROW.tagW + CURRENCY_ROW.gap + CURRENCY_ROW.purrIcon + CURRENCY_ROW.purrW / 2;
