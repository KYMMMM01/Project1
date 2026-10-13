/**
 * Shield Shove (viking, Alley Boss; docs/design_skills_v2.md 3.1, 4.4): the shield comes down and everything inside the cat's reach slides
 * back along the road, spacing kept, with a light thump. The slide is `slideBack` in `enemies.ts` (the enemy is carried, not walking);
 * this file decides who and how far.
 *
 *  - A target is an enemy in reach that has travelled at least `minTravelled` (nothing is pushed onto the pile at the start of the road)
 *    and is not inside its shove window. Others are not touched at all: no push, no thump.
 *  - An elite slides `eliteFactor` of the push, a boss `bossFactor` (the black hole's factors, whatever the butler level). Nothing is
 *    pushed below the start: an enemy with less than the push to go slides to the start.
 *  - Each pushed enemy takes `thump` x D through `damageEnemy` (armour, ward, the damage cap; no crit), credited to the viking.
 *  - A pushed enemy cannot be pushed again for `window` seconds (its own field, not the black hole's), so several vikings do not stack.
 */
import { pathPoint, type PathPoint } from '../../geometry';
import type { SpShoved } from '../../api';
import { SP_ROWS } from '../../data/spSkills';
import { damageEnemy, shoveEnemy } from '../enemies';
import type { Sim } from '../sim';
import type { SimEnemy } from '../types';
import { announceCast, castListened } from './cast';
import { collectInReach, inReach } from './target';
import type { SpHandler } from './types';

const ROW = SP_ROWS.shove;
const point: PathPoint = { x: 0, y: 0, angle: 0 };
const found: SimEnemy[] = [];
const pushedNow: SimEnemy[] = [];

function pushable(s: Sim, e: SimEnemy): boolean {
  return e.travelled >= ROW.minTravelled && s.time >= e.shoveImmuneUntil;
}

export const shove: SpHandler = {
  ready(s, u) {
    for (const e of s.enemies) if (!e.dead && pushable(s, e) && inReach(u, e)) return true;
    return false;
  },

  cast(s, u) {
    collectInReach(s, u, found);
    pushedNow.length = 0;
    const list: SpShoved[] | null = castListened(s) ? [] : null;
    for (const e of found) {
      if (!pushable(s, e)) continue;
      const x = e.x;
      const y = e.y;
      const angle = e.angle;
      const factor = e.isBoss ? ROW.bossFactor : e.isElite ? ROW.eliteFactor : 1;
      const distance = shoveEnemy(s, e, ROW.push * factor, ROW.slide, ROW.window);
      if (distance <= 0) continue;
      pushedNow.push(e);
      if (list) {
        pathPoint(e.travelled - distance, point);
        list.push({ uid: e.uid, x, y, angle, toX: point.x, toY: point.y, distance });
      }
    }
    if (pushedNow.length === 0) return false;
    announceCast(s, u, { skill: 'shove', data: { range: u.stats.range, slide: ROW.slide, pushed: list ?? [] } });
    const thump = ROW.thump * u.stats.damage;
    for (const e of pushedNow) if (!e.dead) damageEnemy(s, e, thump, u.spec.damageType, u, false, null);
    return true;
  },
};
