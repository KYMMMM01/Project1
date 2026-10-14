/**
 * The Tiger Has Arrived! (tiger general, Guardian; docs/design_skills_v2.md 3.3, 4.4, 4.5): the tiger leaps off its tile to the front of the
 * busiest stretch of road, lands there and runs against the flow for `dist` px, stomping every enemy it passes once for `power` x D. The
 * stomp goes through the enemy's armour and ward (`ignoreDefence`), not through the elite / boss damage allowance, and never crits. The
 * body is `run.ts`; this file chooses the stretch and starts the run.
 *
 *  - Reach: the whole field (rank 5).
 *  - The stretch is `dist` px of road, measured back from an enemy that is its front. Its weight is the sum of what stands in it: an
 *    ordinary enemy 1, an elite 2, a boss 3 (`weights`). Only a stretch that weighs at least `minWeight` is worth the run (so one elite is
 *    not, an elite and a cucumber are, a boss alone is). Among those the HEAVIEST wins (the owner, 2026-10-14: the charge goes where the
 *    enemies are thickest); between equally heavy ones a stretch that holds an enemy inside the laser's dot comes first, then the one
 *    whose front is first in skill order (elites and bosses, longest on the road, lower uid).
 *  - When: while the wave is still sending enemies out the tiger waits, gauge full, for a stretch of at least `crowd` (8); once
 *    everything is out, the best stretch of at least `minWeight` will do. So it no longer runs at the first three stragglers.
 *    The loop is circular: a stretch may reach across the seam of the road coordinate.
 *  - The tiger lands where the front enemy stood when it was cast and the run starts `leap` seconds later (18 ticks); enemies keep walking
 *    meanwhile, so the first tick of the run also covers `LAND_REACH` px in front of the landing spot (the farthest an enemy can walk in
 *    the leap): the front of the stretch is under the paws. An enemy that was a few px ahead of the stretch is stomped too.
 *  - The damage is worked out at the cast (`power` x the tiger's D then). The tile keeps attacking all the while (directive decision 3): the
 *    simulation has no "away" state for a cat, the view only draws the body elsewhere. Selling or merging the tiger does not stop the run.
 */
import { MAX_ENEMY_SPEED } from '../../data/balance';
import { SP_ROWS } from '../../data/spSkills';
import { pathPoint, wrapPath, type PathPoint } from '../../geometry';
import type { SimEnemy } from '../types';
import { announceCast } from './cast';
import { launchRun } from './run';
import { sortSkillOrder } from './target';
import type { SpHandler } from './types';

const ROW = SP_ROWS.charge;

/** How far in front of the landing spot the first tick of the run reaches: the farthest an enemy walks in the leap. */
export const LAND_REACH = Math.ceil(ROW.leap * MAX_ENEMY_SPEED);

const point: PathPoint = { x: 0, y: 0, angle: 0 };
const order: SimEnemy[] = [];
const place: number[] = [];
const weight: number[] = [];

function weightOf(e: SimEnemy): number {
  return e.isBoss ? ROW.weights[2] : e.isElite ? ROW.weights[1] : ROW.weights[0];
}

/** The front enemy of the best stretch and its weight (what `chooseStretch` found), valid until the next call. */
export const chosen: { front: SimEnemy | null; weight: number } = { front: null, weight: 0 };

/** Picks the stretch to run (see the file comment). Returns false when no stretch is worth it. */
export function chooseStretch(enemies: readonly SimEnemy[]): boolean {
  chosen.front = null;
  chosen.weight = 0;
  order.length = 0;
  let total = 0;
  for (const e of enemies) {
    if (e.dead) continue;
    order.push(e);
    total += weightOf(e);
  }
  if (total < ROW.minWeight) return false;
  sortSkillOrder(order);
  const n = order.length;
  for (let i = 0; i < n; i++) {
    const e = order[i] as SimEnemy;
    place[i] = wrapPath(e.travelled);
    weight[i] = weightOf(e);
  }
  let bestFocused = false;
  for (let i = 0; i < n; i++) {
    const front = place[i] as number;
    let sum = 0;
    let focused = false;
    for (let j = 0; j < n; j++) {
      if (wrapPath(front - (place[j] as number)) > ROW.dist) continue;
      sum += weight[j] as number;
      if ((order[j] as SimEnemy).focused) focused = true;
    }
    if (sum < ROW.minWeight) continue;
    if (chosen.front === null || sum > chosen.weight || (sum === chosen.weight && focused && !bestFocused)) {
      chosen.front = order[i] as SimEnemy;
      chosen.weight = sum;
      bestFocused = focused;
    }
  }
  return chosen.front !== null;
}

export const charge: SpHandler = {
  ready(s) {
    if (!chooseStretch(s.enemies)) return false;
    // A crowd is worth the run at once; a thinner stretch only when the wave has nothing more to send (no crowd is coming).
    return chosen.weight >= ROW.crowd || s.spawnIdx >= s.spawnIds.length;
  },

  cast(s, u) {
    if (!chooseStretch(s.enemies)) return false;
    const front = chosen.front as SimEnemy;
    const start = wrapPath(front.travelled);
    const run = launchRun(s, {
      skill: 'charge', src: u, dir: -1, start, dist: ROW.dist, speed: ROW.speed, delay: ROW.leap, lead: LAND_REACH,
      amount: ROW.power * u.stats.damage, ignoreDefence: ROW.ignoreDefence,
    });
    pathPoint(start, point);
    announceCast(s, u, {
      skill: 'charge',
      data: {
        runId: run.id, at: s.time, dir: -1, delay: ROW.leap, duration: ROW.dist / ROW.speed,
        startPath: start, landX: point.x, landY: point.y, dist: ROW.dist, speed: ROW.speed, leap: ROW.leap,
      },
    });
    return true;
  },
};
