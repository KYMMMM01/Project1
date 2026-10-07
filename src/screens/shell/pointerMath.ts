/** Pure geometry of the home pointer (the guidebook's "try it"): the window round a target and how the paw reaches in to touch it. */
import { overlapArea } from '@/view/hud/bubbleMath';
import { FROM_BELOW, placePaw, tipSpot, type Keep } from '@/view/hud/handMath';
import type { Point } from '@/view/hud/layoutMath';

export interface PointRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Room a tab keeps between what it scrolls to and the page's edges: the raised middle tab of the bar reaches 58 px up into the page. */
export const POINT_MARGIN = 84;

/** How far the window stands off the target, and how close it may come to the screen edge. */
const GROW = 10;
const EDGE = 6;

/** `target` grown by the window's margin and kept on screen, in whole pixels (so a target that did not move does not repaint). */
export function pointerRect(out: PointRect, target: PointRect, screenW: number, screenH: number): PointRect {
  const left = Math.max(EDGE, Math.round(target.x - GROW));
  const top = Math.max(EDGE, Math.round(target.y - GROW));
  const right = Math.min(screenW - EDGE, Math.round(target.x + target.w + GROW));
  const bottom = Math.min(screenH - EDGE, Math.round(target.y + target.h + GROW));
  out.x = left;
  out.y = top;
  out.w = Math.max(0, right - left);
  out.h = Math.max(0, bottom - top);
  return out;
}

/** The part of `target` that lies in `room`; a target that is out of it altogether becomes the point of `room` nearest to it. */
export function visiblePart(target: PointRect, room: PointRect): PointRect {
  const x = Math.max(target.x, room.x);
  const y = Math.max(target.y, room.y);
  const right = Math.min(target.x + target.w, room.x + room.w);
  const bottom = Math.min(target.y + target.h, room.y + room.h);
  if (right > x && bottom > y) return { x, y, w: right - x, h: bottom - y };
  const cx = target.x + target.w / 2;
  const cy = target.y + target.h / 2;
  return { x: Math.min(Math.max(cx, room.x), room.x + room.w), y: Math.min(Math.max(cy, room.y), room.y + room.h), w: 0, h: 0 };
}

/** Where the paw's tip lands and how the art is turned (Hand.place). */
export interface Paw {
  x: number;
  y: number;
  rotation: number;
}

/** A target at least this wide is a card with a label: the tip goes off its middle. */
const WIDE = 150;
/** What a candidate spot costs for coming after the first one (a paw on the label costs far more). */
const SPOT_COST = 300;
const TEXT_WEIGHT = 3;
/** A tip on a line of text is worse than any paw body over it. */
const TIP_ON_TEXT = 6000;
const OUTSIDE_COST = 40;

/** Spots of a target the tip may land on, the most natural first: where tipSpot puts it, then the lower right, the lower left and the middle of the lower edge. */
function spots(seen: PointRect): Point[] {
  const first = tipSpot(seen).tip;
  if (seen.w < WIDE) return [first];
  const at = (u: number, v: number): Point => ({ x: seen.x + seen.w * u, y: seen.y + seen.h * v });
  return [first, at(0.88, 0.72), at(0.12, 0.72), at(0.5, 0.86)];
}

function holds(r: PointRect, p: Point): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

/**
 * How the paw reaches a target: its tip on the part of the target the page shows, the whole paw inside `room` (the page between the bars,
 * so the screen edge and the tab bar never cut it), from below at a natural slant when it can, and off `texts` (the target's own lines of
 * writing) as far as the target lets it.
 */
export function pawFor(target: PointRect, room: PointRect, texts: readonly PointRect[]): Paw {
  const seen = visiblePart(target, room);
  const keep: Keep[] = texts.map((r) => ({ ...r, weight: TEXT_WEIGHT }));
  let best: Paw = { x: seen.x + seen.w / 2, y: seen.y + seen.h / 2, rotation: 0 };
  let bestCost = Infinity;
  const tips = spots(seen);
  for (let i = 0; i < tips.length; i++) {
    const tip = tips[i] as Point;
    const pose = placePaw({ tips: [tip], bounds: room, keep, prefer: FROM_BELOW });
    let cost = i * SPOT_COST + (pose.box.w * pose.box.h - overlapArea(pose.box, room)) * OUTSIDE_COST;
    for (const k of keep) cost += k.weight * overlapArea(pose.box, k) + (holds(k, tip) ? TIP_ON_TEXT : 0);
    if (cost < bestCost) {
      bestCost = cost;
      best = { x: tip.x, y: tip.y, rotation: pose.rotation };
    }
  }
  return best;
}
