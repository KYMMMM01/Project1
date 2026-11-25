/** Pure geometry of the home shell: the top bar, the content area and the tab bar. */
import type { ContentArea } from '../contract';

/** Visible height of the bottom tab bar above the home-indicator inset (matches ui/TabBar). */
export const TAB_BAR_H = 128;
/** Height of the top bar's own rows: level row, gap, currency row, bottom padding, top padding. */
export const TOP_ROW_H = 92;
export const TOP_PILL_H = 72;
export const TOP_PAD_TOP = 8;
export const TOP_ROW_GAP = 12;
export const TOP_PAD_BOTTOM = 12;
export const TOP_BAR_CONTENT_H = TOP_PAD_TOP + TOP_ROW_H + TOP_ROW_GAP + TOP_PILL_H + TOP_PAD_BOTTOM;

/** The profile circle, in the first row (origin = the row's centre line): icon, the ring around it, the level band over the icon's lower edge. */
export const ICON_D = 80;
export const FRAME_D = 104;
export const BAND_H = 28;
export const BAND_CY = 38;
/** A drawn frame fits this box round the icon's centre: the badge's 112 slot across, and up to the bar's top edge (54 above the row's centre line, as far as the first pill's top is below it). */
export const FRAME_BOX_W = 112;
export const FRAME_BOX_H = 2 * (TOP_PAD_TOP + TOP_ROW_H / 2);
/** The name plate and the thin XP strip under it, in the slot the XP bar had (a 24 px side, a 112 badge slot, the two 88 buttons and a 32 gap leave 352). */
export const PLATE_W = 352;
export const PLATE_H = 60;
export const PLATE_TEXT_W = 300;
export const STRIP_H = 16;
export const STRIP_GAP = 6;
/** A drawn plate (tools/make_cosmetics.py): its 800 x 200 canvas has its 704 x 120 body in the middle, so drawn at this size the body covers the 352 x 60 plate. */
export const PLATE_ART_W = (PLATE_W * 800) / 704;
export const PLATE_ART_H = (PLATE_H * 200) / 120;

export interface ShellRects {
  /** Height of the top bar including the safe-area inset. */
  topBarH: number;
  /** Height of the tab bar including the home-indicator inset. */
  tabBarH: number;
  area: ContentArea;
}

export function shellLayout(w: number, h: number, safeTop: number, safeBottom: number): ShellRects {
  const topBarH = safeTop + TOP_BAR_CONTENT_H;
  const tabBarH = TAB_BAR_H + safeBottom;
  return { topBarH, tabBarH, area: { x: 0, y: topBarH, w, h: Math.max(0, h - topBarH - tabBarH) } };
}

/**
 * The currency row: equal pills whose visible left edge (the coin sticker, which sticks out `overhang`
 * past the strip) and right end both sit `side` from the screen edges. `x0` is the first strip's left end.
 * The gap must clear the next sticker, or it lands on the torn end and "+" of the pill before it.
 */
export function pillRow(w: number, side: number, gap: number, overhang: number, count: number): { pw: number; x0: number } {
  const x0 = side + overhang;
  const pw = Math.min(260, (w - side - x0 - gap * (count - 1)) / count);
  return { pw, x0 };
}

export interface LineSlots {
  /** Centre of each photo along the row. */
  centres: number[];
  /** Centre of the arrow between photo i and i + 1. */
  arrows: number[];
  /** Width of the last gap, the one that carries the awaken caption. */
  lastGap: number;
}

/**
 * Places `count` photos of side `photo` along a row of `width`: the merge arrows get a narrow `gap`
 * each and the last arrow (awaken, the only one with a caption) the room that is left. A row too short
 * for that spreads the gaps evenly.
 */
export function classLineSlots(width: number, count: number, photo: number, gap: number): LineSlots {
  const gaps = Array.from({ length: Math.max(0, count - 1) }, () => gap);
  const spare = width - count * photo - gap * Math.max(0, count - 2);
  if (gaps.length > 0) {
    const even = (width - count * photo) / gaps.length;
    if (spare >= gap) gaps[gaps.length - 1] = spare;
    else gaps.fill(Math.max(0, even));
  }
  const centres: number[] = [];
  const arrows: number[] = [];
  let x = 0;
  for (let i = 0; i < count; i++) {
    centres.push(x + photo / 2);
    x += photo;
    if (i < gaps.length) {
      const g = gaps[i] as number;
      arrows.push(x + g / 2);
      x += g;
    }
  }
  return { centres, arrows, lastGap: gaps[gaps.length - 1] ?? 0 };
}

/**
 * Room each caption under a row of photos may use: its own natural width, or less when it would run
 * into a neighbour's caption (kept at its natural width, `gap` apart) or out of the row. A caption keeps
 * the centre of its photo, so it can use twice the distance to the nearest neighbouring edge.
 */
export function captionRooms(centres: readonly number[], widths: readonly number[], rowWidth: number, gap: number): number[] {
  const at = (i: number): number => {
    const w = widths[i] as number;
    return Math.min(rowWidth - w / 2, Math.max(w / 2, centres[i] as number));
  };
  return centres.map((cx, i) => {
    const w = widths[i] as number;
    let room = Math.min(w, rowWidth);
    if (i > 0) room = Math.min(room, 2 * (cx - (at(i - 1) + (widths[i - 1] as number) / 2 + gap)));
    if (i < centres.length - 1) room = Math.min(room, 2 * (at(i + 1) - (widths[i + 1] as number) / 2 - gap - cx));
    return Math.max(0, room);
  });
}

/** Share of the account level already earned, 0..1, safe against a zero-sized level. */
export function xpFraction(into: number, need: number): number {
  if (!(need > 0) || Number.isNaN(into)) return 0;
  return Math.min(1, Math.max(0, into / need));
}

export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The part of a `srcW x srcH` picture that fills a `boxW x boxH` box without distortion: centred
 * across, and `focus` (0 = top, 1 = bottom) of the way down the spare height. A "photo" of a background.
 */
export function coverCrop(srcW: number, srcH: number, boxW: number, boxH: number, focus = 0.5): Crop {
  if (!(srcW > 0 && srcH > 0 && boxW > 0 && boxH > 0)) return { x: 0, y: 0, w: Math.max(0, srcW), h: Math.max(0, srcH) };
  const scale = Math.max(boxW / srcW, boxH / srcH);
  const w = boxW / scale;
  const h = boxH / scale;
  const f = Math.min(1, Math.max(0, focus));
  return { x: (srcW - w) / 2, y: (srcH - h) * f, w, h };
}
