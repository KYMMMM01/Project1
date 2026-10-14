/**
 * The searches that more than one of the step-2 skills needs (docs/handoff/skills2_sim.md says who uses which), pure and deterministic: they
 * read the simulation and change nothing, and every tie is broken by a rule that does not depend on the order things happened in.
 *
 *  - Tiles: `cellDist2`, `emptyCellsNear`, `nearestEmpty`. The ninja seats its clones on the nearest empty tiles and the lucky cat's
 *    partner capsule stands the partner on the nearest empty tile to the original: "centre distance, ties to the lower cell", which gives
 *    up and down (96 px) before left and right (108 px) before the diagonals (144 px).
 *  - Enemies around a point: `touches`, `enemiesAround`, `nearestEnemyAround`, `inRangeOf`. The storm cat's bolt splash and hop, the
 *    samurai's cut moving to a neighbour, the frost queen's shards, the cosmo cat's rings and the crater all ask "who is within r px of
 *    here". The test is the project's for areas: the enemy's body (its radius) touches the circle.
 *  - A crowd: `heaviestCluster`, the frost queen's "the chilled enemy with the most chilled enemies within 130 px" and the cosmo cat's
 *    "the point where the enemies a second from now weigh most within 150 px".
 */
import { CELL_COUNT, CELL_H, CELL_W, cellCenterX, cellCenterY, cellCol, cellRow } from '../../geometry';
import type { Sim } from '../sim';
import type { SimEnemy } from '../types';
import { skillBefore, sortSkillOrder } from './target';

// ───────────────────────────── tiles ─────────────────────────────

/**
 * Squared distance in px² between the centres of two tiles. Worked out from whole tile steps (columns x 108, rows x 96), so two tiles
 * that are equally far are exactly equally far: the tile to the left and the tile to the right tie at 108 px and never differ by float noise.
 */
export function cellDist2(a: number, b: number): number {
  const dx = (cellCol(a) - cellCol(b)) * CELL_W;
  const dy = (cellRow(a) - cellRow(b)) * CELL_H;
  return dx * dx + dy * dy;
}

/**
 * The empty tiles, nearest first to the centre of `cell`: by distance between tile centres, ties to the lower tile number. A tile is
 * empty when no cat stands on it; `taken` (optional) lets a caller count more tiles as occupied (the ninja does not seat two clones on one
 * tile). The tile `cell` itself is in the list if it is empty (distance 0): a caller whose own tile is never empty need not care. Fills
 * `out` (cleared first) and returns it. Reads `Sim.units` only.
 */
export function emptyCellsNear(s: Sim, cell: number, out: number[] = [], taken?: (cell: number) => boolean): number[] {
  out.length = 0;
  for (let c = 0; c < CELL_COUNT; c++) {
    if (s.units[c] !== null || (taken !== undefined && taken(c))) continue;
    // Insertion into a list kept sorted by (distance, tile number). Tiles come in ascending order, so a tie goes behind the earlier one.
    const d = cellDist2(cell, c);
    let i = out.length;
    out.push(c);
    while (i > 0 && cellDist2(cell, out[i - 1] as number) > d) {
      out[i] = out[i - 1] as number;
      i--;
    }
    out[i] = c;
  }
  return out;
}

/** The empty tile nearest to the centre of `cell` (ties to the lower tile number), or -1 when the board is full. See `emptyCellsNear`. */
export function nearestEmpty(s: Sim, cell: number, taken?: (cell: number) => boolean): number {
  let best = -1;
  let bestD = Infinity;
  for (let c = 0; c < CELL_COUNT; c++) {
    if (s.units[c] !== null || (taken !== undefined && taken(c))) continue;
    const d = cellDist2(cell, c);
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

// ───────────────────────────── enemies around a point ─────────────────────────────

/** Does the enemy's body touch the circle of radius `radius` px round (`x`, `y`)? (Centre distance <= radius + the enemy's own radius.) */
export function touches(e: SimEnemy, x: number, y: number, radius: number): boolean {
  const dx = e.x - x;
  const dy = e.y - y;
  const reach = radius + e.spec.radius;
  return dx * dx + dy * dy <= reach * reach;
}

/**
 * Is the enemy within reach of a cat's tile: the same test as `inReach` in `./target`, but for any tile and any range, so a clone (the
 * ninja's range measured from the clone's tile) and the alchemist's count of "cats that can hit this enemy" can ask without a cat.
 */
export function inRangeOf(cell: number, range: number, e: SimEnemy): boolean {
  return touches(e, cellCenterX(cell), cellCenterY(cell), range);
}

/**
 * The living enemies whose body touches the circle of radius `radius` round (`x`, `y`), in skill order (`./target`). `skip` (optional)
 * leaves some out, for example the enemy the circle is centred on. Fills `out` (cleared first) and returns it.
 */
export function enemiesAround(s: Sim, x: number, y: number, radius: number, out: SimEnemy[] = [], skip?: (e: SimEnemy) => boolean): SimEnemy[] {
  out.length = 0;
  for (const e of s.enemies) {
    if (e.dead || (skip !== undefined && skip(e)) || !touches(e, x, y, radius)) continue;
    out.push(e);
  }
  sortSkillOrder(out);
  return out;
}

/**
 * The living enemy nearest to (`x`, `y`) among those whose body touches the circle of radius `radius` (nearest by the distance to its
 * centre; a tie goes to the one first in skill order), or null. `skip` leaves some out: the samurai's cut passes the enemies that already
 * carry a line, the storm cat's cloud the one that just died (it is no longer in the list anyway).
 */
export function nearestEnemyAround(s: Sim, x: number, y: number, radius: number, skip?: (e: SimEnemy) => boolean): SimEnemy | null {
  let best: SimEnemy | null = null;
  let bestD = Infinity;
  for (const e of s.enemies) {
    if (e.dead || (skip !== undefined && skip(e)) || !touches(e, x, y, radius)) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    const d = dx * dx + dy * dy;
    if (d < bestD || (d === bestD && best !== null && skillBefore(e, best))) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

// ───────────────────────────── a crowd ─────────────────────────────

/** A point with a weight: an enemy where it stands (the frost queen, weight 1) or where it will stand (the cosmo cat, weight 1 / 2 / 3). */
export interface ClusterPoint {
  x: number;
  y: number;
  w: number;
}

/**
 * Where the crowd is thickest: the index (in `points`) of the point whose neighbourhood weighs most, the neighbourhood being every point
 * within `radius` px of it by centre distance, the point itself included. Equal weights go to the lower index, so a caller that wants "skill
 * order breaks ties" feeds the points in skill order. Returns -1 for an empty list, and the winning sum through `out.sum` when given.
 * It is O(n²), fine at a cast (a few times a minute, at most one wave's enemies), not for every tick.
 */
export function heaviestCluster(points: readonly ClusterPoint[], radius: number, out?: { sum: number }): number {
  const r2 = radius * radius;
  let best = -1;
  let bestSum = -Infinity;
  for (let i = 0; i < points.length; i++) {
    const p = points[i] as ClusterPoint;
    let sum = 0;
    for (let j = 0; j < points.length; j++) {
      const q = points[j] as ClusterPoint;
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      if (dx * dx + dy * dy <= r2) sum += q.w;
    }
    if (sum > bestSum) {
      best = i;
      bestSum = sum;
    }
  }
  if (out) out.sum = best < 0 ? 0 : bestSum;
  return best;
}
