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
  /** Wave label and timer bar. */
  wave: Rect;
  /** Next-wave preview strip. */
  preview: Rect;
  /** Row of owned toys. */
  toys: Rect;
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
    // The bar's round icon hangs 43 px off its left end, so the bar starts that far clear of the pause button.
    gauge: { x: 150, y: row1Y - 25, w: 440, h: 50 },
    wave: { x: SIDE, y: row2Y - rowH / 2, w: 212, h: rowH },
    preview: { x: 236, y: row2Y - rowH / 2, w: 208, h: rowH },
    toys: { x: 452, y: row2Y - rowH / 2, w: HUD_W - SIDE - 452, h: rowH },
    row2Y,
  };
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

/** Boss bar: tucked into the slack between the top area and the field when there is room, else just under the top area. */
export function bossBarY(l: BattleLayout, barH: number): number {
  const under = l.safeTop + l.topH + 4;
  const fit = l.fieldY - barH - 4;
  return Math.max(under, fit);
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
