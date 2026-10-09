/**
 * Geometry of the chest cards in the shop, kept apart from the drawing so a test can check that no two rows of a card touch.
 * Every number is in the card's own pixels (origin at its top-left corner).
 */

/** Left edge of a card's right-hand column; the chest on its shelf fills the 236 px before it. */
export const COL = 236;
/** The open button, the "open all" button under it (a step quieter and shorter) and the space between buttons in a column. */
export const OPEN_H = 96;
export const PILE_H = 88;
/** The single buy tag and the "buy 10" tag under it (the same height, so the tags are alike and each keeps the 88 px touch size). */
export const BUY_H = 88;
export const PACK_H = 88;
export const ROW_GAP = 12;

/** What the main row of a paid chest card is: the open button of a chest the player owns, or the buy tag. */
export type PaidAction = 'open' | 'buy';

export interface PaidCardInput {
  gold: boolean;
  /** Height of the note under the gold card's bonus bar (one or two lines of 32 px, measured from the real text). */
  noteH: number;
  action: PaidAction;
  /** The "open all" button is shown under the open button. */
  pile: boolean;
}

export interface PaidRow {
  id: 'main' | 'pile' | 'pack';
  /** Centre line and the extent of the row. */
  y: number;
  top: number;
  bottom: number;
}

export interface PaidCardLayout {
  h: number;
  /** Where the card's text and bar end: the first row starts below this. */
  infoBottom: number;
  /** The base line the chest's shelf is hung from: near the bottom of an open card, in the middle of a buy card (it is tall now and the chest would hang far from the title). */
  shelfBase: number;
  /** The rows, top to bottom: the open button or the buy tag, then the "open all" button or the "buy 10" tag. */
  rows: PaidRow[];
}

/** The line of text under the title (silver) takes at most two lines of 32 px from y = 108. */
const SILVER_INFO_BOTTOM = 108 + 64;
/** The gold card's note starts at y = 234, under its bonus bar. */
const GOLD_NOTE_TOP = 234;

/** Space left under the last row. */
const BOTTOM_PAD = 10;

/**
 * Height and rows of a silver or gold card. In the buy state a second tag ("buy 10") sits under the single buy tag and the card
 * grows by its height and one gap; in the open state the card is as tall as it always was (plus the "open all" row from two chests on).
 */
export function paidCardLayout(o: PaidCardInput): PaidCardLayout {
  const base = o.gold ? Math.max(372, 346 + Math.ceil(o.noteH)) : 296;
  const second = o.action === 'open' ? (o.pile ? PILE_H : 0) : PACK_H;
  const extra = second > 0 ? second + ROW_GAP : 0;
  const h = base + extra;
  const mainH = o.action === 'open' ? OPEN_H : BUY_H;
  // The main row keeps its place from the top of the card (its bottom is 10 px above the second row's top plus the gap).
  const mainY = h - 58 - extra;
  const rows: PaidRow[] = [{ id: 'main', y: mainY, top: mainY - mainH / 2, bottom: mainY + mainH / 2 }];
  if (second > 0) {
    // The second row ends where the card's bottom padding starts: its centre is half its height above that.
    const pad = o.action === 'open' ? BOTTOM_PAD : BOTTOM_PAD + (OPEN_H - BUY_H) / 2;
    const y = h - pad - second / 2;
    rows.push({ id: o.action === 'open' ? 'pile' : 'pack', y, top: y - second / 2, bottom: y + second / 2 });
  }
  return {
    h,
    infoBottom: o.gold ? GOLD_NOTE_TOP + Math.ceil(o.noteH) : SILVER_INFO_BOTTOM,
    shelfBase: o.action === 'open' ? h - 84 : Math.round(h / 2 + 54),
    rows,
  };
}
