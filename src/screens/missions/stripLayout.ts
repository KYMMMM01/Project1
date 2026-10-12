/**
 * Pure geometry of the chest card (ChestStrip): where the title, the reset timer, the points bar, the chest plate, the reward
 * and the two buttons go, from the widths that were measured on the real labels and chips. Nothing here knows a language: a longer
 * word or a bigger reward moves things, it never lets one part run under another.
 *
 * Rows, top to bottom: the title pill (left) and the timer (right); the points bar with the reward chips under it and the chest plate
 * at the right end; Claim and "See odds" side by side on a row of their own. A reward too wide for the space beside the plate
 * drops to a row of its own under the bar and the plate.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Gutter between the card edge and its content, and the card's painted border (the mustard backing of a featured sheet). */
export const STRIP_SIDE = 32;
export const STRIP_BORDER = 9;
/** Air between neighbours: side by side, between rows, and between the bar and the reward under it. */
export const STRIP_GAP_X = 16;
export const STRIP_GAP_Y = 18;
export const STRIP_GAP_BAR = 14;
/** Air between the card's top edge and the title row, and between the lowest button's shadow and the card's bottom edge. */
export const STRIP_TOP = 20;
export const STRIP_BOTTOM = 20;

export const STRIP_PLATE = 128;
export const STRIP_BAR_H = 52;
/** Claim takes this share of the button row when both labels are short. */
export const STRIP_CLAIM_SHARE = 0.58;

/** Padding a Button keeps on each side of its label: `18 + 0.35 x its corner radius` (a 88 px tall button has a 26 px corner). */
export function buttonPad(height: number): number {
  return 18 + Math.min(height * 0.3, 36) * 0.35;
}

/** The padlock a disabled Button hangs on its top-left corner reaches about 41 px in from the face's left edge (88 px tall); this adds a little air. */
const LOCK_REACH = 46;

/**
 * Narrowest a labelled Button can be for `labelW` of text to sit between its padding without the padlock of the disabled state
 * touching the glyphs, and never narrower than `min`.
 */
export function buttonWidthFor(labelW: number, height: number, min: number, locked: boolean): number {
  const side = locked ? Math.max(buttonPad(height), LOCK_REACH + 8) : buttonPad(height);
  return Math.max(min, Math.ceil(labelW + side * 2));
}

/** Split `inner` between Claim and "See odds" (`gap` apart): each keeps at least its natural width, Claim gets the larger share. Both shrink together when even the natural widths do not fit. */
export function splitButtons(inner: number, gap: number, claimNat: number, oddsNat: number): { claim: number; odds: number } {
  const room = Math.max(0, inner - gap);
  if (claimNat + oddsNat >= room) {
    const k = room / Math.max(1, claimNat + oddsNat);
    return { claim: claimNat * k, odds: oddsNat * k };
  }
  let claim = Math.max(claimNat, room * STRIP_CLAIM_SHARE);
  let odds = room - claim;
  if (odds < oddsNat) {
    odds = oddsNat;
    claim = room - odds;
  }
  return { claim, odds };
}

export interface StripMeasure {
  /** Card width. */
  w: number;
  /** The title pill at the width its text asks for, and the timer tag (0 x 0 on a card without one). */
  titleW: number;
  titleH: number;
  timerW: number;
  timerH: number;
  /** The reward row at its natural size. */
  rewardW: number;
  rewardH: number;
  /** Natural widths of Claim and "See odds", and the height of a button (its shadow included). */
  claimW: number;
  oddsW: number;
  buttonH: number;
}

export interface StripPlan {
  /** Card height. */
  h: number;
  /** Where the parts sit (top-left corner and size). The title's `w` is the widest its pill may be. */
  title: Rect;
  timer: Rect;
  bar: Rect;
  plate: Rect;
  reward: Rect;
  /** Uniform scale the reward row needs to fit its room (1 unless the row is wider than the whole card). */
  rewardScale: number;
  claim: Rect;
  odds: Rect;
  /** True when the reward sits under the bar, beside the chest plate. */
  rewardBeside: boolean;
}

/** Everything the card places, from what was measured. The rects of different parts never overlap and always keep their gaps. */
export function planStrip(m: StripMeasure): StripPlan {
  const inner = m.w - STRIP_SIDE * 2;
  const headH = Math.max(m.titleH, m.timerH);
  const headY = STRIP_TOP;
  const titleMax = m.timerW > 0 ? inner - m.timerW - STRIP_GAP_X : inner;
  const titleW = Math.min(m.titleW, titleMax);
  const title: Rect = { x: STRIP_SIDE, y: headY + (headH - m.titleH) / 2, w: titleW, h: m.titleH };
  const timer: Rect = { x: m.w - STRIP_SIDE - m.timerW, y: headY + (headH - m.timerH) / 2, w: m.timerW, h: m.timerH };

  const bodyY = headY + headH + STRIP_GAP_Y;
  const colW = inner - STRIP_PLATE - STRIP_GAP_X;
  const rewardBeside = m.rewardW <= colW;
  const rewardScale = rewardBeside ? 1 : Math.min(1, inner / Math.max(1, m.rewardW));
  const rewardW = m.rewardW * rewardScale;
  const rewardH = m.rewardH * rewardScale;
  const plateX = m.w - STRIP_SIDE - STRIP_PLATE;

  let bar: Rect;
  let plate: Rect;
  let reward: Rect;
  let bodyH: number;
  if (rewardBeside) {
    const colH = STRIP_BAR_H + STRIP_GAP_BAR + rewardH;
    bodyH = Math.max(STRIP_PLATE, colH);
    const colY = bodyY + (bodyH - colH) / 2;
    bar = { x: STRIP_SIDE, y: colY, w: colW, h: STRIP_BAR_H };
    reward = { x: STRIP_SIDE, y: colY + STRIP_BAR_H + STRIP_GAP_BAR, w: rewardW, h: rewardH };
    plate = { x: plateX, y: bodyY + (bodyH - STRIP_PLATE) / 2, w: STRIP_PLATE, h: STRIP_PLATE };
  } else {
    bar = { x: STRIP_SIDE, y: bodyY + (STRIP_PLATE - STRIP_BAR_H) / 2, w: colW, h: STRIP_BAR_H };
    plate = { x: plateX, y: bodyY, w: STRIP_PLATE, h: STRIP_PLATE };
    reward = { x: STRIP_SIDE, y: bodyY + STRIP_PLATE + STRIP_GAP_BAR, w: rewardW, h: rewardH };
    bodyH = STRIP_PLATE + STRIP_GAP_BAR + rewardH;
  }

  const rowY = bodyY + bodyH + STRIP_GAP_Y;
  const split = splitButtons(inner, STRIP_GAP_X, m.claimW, m.oddsW);
  const claim: Rect = { x: STRIP_SIDE, y: rowY, w: split.claim, h: m.buttonH };
  const odds: Rect = { x: STRIP_SIDE + split.claim + STRIP_GAP_X, y: rowY, w: split.odds, h: m.buttonH };
  const h = rowY + m.buttonH + STRIP_BORDER + STRIP_BOTTOM;
  return { h, title, timer, bar, plate, reward, rewardScale, claim, odds, rewardBeside };
}
