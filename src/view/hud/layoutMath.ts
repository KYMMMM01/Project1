/**
 * Where everything of the HUD sits, as pure rectangles. The scene hands over a BattleLayout (top area,
 * bottom panel, safe insets) and the HUD relays itself from these numbers on every 'layout' event.
 */
import { FIELD_H } from '@/game/geometry';
import type { BattleLayout } from '../context';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Design width the whole HUD is authored for. */
export const HUD_W = 720;
export const SIDE = 16;

export interface TopRects {
  /** The reserved strip (y from safeTop). */
  area: Rect;
  pause: Point;
  speed: Point;
  gauge: Rect;
  /** Phase label and countdown bar. */
  wave: Rect;
  /** Next-wave preview cards. */
  preview: Rect;
  /** Row of owned toys. */
  toys: Rect;
  /** Boss / elite strip: takes over the preview and toy area while one is alive. */
  boss: Rect;
  /** The countdown bar (a centre-origin bar of this size sits in it). */
  timer: Rect;
  /** Vertical centre of the second row. */
  row2Y: number;
}

export function topRects(l: BattleLayout): TopRects {
  const y0 = l.safeTop;
  const row1Y = y0 + Math.round(l.topH * 0.31);
  const row2Y = y0 + Math.round(l.topH * 0.76);
  const rowH = Math.round(l.topH * 0.44);
  return {
    area: { x: 0, y: y0, w: HUD_W, h: l.topH },
    pause: { x: SIDE + 44, y: row1Y },
    speed: { x: HUD_W - SIDE - 44, y: row1Y },
    // The skull sticker hangs 43 px off the strip's left end, so the strip starts that far clear of the pause button.
    gauge: { x: 150, y: row1Y - 29, w: 440, h: 58 },
    wave: { x: SIDE, y: row2Y - rowH / 2, w: 212, h: rowH },
    preview: { x: 236, y: row2Y - rowH / 2, w: 208, h: rowH },
    toys: { x: 452, y: row2Y - rowH / 2, w: HUD_W - SIDE - 452, h: rowH },
    // The boss sticker overhangs the strip's left end by about 30 px, which the countdown bar leaves free.
    boss: { x: 264, y: row2Y - 28, w: HUD_W - SIDE - 264, h: 66 },
    timer: { x: SIDE, y: row2Y + 2, w: 212, h: 34 },
    row2Y,
  };
}

/** The tutorial's skip button: the Korean label ("건너뛰기", four glyphs at 24 px) on its paper. Its touch target is 88 px tall, its paper 76 (the speed button's size). */
export const SKIP_W = 124;
export const SKIP_H = 88;
export const SKIP_FACE = 76;
/** Clear space kept between the skip button and the strip, and between it and the speed button. */
const SKIP_GAP = 12;

/**
 * Where the skip button lies in the top row: at the right end, in the slot the speed button will take, and one button's
 * width further in once the speed button has arrived. It never leaves the row, so nothing of the second row is covered.
 */
export function skipRect(r: TopRects, speedShown: boolean): Rect {
  const right = speedShown ? r.speed.x - 44 - SKIP_GAP : HUD_W - SIDE;
  return { x: right - SKIP_W, y: r.speed.y - SKIP_H / 2, w: SKIP_W, h: SKIP_H };
}

/** Width of the enemy strip: all of it, or what the skip button leaves (the strip's left end stays where it is). */
export function gaugeWidth(r: TopRects, skip: Rect | null): number {
  return skip ? Math.min(r.gauge.w, skip.x - SKIP_GAP - r.gauge.x) : r.gauge.w;
}

export interface BottomRects {
  /** Whole panel including the home-indicator inset, down to the screen edge. */
  panel: Rect;
  /** Y of the panel's top edge. */
  top: number;
  /** Offsets from the panel's top edge. */
  chipsY: number;
  currencyY: number;
  utilY: number;
  summonY: number;
  /** Selection sheet: it replaces the chips, currency and utility rows. */
  sheet: Rect;
  /** Sell strip along the top edge while a unit is dragged. */
  sell: Rect;
}

/** The SUMMON button (300 x 140) is the anchor: every other row is stacked upwards from it. */
export function bottomRects(l: BattleLayout): BottomRects {
  const top = l.h - l.safeBottom - l.bottomH;
  const summonY = l.bottomH - 98;
  const utilY = summonY - 126;
  const currencyY = utilY - 86;
  const chipsY = currencyY - 88;
  return {
    panel: { x: 0, y: top, w: HUD_W, h: l.h - top },
    top,
    chipsY,
    currencyY,
    utilY,
    summonY,
    sheet: { x: 12, y: 6, w: HUD_W - 24, h: summonY - 84 },
    sell: sellRect(l, top),
  };
}

/** How far above the panel the strip may reach on tall screens. */
const SELL_REACH = 120;

/**
 * The field part turns on "sell" below its own bottom edge, so the strip starts there: on tall
 * screens it reaches up into the gap above the panel, and the finger meets it as soon as it leaves the field.
 */
function sellRect(l: BattleLayout, panelTop: number): Rect {
  const fieldBottom = l.fieldY + FIELD_H;
  const y = Math.max(-SELL_REACH, Math.min(0, fieldBottom - panelTop));
  return { x: 0, y, w: HUD_W, h: 112 - y };
}

/** Slot width for `n` items in a strip `w` wide: each item gets up to `max`, shrinking to fit. */
export function slotWidth(n: number, w: number, max: number): number {
  if (n <= 0) return max;
  return Math.min(max, w / n);
}

/** Centre x of slot `i` of `n` equal slots starting at `x0`. */
export function slotCentre(i: number, slot: number, x0: number): number {
  return x0 + slot * (i + 0.5);
}

/** Largest scale (<= 1) at which content of `w x h` fits a screen with a margin. Used by popups that must survive 720 x 1280. */
export function fitScale(contentW: number, contentH: number, screenW: number, screenH: number, margin = 24): number {
  return Math.min(1, (screenW - margin) / contentW, (screenH - margin * 2) / contentH);
}

// ───────────────────────── the pick of three ─────────────────────────

/** The pick sheet in its own coordinates: three photo cards in a row under the sub line, each with a class line and a "merges into" pair of lines below. */
export const PICK = {
  w: 690,
  /** Card width (a card is 220 x 292 scaled by `scale`) and the gap between cards. */
  scale: 0.92,
  gap: 14,
  /** Centre line of the cards, and the sub line above them (centre y, half height, width of the widest text). */
  cardY: 330,
  subY: 84,
  subHalf: 34,
  subW: 610,
  /** Half height of a photo frame (292 x scale / 2): the text of a card starts under it. */
  frameHalf: 134,
  /** The pointing hand: scale, and how far its fingertip sits inside the frame's top edge. */
  hand: 0.8,
  tipInside: 22,
} as const;

/** Centre x of card `i` of `n`. */
export function pickCardX(i: number, n: number): number {
  return PICK.w / 2 + (i - (n - 1) / 2) * (220 * PICK.scale + PICK.gap);
}

/**
 * Where the tutorial's hand points at card `i` of `n`: the fingertip on the photo's top edge, the hand coming down from the band between
 * the sub line and the cards (it leans left on the first card so its body clears the sub line's left end). Returns the fingertip and the
 * rectangle the whole hand covers, so a test can say that no card's name, class or "merges into" line is under it.
 */
export function pickHand(i: number, n: number): { tip: Point; body: Rect } {
  const tip = { x: pickCardX(i, n) + (i === 0 ? -14 : 34), y: PICK.cardY - PICK.frameHalf + PICK.tipInside };
  // A hand turned half way round (fingertip down): the art spans x -36..62 and y 0..108 around its fingertip, scaled, then flipped.
  const s = PICK.hand;
  return { tip, body: { x: tip.x - 62 * s, y: tip.y - 108 * s, w: 98 * s, h: 108 * s } };
}
