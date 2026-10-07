/**
 * Where a speech bubble goes. One root decides every bubble of the battle (the hint and info bubbles, the lesson and first-encounter
 * cards): `settleBubble` puts the body on the side of its tip that has room, slides it along the screen edge, and moves the tail so it
 * still ends on the tip. `placeBubble` (which side hides less) and `placeCard` (which half of the screen a lesson lies on) only choose
 * where to start. Pure, so the rules are unit tested; the bubbles themselves are HintBubble.ts and LessonBubble.ts.
 */
import type { Rect } from './layoutMath';

/** A rectangle that should stay readable; `weight` says how much it matters (a cat counts more than a pill). */
export interface Weighted extends Rect {
  weight: number;
}

export interface BubbleSpec {
  /** What the bubble points at. */
  target: Rect;
  w: number;
  h: number;
  /** The screen area a bubble must stay inside. */
  bounds: Rect;
  /** Length of the tail between the bubble and the target. */
  arrow: number;
  /** Side to take when both are equally good. */
  prefer: 'above' | 'below';
  avoid: readonly Weighted[];
}

export interface BubbleFit {
  above: boolean;
  /** Top-left of the bubble body. */
  x: number;
  y: number;
  /** Tail position inside the body. */
  tailX: number;
  /** Length of the tail, from the body's edge to the tip: the arrow, or more when the screen's edge held the body back. */
  tail: number;
}

/** Gap kept to the screen edges and between the tail and the body's rounded corners. */
export const BUBBLE_MARGIN = 14;
const TAIL_INSET = 34;
/** Shortest tail that still reads as one: a body closer to its tip than this lies on what it points at. */
const MIN_TAIL = 12;
/** A bubble the screen's edge had to push away from where it belongs loses to any bubble that was not pushed, however much that one covers. */
const OFF_SCREEN = 1000;
/** A bubble that lies on its own tip loses to any that does not. */
const ON_TIP = 1e6;

export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function holds(box: Rect, x: number, y: number): boolean {
  return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
}

/** True when `box` is the target, part of it, or contains it: covering it is the point, not a cost. */
function isTarget(box: Rect, target: Rect): boolean {
  return holds(target, box.x + box.w / 2, box.y + box.h / 2) || holds(box, target.x + target.w / 2, target.y + target.h / 2);
}

/** `v` kept inside [lo, hi]; a range that is too narrow pins to `lo`. */
function pin(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), Math.max(lo, hi));
}

export interface Settled extends BubbleFit {
  /** The body keeps clear of the tip: a tail of at least MIN_TAIL. */
  ok: boolean;
  /** How far the screen's edge moved the body from where it wanted to be. */
  shift: number;
}

/**
 * The root of every bubble's placement: a body of `w x h` on the `above` or below side of the point (`tipX`, `tipY`) its tail ends on, kept
 * inside `bounds` whatever the tip and however tall the text: it slides along the edge, and the tail follows so it still ends on the tip.
 */
export function settleBubble(tipX: number, tipY: number, above: boolean, w: number, h: number, bounds: Rect, arrow: number): Settled {
  const x = pin(tipX - w / 2, bounds.x + BUBBLE_MARGIN, bounds.x + bounds.w - BUBBLE_MARGIN - w);
  const tailX = pin(tipX - x, TAIL_INSET, w - TAIL_INSET);
  const want = above ? tipY - arrow - h : tipY + arrow;
  const y = pin(want, bounds.y, bounds.y + bounds.h - h);
  const tail = above ? tipY - (y + h) : y - tipY;
  return { above, x, y, tailX, tail, ok: tail >= MIN_TAIL, shift: Math.abs(y - want) };
}

/** The better of two settled bubbles: one that clears its tip, then the one the edge pushed least. */
function better(a: Settled, b: Settled): Settled {
  if (a.ok !== b.ok) return a.ok ? a : b;
  return b.shift < a.shift ? b : a;
}

function strip(f: Settled): BubbleFit {
  return { above: f.above, x: f.x, y: f.y, tailX: f.tailX, tail: f.tail };
}

export function placeBubble(s: BubbleSpec): BubbleFit {
  const { target, w, h, bounds, arrow, avoid } = s;
  const cx = target.x + target.w / 2;
  const cost = (fit: Settled): number => {
    const box: Rect = { x: fit.x, y: fit.y, w, h };
    let c = fit.shift * OFF_SCREEN + (fit.ok ? 0 : ON_TIP);
    for (const a of avoid) if (!isTarget(a, target)) c += a.weight * overlapArea(box, a);
    return c;
  };
  const above = settleBubble(cx, target.y, true, w, h, bounds, arrow);
  const below = settleBubble(cx, target.y + target.h, false, w, h, bounds, arrow);
  const a = cost(above);
  const b = cost(below);
  const takeAbove = s.prefer === 'above' ? a <= b : a < b;
  return strip(takeAbove ? above : below);
}

export interface CardSpec {
  /** What the lesson points at. */
  target: Rect;
  w: number;
  h: number;
  bounds: Rect;
  arrow: number;
  /** Top edge of the bottom panel, and bottom edge of the board. */
  panelTop: number;
  boardBottom: number;
}

/** Gap between a card lying over the board and the panel under it, beyond its tail. */
const CARD_EDGE = 6;
/** How far a card lying over the sheet may sit below the panel's top edge: the summon button starts at 284, and a card never covers it. */
const SHEET_ROOM = 280;
/** How far above the panel a card over the sheet may reach on a tall screen, so it stays near the board it explains. */
const SHEET_REACH = 150;

/**
 * Where a lesson card goes: on the half of the screen its target is not on. A lesson about a control of the bottom panel puts its card over
 * the board, just above the panel (tail down), so the control and its neighbours stay in sight; a lesson about the board or the top row puts
 * it over the sheet, right under the board (tail up), so the cats and the lane stay in sight. The spotlight and the hand do the exact pointing.
 */
export function placeCard(s: CardSpec): BubbleFit {
  const { target, w, h, bounds, arrow, panelTop, boardBottom } = s;
  const cx = target.x + target.w / 2;
  if (target.y + target.h / 2 >= panelTop) {
    const fit = settleBubble(cx, panelTop - CARD_EDGE, true, w, h, bounds, arrow);
    // The panel's top edge is out of reach (a card taller than the room over the board): the card lies below its target instead.
    return strip(fit.ok ? fit : better(fit, settleBubble(cx, target.y + target.h, false, w, h, bounds, arrow)));
  }
  const tip = Math.min(panelTop - 20, Math.max(boardBottom - 10, panelTop - SHEET_REACH), panelTop + SHEET_ROOM - h - arrow);
  const fit = settleBubble(cx, tip, false, w, h, bounds, arrow);
  return strip(fit.ok ? fit : better(fit, settleBubble(cx, target.y, true, w, h, bounds, arrow)));
}

/** The smallest rectangle holding both. */
export function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}
