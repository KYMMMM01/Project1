/** Pure geometry of the home shell: the top bar, the content area and the tab bar. */
import type { ContentArea } from '../contract';

/** Visible height of the bottom tab bar above the home-indicator inset (matches ui/TabBar). */
export const TAB_BAR_H = 128;
/** Height of the top bar's own rows: level row, gap, currency row, bottom padding, top padding. */
export const TOP_ROW_H = 88;
export const TOP_PILL_H = 72;
export const TOP_PAD_TOP = 8;
export const TOP_ROW_GAP = 6;
export const TOP_PAD_BOTTOM = 12;
export const TOP_BAR_CONTENT_H = TOP_PAD_TOP + TOP_ROW_H + TOP_ROW_GAP + TOP_PILL_H + TOP_PAD_BOTTOM;

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

/** Three equal currency pills across the width with the given margin and gap; returns the pill width. */
export function pillWidth(w: number, margin: number, gap: number, count: number): number {
  return Math.min(260, (w - margin * 2 - gap * (count - 1)) / count);
}

/** Share of the account level already earned, 0..1, safe against a zero-sized level. */
export function xpFraction(into: number, need: number): number {
  if (!(need > 0)) return 0;
  return Math.min(1, Math.max(0, into / need));
}
