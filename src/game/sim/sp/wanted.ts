/**
 * Wanted: One Shot! (gunner, King; docs/design_skills_v2.md 3.5, 4.4.2): a poster goes up on an elite or a boss and a cork bullet takes a
 * bite out of it, OUTSIDE the damage allowance every elite and boss has. It is the only damage in the game that goes around that allowance.
 *
 *  - The bite is `bite` (6%) of the target's MAXIMUM health, as it is: armour, ward, the vulnerability product (the laser's +15%, the nap
 *    blanket), the vacuum boss's halving while it inhales and the damage allowance (`capTokens`, neither used nor filled) all stay out of
 *    it. It goes through `dealDamage` (shield first, then health, death, rage), with no `hit` event: it has the `bite` event of its own
 *    (a `hit` would count as firepower in the boss bar's estimated time to kill). A bite that reaches the last health kills the target.
 *  - Every elite and boss gives `pool` (12%) of its maximum health in all, to every gunner on the board together: the figure is kept on the
 *    enemy (`bountyTaken`), so selling or merging a gunner does not give any of it back and a third bite never lands. A bite takes what is
 *    left of the pool when that is less than `bite`.
 *  - With no elite or boss in reach (or none with a pool left) the gunner fires the small shot at the sturdiest plain enemy in reach: `small`
 *    (20%) of its CURRENT health, through `damageEnemy` with the armour and ward skipped (the vulnerability product and, for an elite or a
 *    boss, the allowance would still apply; a plain enemy has no allowance).
 *  - Holding fire: in the wave before an elite or boss wave, and in an elite or boss wave until the target has come out (one second after
 *    the wave starts), there is no small shot: the gauge stays full. It looks at `scriptOf(wave + 1)`, so it holds the same way in every
 *    mode (chapters, the daily challenge, endless, the gold dungeon's chest, the tutorial).
 *  - The gunner does not fire a small shot while an elite or boss that still has a pool is on the field but out of ITS reach: it waits for
 *    the target to walk into its range (the design counts the first bite "right after it enters range"). When the pool is empty (or the
 *    target is dead) it goes back to the small shot.
 *  - Targets: the elite or boss in reach with a pool, the laser's choice first (`skillBefore`); for the small shot the plain enemy inside
 *    the laser's dot, else the one with the most current health, then the one that has travelled farthest, then the lower `uid`.
 */
import { SP_ROWS } from '../../data/spSkills';
import { damageEnemy, dealDamage } from '../enemies';
import type { Sim } from '../sim';
import type { SimEnemy, SimUnit } from '../types';
import { announceCast, castListened } from './cast';
import { inReach, skillBefore } from './target';
import type { SpHandler } from './types';

const ROW = SP_ROWS.wanted;
/** A pool within this share of the maximum health of being empty is empty (the two halves of the pool must add up to all of it). */
const POOL_EPS = 1e-9;

/** Health an elite's or boss's pool can still give. */
export function poolLeft(e: SimEnemy): number {
  return ROW.pool * e.maxHp - e.bountyTaken;
}

function hasPool(e: SimEnemy): boolean {
  return poolLeft(e) > e.maxHp * POOL_EPS;
}

/**
 * Whether the wave after the current one is an elite or boss wave, worked out once per wave and battle: a waiting gunner asks every 0.2 s,
 * and the script of a wave past 24 (endless) or of the gold dungeon is a fresh object on every call.
 */
const nextSpecial = new WeakMap<Sim, { wave: number; special: boolean }>();
function nextWaveIsSpecial(s: Sim): boolean {
  let c = nextSpecial.get(s);
  if (!c) {
    c = { wave: -1, special: false };
    nextSpecial.set(s, c);
  }
  if (c.wave !== s.wave) {
    c.wave = s.wave;
    c.special = s.scriptOf(s.wave + 1).kind !== 'normal';
  }
  return c.special;
}

/** The gunners do not fire at plain enemies now: the next wave has an elite or a boss, or this one's has not come out yet. */
export function holdingFire(s: Sim): boolean {
  if (ROW.hold !== 'nextWaveSpecial') return false;
  // An elite or boss wave: the target comes out one second after it starts (and stays "out" once it has, dead or alive).
  if (s.waveKind !== 'normal') return !s.bossSpawned;
  // The last wave of a run has no next one. (Defensive: every finite mode ends on an elite or boss wave, which returned above; and the
  // scripts are clamped past the end, so the gold dungeon's would answer "boss" for a wave 9.)
  if (!s.endless && s.wave >= s.totalWaves) return false;
  return nextWaveIsSpecial(s);
}

/** The plain enemy the small shot prefers: inside the laser's dot, then the most current health, then the farthest along, then the lower uid. */
function sturdier(a: SimEnemy, b: SimEnemy): boolean {
  if (a.focused !== b.focused) return a.focused;
  if (a.hp !== b.hp) return a.hp > b.hp;
  if (a.travelled !== b.travelled) return a.travelled > b.travelled;
  return a.uid < b.uid;
}

/** What the next shot would hit (set by `choose`). */
let target: SimEnemy | null = null;
let isBite = false;

/** Works out what the gunner would shoot right now, into `target` / `isBite`. Changes nothing in the battle. Returns true when there is a shot. */
function choose(s: Sim, u: SimUnit): boolean {
  let bite: SimEnemy | null = null;
  let small: SimEnemy | null = null;
  let waiting = false;
  for (const e of s.enemies) {
    if (e.dead) continue;
    if (e.isBoss || e.isElite) {
      if (!hasPool(e)) continue;
      if (!inReach(u, e)) waiting = true;
      else if (!bite || skillBefore(e, bite)) bite = e;
    } else if (inReach(u, e) && (!small || sturdier(e, small))) {
      small = e;
    }
  }
  isBite = bite !== null;
  target = bite ?? (holdingFire(s) || waiting ? null : small);
  return target !== null;
}

function castBite(s: Sim, u: SimUnit, e: SimEnemy): void {
  const max = ROW.pool * e.maxHp;
  const want = ROW.bite * e.maxHp;
  const left = max - e.bountyTaken;
  const amount = want < left ? want : left;
  e.bountyTaken += amount;
  const closed = max - e.bountyTaken <= e.maxHp * POOL_EPS;
  if (closed) e.bountyTaken = max;
  const share = amount / e.maxHp;
  const taken = e.bountyTaken / e.maxHp;
  if (castListened(s)) {
    announceCast(s, u, { skill: 'wanted', data: { mode: 'bite', targetUid: e.uid, x: e.x, y: e.y, share, taken, pool: ROW.pool, amount, closed } });
  }
  // Outside the allowance, and nothing else in the way: `dealDamage` is the part of `damageEnemy` after the allowance line. (With the cell
  // `ignoreCap` turned off the bite would go through `damageEnemy` like any other damage, and show up as a `hit`.)
  const killed = ROW.ignoreCap
    ? dealDamage(s, e, amount, u.spec.damageType, u, false, null, false)
    : damageEnemy(s, e, amount, u.spec.damageType, u, false, null, ROW.ignoreDefence);
  if (s.ev.has('bite')) s.ev.emit('bite', { unit: u, enemy: e, amount, share, taken, pool: ROW.pool, killed });
}

function castSmall(s: Sim, u: SimUnit, e: SimEnemy): void {
  const amount = ROW.small * e.hp;
  if (castListened(s)) {
    announceCast(s, u, {
      skill: 'wanted', data: { mode: 'small', targetUid: e.uid, x: e.x, y: e.y, share: ROW.small, taken: 0, pool: 0, amount, closed: false },
    });
  }
  damageEnemy(s, e, amount, u.spec.damageType, u, false, null, ROW.ignoreDefence);
}

export const wanted: SpHandler = {
  ready(s, u) {
    return choose(s, u);
  },

  cast(s, u) {
    if (!choose(s, u) || !target) return false;
    if (isBite) castBite(s, u, target);
    else castSmall(s, u, target);
    return true;
  },
};
