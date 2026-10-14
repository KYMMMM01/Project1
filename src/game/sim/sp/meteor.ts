/**
 * Meteor Drop (cosmo cat, Guardian; docs/design_skills_v2.md 3.9, 4.4, 4.5): a red circle grows for `warn` seconds where the enemies WILL
 * be, then the meteor lands: the inner ring at once, the outer ring `outer.delay` later, and a scorched crater burns for `crater.life`.
 * No pull, no stun, no slow: the only things it does to an enemy are damage and a burn.
 *
 *  - Aim: every living enemy is put where it will stand `warn` seconds from now (`travelledAfter`: its own speed with its slow and haste as
 *    they are now, a stun or freeze until it ends, a shove's slide until it is done, the whirl until it ends, a fish's quarter speed until it
 *    wears off; no later change of mind), each
 *    with a weight (`weights`: 1 plain, 2 elite, 3 boss). The meteor falls on the enemy's place whose neighbourhood (`cluster` px, centre
 *    distance) weighs most; equal weights go to the first in skill order. With the laser on it falls on the laser's dot as it is at the
 *    cast (the player's one control) and what counts is the weight round the dot.
 *  - Ready: that weight is at least `minWeight` (3). So a boss alone is enough, an elite alone (2) is not, an elite with one plain enemy
 *    near it is. (The design's "or an elite or boss" is read as the weights already counting them for more.)
 *  - Reach: the whole field (rank 5).
 *  - Rings: the enemies whose body touches the circle at the moment the ring lands (not where the aim thought they would be) take
 *    `inner.power` x D (inner) and `outer.power` x D (outer), D = the cat's `stats.damage` at the CAST, through `damageEnemy` (armour, ward,
 *    the vulnerability cap, the elite / boss allowance), no crit, no random numbers. An enemy in the middle takes both rings.
 *  - Areas: the three radii grow with the cat's area bonuses like the passive's black hole does (`areaOf`: the level-7 perk, the toys that
 *    widen areas), worked out at the cast and shown in the payload. The aim's `cluster` does not grow.
 *  - Crater: from the inner landing for `crater.life` seconds, every `crater.every` seconds (the first at the landing, after the inner ring's
 *    damage) every enemy touching the crater gets the fire cat's burn: `crater.burn` x D / the cat's attack interval a second (fixed at the
 *    cast), refreshed for `every + 0.25` s, so it burns on without a gap while it stands in the crater and a little after it leaves. Damage
 *    over time is credited to the cat. The burn counts as a magic status (the mage synergy's burst can go off on a burning enemy that falls).
 *  - The meteor belongs to the cast, not to the cat: it lands even if the cat was sold, merged, molted or awakened meanwhile.
 *  - It rides the delayed list (`later.ts`), one item at a time (a landing, an outer ring, then a pulse after another, then the end), so it
 *    stands still with a choice popup, goes at 2x and 3x with the simulation, runs through wave and stage changes, and, since nothing runs in
 *    `prep`, whatever falls due there happens in the first tick of the next wave (all of it in one pass, on schedule). Nothing is saved.
 */
import { SP_ROWS } from '../../data/spSkills';
import { BOSS_SPECS } from '../../data/enemies';
import { HASTE_CAP, TICK } from '../../data/balance';
import { pathPoint, type PathPoint } from '../../geometry';
import type { StrikePoint } from '../../api';
import { areaOf } from '../combat';
import { applyStatus, damageEnemy } from '../enemies';
import type { Sim } from '../sim';
import type { SimEnemy, SimUnit } from '../types';
import { announceCast } from './cast';
import { later, registerLater, type LaterItem } from './later';
import { enemiesAround, heaviestCluster, type ClusterPoint } from './near';
import { sortSkillOrder } from './target';
import type { SpHandler } from './types';

const ROW = SP_ROWS.meteor;
const W = ROW.weights;
/** How long one refresh of the crater's burn lasts: a little more than the gap between refreshes, so it never flickers out. */
const BURN_HOLD = ROW.crater.every + 0.25;

/** The stages of one meteor, in `LaterItem.b`; a crater pulse k is `PULSE + k`. */
const INNER = 0;
const OUTER = 1;
const END = 2;
const PULSE = 3;

/** One meteor in the air or burning on the ground. */
interface Meteor {
  id: number;
  unit: SimUnit;
  x: number;
  y: number;
  landAt: number;
  innerRadius: number;
  outerRadius: number;
  craterRadius: number;
  innerDamage: number;
  outerDamage: number;
  /** Burn damage per second, fixed at the cast. */
  burn: number;
}

interface Book {
  seq: number;
  live: Map<number, Meteor>;
}

const books = new WeakMap<Sim, Book>();

function bookOf(s: Sim): Book {
  let b = books.get(s);
  if (!b) {
    b = { seq: 0, live: new Map() };
    books.set(s, b);
  }
  return b;
}

const point: PathPoint = { x: 0, y: 0, angle: 0 };

/**
 * Where on the road (`travelled`) an enemy will be `ticks` ticks from now: the walk of `updateEnemies` with the statuses it has now held as
 * they are (slow and haste stay; a stun or freeze ends at its time; a shove's slide runs out; the whirl ends at its time; a fish walks at its
 * share of the speed until its time is up). Changes nothing.
 */
export function travelledAfter(s: Sim, e: SimEnemy, ticks: number): number {
  let t = e.travelled;
  let left = e.shoveLeft;
  const nap = 1 - (s.fx.enemySlow ?? 0);
  let haste = e.hasted ? e.hasteAmount : 0;
  if (e.spec.ability === 'enrage') {
    const bonus = BOSS_SPECS.enrage.maxBonus * (1 - e.hp / e.maxHp);
    if (bonus > haste) haste = bonus;
  }
  const base = e.speed * (1 - e.slow) * nap * TICK;
  const fish = e.fish;
  // The clock is added up tick by tick the way the simulation's is, so a status that ends exactly on a tick ends on the same one.
  let now = s.time;
  for (let k = 1; k <= ticks; k++) {
    now += TICK;
    if (left > 0) {
      // A slide carries the enemy back and it does not walk (`slideBack`).
      let d = e.shoveStep < left ? e.shoveStep : left;
      if (d > t) d = t;
      left -= d;
      if (d <= 0 || left < 1e-9) left = 0;
      t -= d;
      continue;
    }
    if ((e.stunned && now < e.stunUntil) || (e.frozen && now < e.freezeUntil)) continue;
    let h = haste;
    if (s.whirlUntil > now && s.whirlSpeed > h) h = s.whirlSpeed;
    if (h > HASTE_CAP) h = HASTE_CAP;
    // The alchemist's fish walks at a share of its speed until its time is up (`statusStep` ends it on the tick `now >= fishUntil`). Multiplying
    // by exactly 1 changes no number for an enemy that is not a fish.
    t += base * (1 + h) * (fish && now < e.fishUntil ? SP_ROWS.fish.fishSpeed : 1);
  }
  return t;
}

/** What the aim found (set by `aim`). */
let aimX = 0;
let aimY = 0;
let aimWeight = 0;
let aimLaser = false;

/**
 * Works out where the meteor would fall right now into `aimX` / `aimY` / `aimWeight` / `aimLaser`. Returns true when the weight there reaches
 * `minWeight`. Changes nothing in the battle.
 */
function aim(s: Sim): boolean {
  const order: SimEnemy[] = [];
  for (const e of s.enemies) if (!e.dead) order.push(e);
  aimWeight = 0;
  aimLaser = false;
  if (order.length === 0) return false;
  sortSkillOrder(order);
  const ticks = Math.round(ROW.warn / TICK);
  const points: ClusterPoint[] = [];
  for (const e of order) {
    pathPoint(travelledAfter(s, e, ticks), point);
    points.push({ x: point.x, y: point.y, w: e.isBoss ? W[2] : e.isElite ? W[1] : W[0] });
  }
  const laser = s.laser;
  if (laser.active) {
    aimLaser = true;
    aimX = laser.x;
    aimY = laser.y;
    const r2 = ROW.cluster * ROW.cluster;
    for (const p of points) {
      const dx = p.x - aimX;
      const dy = p.y - aimY;
      if (dx * dx + dy * dy <= r2) aimWeight += p.w;
    }
  } else {
    const best = { sum: 0 };
    const i = heaviestCluster(points, ROW.cluster, best);
    if (i < 0) return false;
    const p = points[i] as ClusterPoint;
    aimX = p.x;
    aimY = p.y;
    aimWeight = best.sum;
  }
  return aimWeight >= ROW.minWeight;
}

const buf: SimEnemy[] = [];

/** A ring lands: the event first, then the damage to every enemy its circle touches now. */
function ring(s: Sim, m: Meteor, which: 'inner' | 'outer'): void {
  const radius = which === 'inner' ? m.innerRadius : m.outerRadius;
  const damage = which === 'inner' ? m.innerDamage : m.outerDamage;
  enemiesAround(s, m.x, m.y, radius, buf);
  if (s.ev.has('meteorLand')) {
    const points: StrikePoint[] = [];
    for (const e of buf) points.push({ x: e.x, y: e.y, uid: e.uid });
    s.ev.emit('meteorLand', { meteorId: m.id, unit: m.unit, ring: which, x: m.x, y: m.y, radius, points });
  }
  const type = m.unit.spec.damageType;
  for (const e of buf) if (!e.dead) damageEnemy(s, e, damage, type, m.unit, false, null);
}

/**
 * One refresh of the crater's burn on everyone standing in it. `applyStatus` takes the end of the burn it is given, not the later of two, and
 * names its caller as the source, which is right for the fire cat's own long burn but would make this short refresh (every 0.5 s) cut another
 * cat's longer burn down to 0.75 s and take its damage credit; so a burn that would end later keeps its end and its source (the crater's
 * strength still counts: `applyStatus` keeps the higher damage a second).
 */
function pulse(s: Sim, m: Meteor): void {
  enemiesAround(s, m.x, m.y, m.craterRadius, buf);
  for (const e of buf) {
    if (e.dead) continue;
    const until = e.burning ? e.burnUntil : 0;
    const src = e.burnSrc;
    applyStatus(s, e, 'burn', m.burn, BURN_HOLD, m.unit);
    if (until > e.burnUntil) {
      e.burnUntil = until;
      e.burnSrc = src;
    }
  }
}

/** Puts the next stage of the crater on the list: pulse `k + 1` on the grid of `every` seconds from the landing, or the end. */
function after(s: Sim, m: Meteor, k: number): void {
  const next = m.landAt + (k + 1) * ROW.crater.every;
  const end = m.landAt + ROW.crater.life;
  if (next < end - 1e-9) later(s, next - s.time, 'meteor', { unit: m.unit, x: m.x, y: m.y, a: m.id, b: PULSE + k + 1 });
  else later(s, end - s.time, 'meteor', { unit: m.unit, x: m.x, y: m.y, a: m.id, b: END });
}

registerLater('meteor', (s: Sim, item: LaterItem) => {
  const book = books.get(s);
  const m = book?.live.get(item.a);
  if (!book || !m) return;
  if (item.b === INNER) {
    later(s, m.landAt + ROW.outer.delay - s.time, 'meteor', { unit: m.unit, x: m.x, y: m.y, a: m.id, b: OUTER });
    ring(s, m, 'inner');
    pulse(s, m);
    after(s, m, 0);
  } else if (item.b === OUTER) {
    ring(s, m, 'outer');
  } else if (item.b === END) {
    book.live.delete(m.id);
    if (s.ev.has('craterEnd')) s.ev.emit('craterEnd', { meteorId: m.id, unit: m.unit, x: m.x, y: m.y, radius: m.craterRadius });
  } else {
    const k = item.b - PULSE;
    pulse(s, m);
    after(s, m, k);
  }
});

export const meteor: SpHandler = {
  ready(s) {
    return aim(s);
  },

  cast(s, u) {
    if (!aim(s)) return false;
    const book = bookOf(s);
    const area = areaOf(s, u);
    const d = u.stats.damage;
    const m: Meteor = {
      id: ++book.seq, unit: u, x: aimX, y: aimY, landAt: s.time + ROW.warn,
      innerRadius: ROW.inner.radius * area, outerRadius: ROW.outer.radius * area, craterRadius: ROW.crater.radius * area,
      innerDamage: ROW.inner.power * d, outerDamage: ROW.outer.power * d, burn: (ROW.crater.burn * d) / u.stats.interval,
    };
    book.live.set(m.id, m);
    later(s, ROW.warn, 'meteor', { unit: u, x: m.x, y: m.y, a: m.id, b: INNER });
    announceCast(s, u, {
      skill: 'meteor',
      data: {
        meteorId: m.id, impactX: m.x, impactY: m.y, onLaser: aimLaser, at: s.time, warn: ROW.warn, innerRadius: m.innerRadius, outerRadius: m.outerRadius,
        outerDelay: ROW.outer.delay, craterRadius: m.craterRadius, craterLife: ROW.crater.life,
      },
    });
    return true;
  },
};
