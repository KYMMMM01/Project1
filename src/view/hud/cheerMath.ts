/**
 * Where the "nice!" sticker lands. Pure: it takes the rectangles of everything it must not cover and picks the free spot nearest the
 * thing the player has just done; when nothing is free it picks the one that covers least. A sticker never lies on another element
 * (a lesson's note, a control, a cat, the result chips), which is why it is not simply put over its target.
 */
import { overlapArea, type Weighted } from './bubbleMath';
import type { BattleLayout } from '../context';
import { skipRect, topRects, type Point, type Rect } from './layoutMath';

/** Overlaps smaller than this (px squared) are rounding, not covering. */
const TOUCH = 24;
/** One px of overlap costs this many px of distance: any real overlap loses to any free spot, however far (within the screen). */
const COVER = 400;
/** Distance kept between the sticker and its target when it lies beside it. */
const BESIDE = 10;
/** Step of the grid of candidate spots laid over the whole screen: what the rings round the target miss (a free stretch of the board, say). */
const GRID = 36;
/** A grid spot costs this many px more than a spot lined up with the target, so the sticker only leaves the target's own lines when they are taken. */
const OFF_LINE = 40;
/** Extra rings of candidate spots, in px from the target's edge. */
const RINGS: readonly number[] = [0, 70, 150, 260, 400];

export interface CheerSpec {
  /** What the player just used, or null for a lesson with no control of its own (the sticker then starts from `home`). */
  target: Rect | null;
  /** Where to start from when there is no target. */
  home: Point;
  /** Size of the sticker at its largest (it lands big and settles) and the room it needs to lift off. */
  w: number;
  h: number;
  /** The screen area it must stay inside. */
  bounds: Rect;
  /** Everything it should keep off, each with how much covering it costs. */
  keep: readonly Weighted[];
}

/** Total weighted overlap of a `w x h` sticker centred at (x, y) with what must stay clear (the target counts too, lightly). */
function cover(x: number, y: number, spec: CheerSpec): number {
  const box: Rect = { x: x - spec.w / 2, y: y - spec.h / 2, w: spec.w, h: spec.h };
  let sum = 0;
  for (const k of spec.keep) {
    const a = overlapArea(box, k);
    if (a >= TOUCH) sum += a * k.weight;
  }
  if (spec.target) {
    const a = overlapArea(box, spec.target);
    if (a >= TOUCH) sum += a * 1.5;
  }
  // The part that leaves the screen is covering too, and a heavy one.
  const inside = overlapArea(box, spec.bounds);
  sum += (spec.w * spec.h - inside) * 5;
  return sum;
}

/** The sticker's centre: the cheapest of the spots around the target (above, below, beside it and the corners, at growing distances). */
export function cheerSpot(spec: CheerSpec): Point {
  const t = spec.target ?? { x: spec.home.x, y: spec.home.y, w: 0, h: 0 };
  const cx = t.x + t.w / 2;
  const cy = t.y + t.h / 2;
  const hw = t.w / 2 + spec.w / 2 + BESIDE;
  const hh = t.h / 2 + spec.h / 2 + BESIDE;
  let best: Point = { x: cx, y: cy - hh };
  let bestCost = Infinity;
  const tryAt = (px: number, py: number, extra = 0): void => {
    const x = Math.min(Math.max(px, spec.bounds.x + spec.w / 2), spec.bounds.x + spec.bounds.w - spec.w / 2);
    const y = Math.min(Math.max(py, spec.bounds.y + spec.h / 2), spec.bounds.y + spec.bounds.h - spec.h / 2);
    const cost = cover(x, y, spec) * COVER + Math.hypot(x - cx, y - cy) + extra;
    if (cost < bestCost) {
      bestCost = cost;
      best = { x, y };
    }
  };
  // A lesson with no control of its own puts the sticker on home itself.
  if (!spec.target) tryAt(cx, cy);
  for (const ring of RINGS) {
    const dx = hw + ring;
    const dy = hh + ring;
    // Above first, then below, the sides and the four corners: a tie goes to the earlier one.
    tryAt(cx, cy - dy);
    tryAt(cx, cy + dy);
    tryAt(cx + dx, cy);
    tryAt(cx - dx, cy);
    tryAt(cx + dx, cy - dy);
    tryAt(cx - dx, cy - dy);
    tryAt(cx + dx, cy + dy);
    tryAt(cx - dx, cy + dy);
  }
  for (let y = spec.bounds.y + spec.h / 2; y <= spec.bounds.y + spec.bounds.h - spec.h / 2; y += GRID) {
    for (let x = spec.bounds.x + spec.w / 2; x <= spec.bounds.x + spec.bounds.w - spec.w / 2; x += GRID) tryAt(x, y, OFF_LINE);
  }
  return best;
}

/** What covering a control, a line of writing, the chips' column or the note costs: more than anything else on the screen (see `Hud.avoidList`). */
export const STICKER_WALL = 8;
/** Side of the round pause and speed buttons' touch area. */
const ROUND_BUTTON = 88;

/**
 * The top row's own controls, which the HUD's list of rectangles for bubbles does not hold (a bubble is never put there): the enemy strip,
 * the pause and speed buttons (the speed button once it has arrived), the skip button while it is up, and the toy shelf once a toy is on it.
 */
export function topKeep(l: BattleLayout, shown: { speed: boolean; skip: boolean; toys: boolean }): Weighted[] {
  const top = topRects(l);
  const out: Weighted[] = [
    { ...top.gauge, weight: STICKER_WALL },
    { x: top.pause.x - ROUND_BUTTON / 2, y: top.pause.y - ROUND_BUTTON / 2, w: ROUND_BUTTON, h: ROUND_BUTTON, weight: STICKER_WALL },
  ];
  if (shown.toys) out.push({ ...top.toys, weight: STICKER_WALL });
  if (shown.speed) out.push({ x: top.speed.x - ROUND_BUTTON / 2, y: top.speed.y - ROUND_BUTTON / 2, w: ROUND_BUTTON, h: ROUND_BUTTON, weight: STICKER_WALL });
  if (shown.skip) out.push({ ...skipRect(top, shown.speed), weight: STICKER_WALL });
  return out;
}
