/**
 * Which skill ring the first-time lesson is about, and where it lies (docs/qa/directive_2026-10-13_skills_build.md, decision 29: "a short read-only
 * bubble the first time a ring is nearly full"). Pure choices over the board, in the way of pawTarget.ts: the lesson and the card both ask the same
 * questions, so a cat and a place are chosen once.
 *
 * The ring itself is the field's (`field/spRing.ts`, a child of the cat's own view); its place is the field's maths (`RING_AT`, `RING_OUTER`,
 * measured from the cat's feet), so the lesson's spotlight is cut from numbers and does not depend on a picture that pulses, pops in or flashes.
 */
import { unitDef, type UnitId } from '@/game';
import { cellCenterX, cellCenterY } from '@/game/geometry';
import { RING_AT, RING_OUTER } from '../field/spRingMath';
import { FEET_DY } from '../field/unitView';
import type { Rect } from './layoutMath';

/** A ring this full (the gauge, 0..1) is "nearly full": the lesson's moment. A new Alley Boss starts at 0.5, so it comes a fifth of a cooldown into the cat's stay. */
export const RING_NEAR = 0.7;

type Board = ReadonlyArray<{ readonly id: UnitId; readonly sp: number } | null>;

/** Whether the cat in a cell wears a ring (its skill is built): the gauge says nothing, it is 0 right after a cast. */
function wearsRing(board: Board, cell: number): boolean {
  const u = cell >= 0 && cell < board.length ? board[cell] : null;
  return u !== null && u !== undefined && unitDef(u.id).spSkill !== undefined;
}

/** The first cat (by cell) whose ring is nearly full, or -1: what starts the lesson. A battle without skills has gauges at 0, so it never starts one. */
export function nearRingCell(board: Board): number {
  for (let c = 0; c < board.length; c++) {
    const u = board[c];
    if (u && u.sp >= RING_NEAR && wearsRing(board, c)) return c;
  }
  return -1;
}

/**
 * The cat the lesson points at: `last` while it still wears a ring (a ring that has just cast is empty and is still the one being talked about, and a
 * second cat whose ring fills must not pull the note across the board), else the first cat whose ring is nearly full.
 */
export function ringCat(board: Board, last = -1): number {
  return wearsRing(board, last) ? last : nearRingCell(board);
}

/** The ring's disc on the field (design px): a square round the ring and its rim, centred where the ring is drawn on the cat in `cell`. */
export function ringBox(cell: number): Rect {
  const r = RING_OUTER;
  return { x: cellCenterX(cell) + RING_AT.x - r, y: cellCenterY(cell) + FEET_DY + RING_AT.y - r, w: 2 * r, h: 2 * r };
}
