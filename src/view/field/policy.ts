/** Pure decisions of the playfield: what a touch means, what a cell shows, how a unit is tinted. No rendering imports. */
import type { DropAction } from '@/game/api';
import {
  FIELD_H,
  FIELD_W,
  LANE_WIDTH,
  PATH_BOTTOM,
  PATH_LEFT,
  PATH_RADIUS,
  PATH_RIGHT,
  PATH_TOP,
  cellAt,
} from '@/game/geometry';
import { mixColor } from '@/core/math';
import { Color, TapeColors } from '@/ui/theme';

/** A press that travels further than this (design px) is a drag, not a tap. */
export const DRAG_THRESHOLD = 10;

export function isDrag(dx: number, dy: number): boolean {
  return dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD;
}

/** Released below the field's bottom edge: the unit goes to the sell zone of the bottom panel. */
export function isSellZone(y: number): boolean {
  return y > FIELD_H;
}

/** A cat whose feet are this close to the field's bottom edge (or below it) is shown over the HUD. */
export const LIFT_EDGE = 24;

/**
 * Whether a cat is drawn on the field-space layer above the HUD instead of in the playfield: while it is held, while it
 * is being sold and while it springs back from below the field, so the sell strip never hides the sticker.
 */
export function liftsAboveHud(dragging: boolean, selling: boolean, y: number): boolean {
  return dragging || selling || y > FIELD_H - LIFT_EDGE;
}

/** Distance from a point to the centre line of the enemy loop (a rounded rectangle). */
export function pathDistance(x: number, y: number): number {
  const cx = (PATH_LEFT + PATH_RIGHT) / 2;
  const cy = (PATH_TOP + PATH_BOTTOM) / 2;
  const qx = Math.abs(x - cx) - ((PATH_RIGHT - PATH_LEFT) / 2 - PATH_RADIUS);
  const qy = Math.abs(y - cy) - ((PATH_BOTTOM - PATH_TOP) / 2 - PATH_RADIUS);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return Math.abs(outside + Math.min(Math.max(qx, qy), 0) - PATH_RADIUS);
}

export type FieldArea = 'board' | 'walkway' | 'floor' | 'outside';

/** Slack beyond the lane edge that still counts as walkway, so a thumb that lands near it aims the laser. */
const LANE_SLACK = 10;

/** Which part of the field a point (field space) is on. */
export function classifyPoint(x: number, y: number): FieldArea {
  if (x < 0 || y < 0 || x > FIELD_W || y > FIELD_H) return 'outside';
  if (cellAt(x, y) >= 0) return 'board';
  return pathDistance(x, y) <= LANE_WIDTH / 2 + LANE_SLACK ? 'walkway' : 'floor';
}

export type TapDecision =
  | { kind: 'select'; cell: number }
  | { kind: 'deselect' }
  | { kind: 'drop'; from: number; to: number }
  | { kind: 'none' };

const NONE: TapDecision = { kind: 'none' };
const DESELECT: TapDecision = { kind: 'deselect' };

/**
 * What releasing a press that never became a drag means. `action` is what dropping the selected unit
 * on the pressed cell would do (null when nothing is selected). A tap finishes a merge or a move, but
 * never a swap: tapping a second cat is how a player reads its sheet, and that must not shuffle the
 * board. Swapping is a drag.
 */
export function decideTap(selected: number | null, cell: number, occupied: boolean, action: DropAction | null): TapDecision {
  if (selected === null) return occupied ? { kind: 'select', cell } : NONE;
  if (selected === cell) return DESELECT;
  if (action === 'move' || action === 'merge') return { kind: 'drop', from: selected, to: cell };
  return occupied ? { kind: 'select', cell } : DESELECT;
}

/**
 * Which side of the target cell the merge bubble takes: over the row above or under the row below, whichever hides fewer
 * cats. The top row has no cats above it (only the enemy lane and the free band under the HUD) and the bottom row none
 * below, so each takes that side whenever the bubble fits there, and the other side only when it does not.
 */
export function previewBelow(row: number, rows: number, hiddenAbove: number, hiddenBelow: number, roomAbove: boolean, roomBelow: boolean): boolean {
  if (row <= 0) return !roomAbove;
  if (row >= rows - 1) return roomBelow;
  return hiddenBelow < hiddenAbove;
}

export type ReleaseDecision = { kind: 'sell' } | { kind: 'drop'; to: number } | { kind: 'cancel' };

const CANCEL: ReleaseDecision = { kind: 'cancel' };
const SELL: ReleaseDecision = { kind: 'sell' };

/** What releasing a dragged unit does, given the cell under the pointer (-1 = off the board). */
export function decideRelease(from: number, over: number, sell: boolean, action: DropAction | null): ReleaseDecision {
  if (sell) return SELL;
  if (over < 0 || over === from || action === null || action === 'none') return CANCEL;
  return { kind: 'drop', to: over };
}

/** How a candidate cell is drawn while a unit is held or selected. */
export type DropLook = 'move' | 'swap' | 'merge' | 'blocked';

export function dropLook(action: DropAction): DropLook {
  return action === 'none' ? 'blocked' : action;
}

/** Sprite tints are multiplied into the art: a sunlit cat is a touch warmer, a blocked one muted, a weakened one pale blue. */
const WARM = mixColor(Color.white, Color.mustard, 0.3);
const SLUMP = mixColor(Color.paperDim, Color.inkSoft, 0.5);
const DROOP = mixColor(Color.white, TapeColors.sky.base, 0.75);

/** Sprite tint from how much each condition applies (0..1); the strongest visible one leads. */
export function unitTint(blocked: number, weak: number, sun: number): number {
  let c: number = Color.white;
  if (sun > 0) c = mixColor(c, WARM, sun);
  if (weak > 0) c = mixColor(c, DROOP, weak * 0.7);
  if (blocked > 0) c = mixColor(c, SLUMP, blocked);
  return c;
}

export interface BarSegments {
  hp: number;
  shield: number;
}

/** Share of the bar's width that the health and shield segments fill; the shield sits after the health. Writes into `out`. */
export function barSegments(hp: number, maxHp: number, shield: number, maxShield: number, out: BarSegments): BarSegments {
  const total = maxHp + maxShield;
  out.hp = total > 0 ? Math.max(0, Math.min(1, hp / total)) : 0;
  out.shield = total > 0 ? Math.max(0, Math.min(1, shield / total)) : 0;
  return out;
}

/** Enemies in front are drawn over those behind by their y, rounded to this many px: a body that creeps along its lane keeps its place in the order. */
const DEPTH_STEP = 6;
/** The enemy layer is re-sorted this often (every n-th frame): every re-sort makes the layer record its draw calls again, and a body moves a pixel or two a frame. */
const DEPTH_EVERY = 4;

/** The sort key of a body whose feet are at `y` and whose drawn size is `size`. */
export function depthKey(y: number, size: number): number {
  return Math.round((y + size * 0.3) / DEPTH_STEP);
}

/** Whether frame number `frame` may re-sort the enemy layer. */
export function depthFrame(frame: number): boolean {
  return frame % DEPTH_EVERY === 0;
}

/** Longest side of an enemy's picture is its radius times this: a cucumber (18) reads about 56 px, a boss (38) about 115. */
const SIZE_PER_RADIUS = 3.05;
const BOSS_SIZE_PER_RADIUS = 3.0;
/** Gap kept between a drawn sprite and the screen edge: a boss on the outer lane would otherwise be cut by it. */
const EDGE_GAP = 6;

/** Drawn size of an enemy body (px). */
export function bodySize(radius: number, boss: boolean): number {
  return radius * (boss ? BOSS_SIZE_PER_RADIUS : SIZE_PER_RADIUS);
}

/** The x an enemy of drawn size `size` is drawn at: the simulation's, pulled in just far enough that a big body stays on the screen. */
export function bodyX(x: number, size: number): number {
  const half = size / 2 + EDGE_GAP;
  return Math.max(half, Math.min(FIELD_W - half, x));
}

/** Height of the health bar's back strip. The bar sits `barRise(size)` above the body's centre; its back reaches this much further up. */
const BAR_REACH = 13;

/** Distance from an enemy's centre up to the top of its health bar. */
export function barRise(size: number): number {
  return size * 0.56 + BAR_REACH;
}

/** Position of the health bar's centre line above the body's centre, and the width of its fill. */
export function barOffset(size: number): number {
  return size * 0.56 + 10;
}

/** Width of the health bar's fill (its back is 6 px wider). */
export function barWidth(size: number): number {
  return Math.max(40, Math.min(70, size * 0.8));
}

/** A struck body squashes a little past its picture: the box that numbers keep clear of is this much of its size bigger on every side. */
const SWELL = 0.05;

export interface BodyBox {
  /** Half the width, the reach above the centre (to the top of the health bar) and the reach below it. */
  hw: number;
  top: number;
  bottom: number;
}

/** The box of an enemy body of drawn size `size` with its health bar: where the damage numbers may not stand. */
export function bodyBox(size: number): BodyBox {
  const swell = size * SWELL;
  return { hw: Math.max(size / 2, barWidth(size) / 2 + 3) + swell, top: barRise(size) + swell, bottom: size / 2 + swell };
}
