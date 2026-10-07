/**
 * Where a speech bubble goes: above or below the thing it explains, whichever hides less. Pure, so the
 * rules are unit tested; the bubble itself is HintBubble.ts.
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
}

/** Gap kept to the screen edges and between the tail and the body's rounded corners. */
export const BUBBLE_MARGIN = 14;
const TAIL_INSET = 34;
/** A bubble that leaves the screen loses to any bubble that does not, however much that one covers. */
const OFF_SCREEN = 1000;

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

export function placeBubble(s: BubbleSpec): BubbleFit {
  const { target, w, h, bounds, arrow, avoid } = s;
  const cx = target.x + target.w / 2;
  const x = Math.min(Math.max(cx - w / 2, bounds.x + BUBBLE_MARGIN), Math.max(bounds.x + BUBBLE_MARGIN, bounds.x + bounds.w - BUBBLE_MARGIN - w));
  const tailX = Math.min(Math.max(cx - x, TAIL_INSET), Math.max(TAIL_INSET, w - TAIL_INSET));
  const aboveY = target.y - arrow - h;
  const belowY = target.y + target.h + arrow;
  const cost = (y: number): number => {
    const box: Rect = { x, y, w, h };
    let c = 0;
    const over = Math.max(0, bounds.y - y) + Math.max(0, y + h - (bounds.y + bounds.h));
    c += over * OFF_SCREEN;
    for (const a of avoid) if (!isTarget(a, target)) c += a.weight * overlapArea(box, a);
    return c;
  };
  const above = cost(aboveY);
  const below = cost(belowY);
  const takeAbove = s.prefer === 'above' ? above <= below : above < below;
  return takeAbove ? { above: true, x, y: aboveY, tailX } : { above: false, x, y: belowY, tailX };
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
  const x = Math.min(Math.max(cx - w / 2, bounds.x + BUBBLE_MARGIN), Math.max(bounds.x + BUBBLE_MARGIN, bounds.x + bounds.w - BUBBLE_MARGIN - w));
  const tailX = Math.min(Math.max(cx - x, TAIL_INSET), Math.max(TAIL_INSET, w - TAIL_INSET));
  if (target.y + target.h / 2 >= panelTop) {
    return { above: true, x, y: Math.max(bounds.y, panelTop - CARD_EDGE - arrow - h), tailX };
  }
  const tip = Math.min(panelTop - 20, Math.max(boardBottom - 10, panelTop - SHEET_REACH));
  const y = Math.max(bounds.y, Math.min(tip + arrow, panelTop + SHEET_ROOM - h, bounds.y + bounds.h - h));
  return { above: false, x, y, tailX };
}

/** The smallest rectangle holding both. */
export function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}
