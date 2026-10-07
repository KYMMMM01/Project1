/**
 * Where the tutorial's paw lies. The art (Hand.ts) is a cat's paw sticker whose origin is its tip and which points up when it is not
 * turned; a paw reaches in from one of four sides, tilted a little off the vertical like an arm, and what it covers decides which. Pure,
 * so the rules (fits the screen, keeps off what must stay readable, tip exactly on the spot) are unit tested.
 */
import { overlapArea } from './bubbleMath';
import type { Point, Rect } from './layoutMath';

/** Length of the paw on screen, from its tip to the end of the arm, and the width of its widest part. */
export const PAW_LENGTH = 140;
export const PAW_WIDTH = 78;

/** Which way the paw's arm trails away from its tip: from below (the usual pat) or from above, to the right or to the left. */
export type PawFrom = 'lowerRight' | 'lowerLeft' | 'upperRight' | 'upperLeft';

/** Tilts tried, in order of preference, in radians off the vertical (25, 15, 35 degrees). */
const TILTS = [0.44, 0.26, 0.61] as const;

/** Gap kept between the paw and the screen's edge. */
const EDGE = 14;
/** How much of what the HUD keeps readable (cats, buttons, the lane) the paw may lie on, next to its own preference for the usual side. */
const SOFT = 0.2;

/** The area a paw must stay inside: the screen's safe area, a little in from its edges. */
export function pawBounds(l: { w: number; h: number; safeTop: number; safeBottom: number }): Rect {
  return { x: EDGE, y: l.safeTop + EDGE, w: l.w - EDGE * 2, h: l.h - l.safeBottom - l.safeTop - EDGE * 2 };
}

/** The HUD's list of what a bubble should not cover, weighed for a paw (which may lie on those where it must, unlike on a label or a card). */
export function soften(list: readonly Keep[]): Keep[] {
  return list.map((k) => ({ ...k, weight: k.weight * SOFT }));
}

/** A rectangle that should stay readable under the paw; `weight` says how much it matters (a label counts more than a cat). */
export interface Keep extends Rect {
  weight: number;
}

/** Rotation of the art (which points up at 0, positive is clockwise) so the arm trails away to `from`, `tilt` radians off the vertical. */
export function pawRotation(from: PawFrom, tilt: number): number {
  switch (from) {
    case 'lowerRight':
      return -tilt;
    case 'lowerLeft':
      return tilt;
    case 'upperRight':
      return Math.PI + tilt;
    case 'upperLeft':
      return Math.PI - tilt;
  }
}

/** The rectangle that holds the whole paw lying with its tip at `tip` and turned by `rotation`. */
export function pawBox(tip: Point, rotation: number): Rect {
  // The tip points along (sin, -cos); the arm trails the other way.
  const ux = Math.sin(rotation);
  const uy = -Math.cos(rotation);
  const nx = -uy * (PAW_WIDTH / 2);
  const ny = ux * (PAW_WIDTH / 2);
  const ex = tip.x - ux * PAW_LENGTH;
  const ey = tip.y - uy * PAW_LENGTH;
  const xs = [tip.x + nx, tip.x - nx, ex + nx, ex - nx];
  const ys = [tip.y + ny, tip.y - ny, ey + ny, ey - ny];
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export interface PawSpec {
  /** Where the tip has to be: one spot for a tap, the start and the end of a drag (the paw keeps its turn all the way). */
  tips: readonly Point[];
  /** The area the paw must stay inside. */
  bounds: Rect;
  keep: readonly Keep[];
  /** Sides to come from, the most natural first. */
  prefer: readonly PawFrom[];
}

export interface PawPose {
  from: PawFrom;
  rotation: number;
  /** Everything the paw covers on the way, tip to tip. */
  box: Rect;
}

/** Part of `box` that lies outside `bounds`. */
function outside(box: Rect, bounds: Rect): number {
  return box.w * box.h - overlapArea(box, bounds);
}

const PREFER_COST = 400;
const TILT_COST = 60;
const OUTSIDE_COST = 40;

/**
 * The way the paw comes in: the side and tilt that keep it on the screen first, off what must stay readable second, and the most natural
 * one (from below, a tilt of about 25 degrees) when everything else is equal. The tip is where the caller put it, whatever the choice.
 */
export function placePaw(s: PawSpec): PawPose {
  let best: PawPose | null = null;
  let bestCost = Infinity;
  s.prefer.forEach((from, i) => {
    TILTS.forEach((tilt, j) => {
      const rotation = pawRotation(from, tilt);
      let box: Rect | null = null;
      let cost = i * PREFER_COST + j * TILT_COST;
      for (const tip of s.tips) {
        const b = pawBox(tip, rotation);
        cost += outside(b, s.bounds) * OUTSIDE_COST;
        for (const k of s.keep) cost += k.weight * overlapArea(b, k);
        box = box ? union(box, b) : b;
      }
      if (box && cost < bestCost) {
        bestCost = cost;
        best = { from, rotation, box };
      }
    });
  });
  return best ?? { from: 'lowerRight', rotation: pawRotation('lowerRight', TILTS[0]), box: pawBox(s.tips[0] ?? { x: 0, y: 0 }, pawRotation('lowerRight', TILTS[0])) };
}

function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/**
 * The spot of a control the paw's tip lands on: off the centre where its label is when the control is wide enough to have room on one
 * side of it, the upper right of a small one (an icon has no label to keep clear). Also the label's own rectangle, to keep the paw off it.
 */
export function tipSpot(r: Rect): { tip: Point; label: Rect } {
  const label = { x: r.x + r.w * 0.2, y: r.y + r.h * 0.2, w: r.w * 0.6, h: r.h * 0.6 };
  const wide = r.w >= 150;
  // An icon has no label: the pad rests on its upper right, so the paw does not hide the picture.
  return { tip: wide ? { x: r.x + r.w * 0.88, y: r.y + r.h * 0.28 } : { x: r.x + r.w * 0.6, y: r.y + r.h * 0.42 }, label };
}

/** The usual order: from below to the right, to the left, then from above. */
export const FROM_BELOW: readonly PawFrom[] = ['lowerRight', 'lowerLeft', 'upperRight', 'upperLeft'];

/** For a drag: the arm trails behind the carried thing, so a drag to the right comes from the left, a drag up comes from below and a drag down from above. */
export function dragPrefer(a: Point, b: Point): readonly PawFrom[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dy) > Math.abs(dx)) return dy < 0 ? FROM_BELOW : ['upperRight', 'upperLeft', 'lowerRight', 'lowerLeft'];
  return dx >= 0 ? ['lowerLeft', 'lowerRight', 'upperLeft', 'upperRight'] : ['lowerRight', 'lowerLeft', 'upperRight', 'upperLeft'];
}
