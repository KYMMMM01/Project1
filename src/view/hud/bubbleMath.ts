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

/** The smallest rectangle holding both. */
export function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}
