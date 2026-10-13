/**
 * Starlight Lap (starlight archer, Guardian; docs/design_skills_v2.md 3.6, 4.4, 4.5): a silver arrow comes down on the road at the point
 * nearest the archer's tile and runs once round it WITH the flow, `PATH_LENGTH + extra` px at `speed` px/s (about 1.2 s; the extra lets it
 * overtake the enemies that walk on ahead while it runs). Every enemy it passes takes one star: `power` x D, but all stars of a cast add
 * up to at most `pool` x D, so when the field holds more than `pool / power` (16) enemies each star shrinks to `pool / n` x D. An enemy it
 * fells bursts as the passive's kill burst does (`burst`: `pct` of D in `radius` px, no second burst). Never a crit; armour and ward
 * apply, so do the elite / boss damage allowance and the butler level's rules (`damageEnemy`). The body is `run.ts`; this file decides
 * when and from where it starts.
 *
 *  - Reach: the whole field (rank 5). Ready when `minEnemies` enemies are on the field, or one elite or boss.
 *  - n, the number of enemies the pool is shared out over, is the number on the field at the cast ("everyone is hit"). The pool is
 *    RESERVED for them (`run.ts`): an enemy that spawns or splits meanwhile is touched only while the pool still covers a share for every
 *    one of those not yet touched and alive, so with more than 16 on the field (no spare) the late ones are passed without a star, and
 *    with fewer they take what is spare. The sum of the stars cannot pass the pool. Enemies that die before the arrow comes by release
 *    their share to the late ones.
 *  - The burst is the passive's: the row's radius grown by the same area bonuses the passive's burst gets (`areaOf` in `combat.ts`: the
 *    level-10 perk, the toys that widen areas), worked out at the cast. The star's damage D is the archer's `stats.damage` at the cast.
 */
import { SP_ROWS } from '../../data/spSkills';
import {
  PATH_BOTTOM, PATH_LEFT, PATH_LENGTH, PATH_RADIUS, PATH_RIGHT, PATH_TOP, cellCenterX, cellCenterY, pathPoint, type PathPoint,
} from '../../geometry';
import { areaOf } from '../combat';
import { announceCast } from './cast';
import { launchRun } from './run';
import type { SpHandler } from './types';

const ROW = SP_ROWS.lap;

const R = PATH_RADIUS;
const SH = PATH_RIGHT - PATH_LEFT - 2 * R;
const SV = PATH_BOTTOM - PATH_TOP - 2 * R;
const ARC = (Math.PI / 2) * R;
/** The rectangle of the arc centres (the road is its outline pushed out by `R`). */
const IL = PATH_LEFT + R;
const IR = PATH_RIGHT - R;
const IT = PATH_TOP + R;
const IB = PATH_BOTTOM - R;
/** Where each part of the road begins (the order `pathPoint` walks it). */
const TOP_RIGHT = SH;
const RIGHT = SH + ARC;
const BOTTOM_RIGHT = SH + ARC + SV;
const BOTTOM = SH + 2 * ARC + SV;
const BOTTOM_LEFT = 2 * SH + 2 * ARC + SV;
const LEFT = 2 * SH + 3 * ARC + SV;
const TOP_LEFT = 2 * SH + 3 * ARC + 2 * SV;

/**
 * The road coordinate (in [0, PATH_LENGTH)) of the point of the road nearest to the field point (`x`, `y`). Exact: the road is a rounded
 * rectangle, so the nearest point is on the side whose line is closest (a point inside the road, such as a tile, is always nearest to a
 * straight side), or on the corner arc in the direction of the point from the arc's centre for a point out in a corner. A point equally
 * near two sides (the middle of the board) takes the first of top, right, bottom, left.
 */
export function nearestPathPos(x: number, y: number): number {
  const cx = x < IL ? IL : x > IR ? IR : x;
  const cy = y < IT ? IT : y > IB ? IB : y;
  const dx = x - cx;
  const dy = y - cy;
  if (dx === 0 && dy === 0) {
    const top = y - IT;
    const right = IR - x;
    const bottom = IB - y;
    const left = x - IL;
    if (top <= right && top <= bottom && top <= left) return x - IL;
    if (right <= bottom && right <= left) return RIGHT + (y - IT);
    if (bottom <= left) return BOTTOM + (IR - x);
    return LEFT + (IB - y);
  }
  if (dx === 0) return dy < 0 ? x - IL : BOTTOM + (IR - x);
  if (dy === 0) return dx > 0 ? RIGHT + (y - IT) : LEFT + (IB - y);
  const a = Math.atan2(dy, dx);
  if (dx > 0 && dy < 0) return TOP_RIGHT + (a + Math.PI / 2) * R;
  if (dx > 0) return BOTTOM_RIGHT + a * R;
  if (dy > 0) return BOTTOM_LEFT + (a - Math.PI / 2) * R;
  return TOP_LEFT + (a + Math.PI) * R;
}

const point: PathPoint = { x: 0, y: 0, angle: 0 };

export const lap: SpHandler = {
  ready(s) {
    if (s.enemies.length >= ROW.minEnemies) return true;
    for (const e of s.enemies) if (e.isElite || e.isBoss) return true;
    return false;
  },

  cast(s, u) {
    const n = s.enemies.length;
    if (n === 0) return false;
    const d = u.stats.damage;
    const start = nearestPathPos(cellCenterX(u.cell), cellCenterY(u.cell));
    const dist = PATH_LENGTH + ROW.extra;
    const run = launchRun(s, {
      skill: 'lap', src: u, dir: 1, start, dist, speed: ROW.speed,
      amount: d * Math.min(ROW.power, ROW.pool / n), pool: d * ROW.pool, burstDamage: d * ROW.burst.pct,
      burstRadius: ROW.burst.radius * areaOf(s, u),
    });
    pathPoint(start, point);
    announceCast(s, u, {
      skill: 'lap',
      data: {
        runId: run.id, at: s.time, dir: 1, delay: 0, duration: dist / ROW.speed,
        startPath: start, startX: point.x, startY: point.y, dist, speed: ROW.speed,
      },
    });
    return true;
  },
};
