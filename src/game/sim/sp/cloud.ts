/**
 * Tagalong Cloud (storm cat, Alley Boss; docs/design_skills_v2.md 3.7, 4.4, 4.5): a grumpy little cloud pops out of the cat's hat, sticks to
 * the lead enemy in the cat's reach and follows it wherever it walks (also far out of every cat's range), dropping a bolt on it every
 * `every` seconds for `life` seconds. When the host falls it hops to the nearest enemy within `hop` px of where the host fell, or goes.
 *
 *  - The host is the first enemy in skill order (laser dot, elite or boss, farthest along, lower uid) inside the cat's own range at the cast.
 *    Two clouds may sit on one host (several storm cats: no spreading rule).
 *  - Bolts fall at `every`, 2 x `every`, ... after the cast (8 bolts in 3.2 s; the cloud goes in the tick of the last one). A bolt hurts the
 *    host `host` x D and every OTHER enemy whose body touches the circle of `splash.radius` round the host `splash.power` x D, all through
 *    `damageEnemy` (armour, ward, the vulnerability cap, the elite / boss allowance; no crit). NO shock: nothing is stunned.
 *  - D is the cat's `stats.damage` at the cast, kept for the whole cloud (a cloud is an event, not a buff that follows the cat's numbers). The
 *    damage is credited to the cat even if it is sold, merged or molted meanwhile; the cloud carries on.
 *  - The splash circle is worked out before the bolt's damage, so the children of a host that bursts apart (a balloon) are not splashed.
 *  - A host that is dead (killed, or chased off the field by the overflow rule) is noticed at the top of the skill pass of the same tick or at
 *    the bolt that felled it: the cloud hops to `nearestEnemyAround(host's last place, hop)` or ends as `lost`. A bolt the cloud already owed
 *    still falls on the new host at its time; the hop does not shift the beat.
 *  - At most `cap` clouds are on the field at once, in all (the design's "한 판에 구름 6개까지" read as a performance limit on the screen: a
 *    battle-long total of six casts would make no sense). The seventh cast is not made: `ready` is false and the gauge waits full.
 *  - Clouds belong to the field, not the wave: they carry on through wave and stage changes, stand still with a choice popup (no ticks), and
 *    a defeat freezes them like the running bodies (a revive lets them go on). Nothing is saved.
 *
 * The list `Sim.clouds` is stepped at the top of the skill pass (`updateSpSkills`) with the running bodies, so a cast of tick T drops its first
 * bolt `every` seconds later.
 */
import type { StrikePoint } from '../../api';
import { SP_ROWS } from '../../data/spSkills';
import { damageEnemy } from '../enemies';
import type { Sim } from '../sim';
import type { SimEnemy, SimUnit } from '../types';
import { announceCast, castListened } from './cast';
import { enemiesAround, nearestEnemyAround } from './near';
import { inReach, skillBefore } from './target';
import type { SpHandler } from './types';

const ROW = SP_ROWS.cloud;
/** Tolerance when comparing the clock with a due time (ticks are 1/60 s apart, so this never decides anything). */
const EPS = 1e-9;

/** A cloud on the field. Lives only in `Sim.clouds`; a saved run holds nothing of it. */
export interface SpCloud {
  /** Counts up from 1 in a battle; names the cloud in `spCast`, `cloudBolt`, `cloudHop` and `cloudEnd`. */
  id: number;
  /** The storm cat. Its `removed` flag is not looked at: the cloud carries on without it. */
  owner: SimUnit;
  /** The enemy the cloud sits on now. */
  host: SimEnemy;
  /** Simulation time of the cast; the bolts fall at `at + n * every`. */
  at: number;
  /** Simulation time the cloud goes. */
  until: number;
  /** Bolts the cloud drops in all, and how many have fallen. */
  bolts: number;
  done: number;
  /** Damage of a bolt on the host and on a splash victim, fixed at the cast (D then x the row's factor). */
  hostDamage: number;
  splashDamage: number;
}

const victims: SimEnemy[] = [];
let sitting: SimEnemy | null = null;
const notSitting = (e: SimEnemy): boolean => e === sitting;

/** The enemy a new cloud would sit on: the first in skill order inside the cat's own range, or null. */
function pickHost(s: Sim, u: SimUnit): SimEnemy | null {
  let best: SimEnemy | null = null;
  for (const e of s.enemies) {
    if (e.dead || !inReach(u, e)) continue;
    if (best === null || skillBefore(e, best)) best = e;
  }
  return best;
}

/** How many bolts a cloud drops: one every `every` seconds of its `life`. */
function boltsOf(): number {
  return Math.floor(ROW.life / ROW.every + EPS);
}

function end(s: Sim, c: SpCloud, reason: 'time' | 'lost'): void {
  if (s.ev.has('cloudEnd')) s.ev.emit('cloudEnd', { cloudId: c.id, reason, hostUid: c.host.uid, x: c.host.x, y: c.host.y, bolts: c.done });
}

/** The host is gone: move to the nearest enemy within `hop` px of where it fell. Returns false (after announcing the end) when there is none. */
function rehost(s: Sim, c: SpCloud): boolean {
  const from = c.host;
  const to = nearestEnemyAround(s, from.x, from.y, ROW.hop);
  if (to === null) {
    end(s, c, 'lost');
    return false;
  }
  c.host = to;
  if (s.ev.has('cloudHop')) {
    s.ev.emit('cloudHop', { cloudId: c.id, fromUid: from.uid, fromX: from.x, fromY: from.y, toUid: to.uid, toX: to.x, toY: to.y });
  }
  return true;
}

/** One bolt on the host and its splash. */
function bolt(s: Sim, c: SpCloud): void {
  const host = c.host;
  c.done++;
  const x = host.x;
  const y = host.y;
  sitting = host;
  enemiesAround(s, x, y, ROW.splash.radius, victims, notSitting);
  sitting = null;
  if (s.ev.has('cloudBolt')) {
    const points: StrikePoint[] = [];
    for (const e of victims) points.push({ x: e.x, y: e.y, uid: e.uid });
    s.ev.emit('cloudBolt', { cloudId: c.id, unit: c.owner, hostUid: host.uid, x, y, index: c.done, bolts: c.bolts, points });
  }
  const type = c.owner.spec.damageType;
  damageEnemy(s, host, c.hostDamage, type, c.owner, false, null);
  for (let i = 0; i < victims.length; i++) {
    const e = victims[i] as SimEnemy;
    if (!e.dead) damageEnemy(s, e, c.splashDamage, type, c.owner, false, null);
  }
  victims.length = 0;
}

/** One tick of a cloud. Returns false when it is gone. */
function step(s: Sim, c: SpCloud): boolean {
  if (c.host.dead && !rehost(s, c)) return false;
  const limit = s.time + EPS;
  while (c.done < c.bolts && c.at + (c.done + 1) * ROW.every <= limit) {
    bolt(s, c);
    // The beat goes on: a new host takes the next bolt. The last bolt ends the cloud whatever became of its host.
    if (c.host.dead && c.done < c.bolts && !rehost(s, c)) return false;
  }
  if (s.time >= c.until - EPS) {
    end(s, c, 'time');
    return false;
  }
  return true;
}

/** Steps every cloud one tick, in the order they were cast, and drops the ones that are gone. Called by the skill pass when there are any. */
export function stepClouds(s: Sim): void {
  const list = s.clouds;
  let kept = 0;
  const n = list.length;
  for (let i = 0; i < n; i++) {
    const c = list[i] as SpCloud;
    if (step(s, c)) list[kept++] = c;
  }
  list.length = kept;
}

export const cloud: SpHandler = {
  ready(s, u) {
    return s.clouds.length < ROW.cap && pickHost(s, u) !== null;
  },

  cast(s, u) {
    if (s.clouds.length >= ROW.cap) return false;
    const host = pickHost(s, u);
    if (host === null) return false;
    const bolts = boltsOf();
    const d = u.stats.damage;
    const c: SpCloud = {
      id: ++s.cloudSeq, owner: u, host, at: s.time, until: s.time + ROW.life, bolts, done: 0,
      hostDamage: ROW.host * d, splashDamage: ROW.splash.power * d,
    };
    s.clouds.push(c);
    if (castListened(s)) {
      announceCast(s, u, {
        skill: 'cloud',
        data: {
          cloudId: c.id, hostUid: host.uid, hostX: host.x, hostY: host.y, at: c.at, life: ROW.life, every: ROW.every, bolts,
          splashRadius: ROW.splash.radius, hopRadius: ROW.hop,
        },
      });
    }
    return true;
  },
};
