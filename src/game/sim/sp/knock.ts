/**
 * Knock It Off! (frost queen, King; docs/design_skills_v2.md 3.8, 4.4, design rule 5): the queen stares at us, knocks the glass off the
 * table, it breaks where the slowed and frozen enemies are thickest and a shard flies into every chilled enemy near the impact. The chill
 * is not added to, it is SPENT: control turned into damage.
 *
 *  - Chilled = slowed (`ST_SLOW`) or frozen (`ST_FREEZE`). A frozen enemy counts as frozen even if it is also slowed. Ready when at least
 *    `minChilled` chilled enemies stand inside the queen's own range.
 *  - The impact is the chilled enemy in her range that has the most chilled enemies of its own kind (frozen with frozen, slowed with slowed)
 *    within `knot` px (centre distance, itself counted), counted among the chilled enemies in her range. The enemy the laser's dot covers
 *    comes first when the laser is on (any of them: only those are candidates, the best knot among them wins); ties go to skill order. The
 *    glass lands on that enemy where it stands.
 *  - Shards go to every chilled enemy whose body touches the circle of `radius` round the impact (the impact's own enemy and enemies
 *    outside the queen's range included), in skill order. Which kind each is (frozen 5 D, slowed 3 D) is fixed before any damage is dealt.
 *  - Each shard hurts through `damageEnemy` (armour or ward, the vulnerability cap, the electric blanket's "slowed" bonus, the elite / boss
 *    allowance; no crit; D = the queen's `stats.damage` at the cast) and THEN the chill is spent, so an enemy the shard kills still counts
 *    as chilled for the mages' burst (`killEnemy` looks at the status mask) and the blanket's bonus is in the number. A survivor loses its
 *    slow, and a frozen one its freeze and, like a normal thaw, can not be frozen again for `CC_IMMUNE_AFTER` (4 s). A slowed enemy gets no
 *    window: the blizzard may slow it again at once. Nothing new is applied: no slow, freeze or stun.
 *  - Elites and bosses are shattered like the rest: they lose the slow their cap allowed (a boss never freezes, so it never takes the 5 D);
 *    a frozen elite takes 5 D. Their allowance caps the damage as always.
 *  - Instant: everything happens in the cast's tick. The glass's fall in the picture (0.5 s) is only the view's time.
 */
import type { SpKnockShard } from '../../api';
import { CC_IMMUNE_AFTER } from '../../data/balance';
import { SP_ROWS } from '../../data/spSkills';
import { damageEnemy } from '../enemies';
import type { Sim } from '../sim';
import { ST_FREEZE, ST_SLOW, type SimEnemy, type SimUnit } from '../types';
import { announceCast, castListened } from './cast';
import { enemiesAround } from './near';
import { collectInReach } from './target';
import type { SpHandler } from './types';

const ROW = SP_ROWS.knock;

const reach: SimEnemy[] = [];
const candidates: SimEnemy[] = [];
const shards: SimEnemy[] = [];
const wasFrozen: boolean[] = [];

/** Slowed or frozen. */
export function isChilled(e: SimEnemy): boolean {
  return (e.mask & (ST_SLOW | ST_FREEZE)) !== 0;
}

/** Frozen (5 D) as against only slowed (3 D). */
function isFrozenKind(e: SimEnemy): boolean {
  return (e.mask & ST_FREEZE) !== 0;
}

/**
 * Spends the chill of an enemy: its slow goes, and its freeze goes with the same 4 s window of immunity a normal thaw starts
 * (`statusStep`). Applies nothing. Exported for the tests.
 */
export function consumeChill(s: Sim, e: SimEnemy): void {
  let m = e.mask;
  if ((m & ST_SLOW) !== 0) {
    e.slow = 0;
    e.slowUntil = 0;
    m &= ~ST_SLOW;
  }
  if ((m & ST_FREEZE) !== 0) {
    e.frozen = false;
    e.freezeUntil = 0;
    e.ccImmuneUntil = s.time + CC_IMMUNE_AFTER;
    m &= ~ST_FREEZE;
  }
  e.mask = m;
}

/**
 * The chilled enemies inside the queen's range, in skill order, into `candidates`. Returns how many. `reach` is scratch.
 */
function collectCandidates(s: Sim, u: SimUnit): number {
  collectInReach(s, u, reach);
  candidates.length = 0;
  for (const e of reach) if (isChilled(e)) candidates.push(e);
  return candidates.length;
}

/** The chilled enemy the glass lands on, or null when fewer than `minChilled` are in reach (`collectCandidates` ran first). */
function chooseImpact(): SimEnemy | null {
  const n = candidates.length;
  if (n < ROW.minChilled) return null;
  const r2 = ROW.knot * ROW.knot;
  // Skill order puts the laser's enemies first, so when the first candidate is under the dot only the ones under it can win.
  const laser = (candidates[0] as SimEnemy).focused;
  let best: SimEnemy | null = null;
  let bestN = -1;
  for (let i = 0; i < n; i++) {
    const a = candidates[i] as SimEnemy;
    if (laser && !a.focused) break;
    const kind = isFrozenKind(a);
    let count = 0;
    for (let j = 0; j < n; j++) {
      const b = candidates[j] as SimEnemy;
      if (isFrozenKind(b) !== kind) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (dx * dx + dy * dy <= r2) count++;
    }
    if (count > bestN) {
      best = a;
      bestN = count;
    }
  }
  return best;
}

export const knock: SpHandler = {
  ready(s, u) {
    return collectCandidates(s, u) >= ROW.minChilled;
  },

  cast(s, u) {
    collectCandidates(s, u);
    const impact = chooseImpact();
    if (impact === null) return false;
    const ix = impact.x;
    const iy = impact.y;
    // The shards: every chilled enemy the circle touches. Their kinds are fixed now, before any damage changes anything.
    enemiesAround(s, ix, iy, ROW.radius, shards);
    let n = 0;
    for (let i = 0; i < shards.length; i++) {
      const e = shards[i] as SimEnemy;
      if (!isChilled(e)) continue;
      shards[n] = e;
      wasFrozen[n] = isFrozenKind(e);
      n++;
    }
    shards.length = n;
    wasFrozen.length = n;
    if (castListened(s)) {
      const list: SpKnockShard[] = [];
      for (let i = 0; i < n; i++) {
        const e = shards[i] as SimEnemy;
        list.push({ uid: e.uid, x: e.x, y: e.y, frozen: wasFrozen[i] as boolean });
      }
      announceCast(s, u, { skill: 'knock', data: { impactX: ix, impactY: iy, radius: ROW.radius, shards: list } });
    }
    const d = u.stats.damage;
    const type = u.spec.damageType;
    for (let i = 0; i < n; i++) {
      const e = shards[i] as SimEnemy;
      if (e.dead) continue;
      // Damage first, then the chill goes: a fallen enemy leaves with its status on (the mages' burst), a survivor with none.
      if (!damageEnemy(s, e, (wasFrozen[i] ? ROW.frozen : ROW.slowed) * d, type, u, false, null)) consumeChill(s, e);
    }
    shards.length = 0;
    wasFrozen.length = 0;
    return true;
  },
};
