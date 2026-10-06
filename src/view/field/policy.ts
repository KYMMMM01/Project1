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

/** A press that travels further than this (design px) is a drag, not a tap. */
export const DRAG_THRESHOLD = 10;

export function isDrag(dx: number, dy: number): boolean {
  return dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD;
}

/** Released below the field's bottom edge: the unit goes to the sell zone of the bottom panel. */
export function isSellZone(y: number): boolean {
  return y > FIELD_H;
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
 * on the pressed cell would do (null when nothing is selected).
 */
export function decideTap(selected: number | null, cell: number, occupied: boolean, action: DropAction | null): TapDecision {
  if (selected === null) return occupied ? { kind: 'select', cell } : NONE;
  if (selected === cell) return DESELECT;
  if (action === 'move' || action === 'swap' || action === 'merge') return { kind: 'drop', from: selected, to: cell };
  return occupied ? { kind: 'select', cell } : DESELECT;
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

const WARM = 0xffeec2;
const SLUMP = 0x8f93aa;
const DROOP = 0xb9c6ff;

/** Sprite tint from how much each condition applies (0..1); the strongest visible one leads. */
export function unitTint(blocked: number, weak: number, sun: number): number {
  let c = 0xffffff;
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
