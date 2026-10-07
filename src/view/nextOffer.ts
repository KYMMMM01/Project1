/**
 * The result page's "next" offer: how it is worded and where the three buttons sit. Pure, so the layout rules (every target 88 px
 * or more, nothing outside the bar, the primary above the two others) are checked without a renderer.
 */
import { t } from '@/core/i18n';
import type { NextRun } from './context';
import './strings';

/** Smallest touch target (kit rule), face height. */
export const MIN_TARGET = 88;

/** What the offer is: a new chapter, or the same chapter one butler level up. */
export type NextKind = 'chapter' | 'butler';

export function nextKind(current: { chapter: number }, next: Pick<NextRun, 'chapter'>): NextKind {
  return next.chapter === current.chapter ? 'butler' : 'chapter';
}

export interface NextText {
  /** The button's label. */
  label: string;
  /** A smaller second line, or '' (a chapter at a butler level above 0 says the level; a butler step says the chapter). */
  sub: string;
}

/** "Next: Chapter 2 Kitchen" / "Next: Butler 2" (same chapter), with the missing half on the second line. */
export function nextText(current: { chapter: number }, next: Pick<NextRun, 'chapter' | 'stake'>): NextText {
  const name = t(`chapter.${next.chapter}.name`);
  if (nextKind(current, next) === 'butler') {
    return { label: t('view.next.step', { n: next.stake }), sub: t('view.next.chapter', { n: next.chapter, name }) };
  }
  return { label: t('view.next.go', { n: next.chapter, name }), sub: next.stake > 0 ? t('view.next.butler', { n: next.stake }) : '' };
}

/** A button's face rectangle in the action bar's own space (origin = middle of the bar). */
export interface BarBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ResultBar {
  /** The bar's usable height for the scaffold. */
  height: number;
  /** The wide primary button; null when nothing is offered. */
  next: BarBox | null;
  retry: BarBox;
  home: BarBox;
}

/** Bar height of a page without an offer (Home and Retry in one row) and of one with it (a wide primary over two smaller buttons). */
export const BAR_H_PLAIN = 170;
export const BAR_H_NEXT = 268;

const GAP = 16;

/**
 * Without an offer: Home 230 wide and Retry 400 wide in one row, as before. With one: the primary spans the bar, Retry and Home
 * share the row under it. `usable` is the width the bar can use (the screen less its side margins).
 */
export function resultBar(offered: boolean, usable: number): ResultBar {
  if (!offered) {
    const home = { w: 230, h: 108 };
    const retry = { w: 400, h: 124 };
    const total = home.w + GAP + retry.w;
    const left = -total / 2;
    return {
      height: BAR_H_PLAIN,
      next: null,
      home: { x: left + home.w / 2, y: 0, ...home },
      retry: { x: left + home.w + GAP + retry.w / 2, y: 0, ...retry },
    };
  }
  const w = Math.min(usable, 648);
  const half = (w - GAP) / 2;
  const top = { w, h: 116 };
  const low = { w: half, h: 92 };
  const topY = -62;
  const lowY = 72;
  return {
    height: BAR_H_NEXT,
    next: { x: 0, y: topY, ...top },
    home: { x: -(half / 2 + GAP / 2), y: lowY, ...low },
    retry: { x: half / 2 + GAP / 2, y: lowY, ...low },
  };
}
