/**
 * Turn Into Fish! (alchemist, King; docs/design_skills_v2.md 3.11 and 4.4.1, section 7 questions 5, 11 and 12): five flasks fly. One big flask
 * turns an elite or a boss into a fish for a moment; the small ones turn the weakest ordinary enemies into fish for good.
 *
 *  - The big flask goes to the first elite or boss, in skill order (`skillBefore`: the laser's dot, then the one that has travelled farthest),
 *    that is inside the alchemist's range, is neither a fish nor locked, and that at least `reachMin` (3) cats can hit right now (the cats
 *    whose range holds it, not blocked, the alchemist among them: `reachCount`). It walks at `fishSpeed` (a quarter) of its speed for
 *    `fishTime` (boss 4 s, elite 2.5 s) and then cannot be turned again for `fishLock` (boss 8 s, elite 5 s). The status is `transmuteSpecial`
 *    (`enemies.ts`), outside `applyStatus` on purpose: it goes past the slow cap of elites and bosses, the enemy's resistance, the pills'
 *    and the vaccine's immunity and the butler level, and it is not a slow (`slow` stays 0), so nothing that asks "is it slowed" sees it.
 *    Everything else about the enemy runs on: its abilities, its rage, its damage allowance, the damage it takes.
 *  - The small flasks (4 when there is a big one, else 5) go to the ordinary enemies inside the alchemist's range whose CURRENT health is at
 *    most `maxHp` (60%) of one cucumber of the wave they were born in (`SimEnemy.baseHp`): the lowest current health first, ties in skill
 *    order. Elites, bosses and a wave's target are never taken. Each is removed by `transmuteEnemy` (`enemies.ts`): not a kill in the
 *    passive's sense (no split, no burst, no harvest, no shatter, no `hit`), but it counts in `Sim.kills`, pays its fish twice (`bounty`)
 *    through `earnFish` and says `enemyDie` with `transmuted`.
 *  - Ready (asked every 0.2 s while the gauge is full): there is an elite or boss the big flask can take, OR at least `minTargets` (2) enemies
 *    for small flasks. With a big flask the small ones are thrown too, even if there is none; without one the cast waits for two. "First
 *    the elite or boss" means "if there is one", it is not a reason to wait.
 *  - Reach is the alchemist's own range for everything (`inReachOnly`; false would mean the whole field). No damage, no crit, no random draw.
 */
import type { SpFishData, SpFishTarget } from '../../api';
import { SP_ROWS } from '../../data/spSkills';
import { CELL_COUNT } from '../../geometry';
import { transmuteEnemy, transmuteSpecial } from '../enemies';
import type { Sim } from '../sim';
import type { SimEnemy, SimUnit } from '../types';
import { announceCast, castListened } from './cast';
import { inRangeOf } from './near';
import { collectInReach, sortSkillOrder } from './target';
import type { SpHandler } from './types';

const ROW = SP_ROWS.fish;

/** Module scratch: the enemies in reach in skill order, and the small flasks' targets (lowest health first). */
const found: SimEnemy[] = [];
const weak: SimEnemy[] = [];
/** How many cats can hit the big flask's target (set by `pickBig`). */
let bigCats = 0;

/** How many cats can hit the enemy right now: the cats whose range holds it and that no hazard has stopped. */
export function reachCount(s: Sim, e: SimEnemy): number {
  let n = 0;
  for (let c = 0; c < CELL_COUNT; c++) {
    const u = s.units[c];
    if (u && !u.blocked && inRangeOf(c, u.stats.range, e)) n++;
  }
  return n;
}

/** The enemies the flasks may go to, in skill order. */
function gather(s: Sim, u: SimUnit): void {
  if (ROW.inReachOnly) {
    collectInReach(s, u, found);
    return;
  }
  found.length = 0;
  for (const e of s.enemies) if (!e.dead) found.push(e);
  sortSkillOrder(found);
}

/** Can the big flask turn this one into a fish now: an elite or a boss, no fish yet, not locked, and `reachMin` cats can hit it. */
function pickBig(s: Sim): SimEnemy | null {
  for (const e of found) {
    if ((!e.isBoss && !e.isElite) || s.time < e.fishLockUntil) continue;
    const cats = reachCount(s, e);
    if (cats < ROW.reachMin) continue;
    bigCats = cats;
    return e;
  }
  return null;
}

/** Fills `weak` with up to `n` small-flask targets, the lowest current health first (an equal health keeps skill order). */
function pickWeak(n: number): void {
  weak.length = 0;
  if (n <= 0) return;
  for (const e of found) {
    if (e.isBoss || e.isElite || e.target) continue;
    // A hair of slack: a coin is exactly 60% of a cucumber, and the two products must not disagree in the last bit.
    if (e.hp > ROW.maxHp * e.baseHp * (1 + 1e-9)) continue;
    let at = weak.length;
    if (at < n) weak.push(e);
    else if (e.hp < (weak[n - 1] as SimEnemy).hp) at = n - 1;
    else continue;
    while (at > 0 && e.hp < (weak[at - 1] as SimEnemy).hp) {
      weak[at] = weak[at - 1] as SimEnemy;
      at--;
    }
    weak[at] = e;
  }
}

/** Plans one cast: who gets the big flask (or null) and fills `weak`. Changes nothing in the battle. */
function plan(s: Sim, u: SimUnit): SimEnemy | null {
  gather(s, u);
  const big = pickBig(s);
  pickWeak(big ? ROW.smallTargets.withBig : ROW.smallTargets.withoutBig);
  return big;
}

export const fish: SpHandler = {
  ready(s, u) {
    const big = plan(s, u);
    return big !== null || weak.length >= ROW.minTargets;
  },

  cast(s, u) {
    const big = plan(s, u);
    if (big === null && weak.length < ROW.minTargets) return false;
    const seconds = big ? (big.isBoss ? ROW.fishTime.boss : ROW.fishTime.elite) : 0;
    const lock = big ? (big.isBoss ? ROW.fishLock.boss : ROW.fishLock.elite) : 0;
    // Where the enemies stand NOW is what the flasks fly to; the payload is built only if somebody listens.
    let bigShot: SpFishData['big'] = null;
    let small: SpFishTarget[] = [];
    if (big !== null && castListened(s)) bigShot = { uid: big.uid, x: big.x, y: big.y, boss: big.isBoss, seconds, lock, cats: bigCats };
    if (castListened(s)) small = weak.map((e) => ({ uid: e.uid, x: e.x, y: e.y }));
    announceCast(s, u, { skill: 'fish', data: { big: bigShot, small } });
    if (big) transmuteSpecial(s, big, seconds, lock);
    for (const e of weak) transmuteEnemy(s, e, u, ROW.bounty);
    return true;
  },
};
