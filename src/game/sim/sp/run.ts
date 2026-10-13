/**
 * The running body (docs/design_skills_v2.md 3.3, 3.6, 5.1): a body that runs along the road for a stretch at a speed and touches every
 * enemy it passes once. The tiger general runs against the flow after a leap, the starlight archer's arrow once round the road with it;
 * both use this file. A run is an entry on `Sim.runners` that `stepRunners` advances by one tick (called first in the skills' pass,
 * `sim/spSkills.ts`, so a run that was cast in a tick starts to move in the next one).
 *
 * THE SWEEP. The body moves far in one tick (1000 px/s is 17 px, 2000 px/s is 33 px), so a point test would let enemies through. Every
 * tick the body covers an INTERVAL of its run, from where its head was to where it is now, and an enemy is touched when its centre lies in
 * that interval widened by its own radius on both sides. The interval is measured along the run, not along the road: `u` is how far
 * ahead of the start, in the direction of the run, the enemy stands, taken modulo the length of the loop, so the seam of the loop (where
 * the road coordinate wraps from its end to 0) is no special case. Two ticks' intervals overlap by the radius, so no enemy can slip
 * through between them whatever it does in the meantime (walks on, is pushed back at most 8 px a tick, spawns, splits): the only way to be
 * missed is to be farther than a radius ahead of the head one tick and farther than a radius behind it the next. The run's range is
 * shorter than the loop, except for the lap (one loop and a bit), where an enemy can be inside it twice; the images `u - L`, `u`, `u + L`
 * are tried and the first that fits counts, and the touched list (`touched`, by uid) keeps it to one touch.
 *
 * Within one tick the touched enemies are dealt with in the order the body meets them (smallest `u`, then the lower uid). The list is
 * collected before anything is damaged, so what happens in the meantime (a kill, a split, a burst) cannot change it; an enemy that is dead
 * by its turn is skipped, one that spawns during the tick waits for the next tick's interval.
 *
 * The first tick of a run that has a lead (the tiger's leap) also covers `lead` px behind the start, in the direction opposite to the run:
 * enemies kept walking during the leap, and the ones at the front of the stretch have walked on past the spot where the tiger comes down.
 * They are under its paws when it lands.
 *
 * Damage is `amount` a touch, one pool for the whole run (`pool`, infinite for the tiger): a touch takes what is left of it. A run with a
 * pool RESERVES it for the enemies that stood on the field when it started (uid up to `maxUid`: "everyone is hit", the design's promise
 * that the arrow never passes an enemy without a star): an enemy that appeared later (a spawn, a split) is touched only while the pool
 * still covers a share for every original that is alive and not yet touched. Without the reserve, a late spawn met before the last
 * originals took their share and left them without a star (the review measured it in a quarter of the casts over 16 enemies in endless
 * mode). Nothing rolls
 * a crit. With `burstRadius` an enemy the body fells bursts (the lap): the enemies within the radius take `burstDamage`, once, and a
 * burst never sets off another. The cat that cast may be sold or merged away meanwhile: the run goes on and the damage still counts for
 * it (`damageEnemy`, `killEnemy` already deal with a removed `src`).
 */
import { PATH_LENGTH, wrapPath } from '../../geometry';
import { TICK } from '../../data/balance';
import { damageEnemy } from '../enemies';
import type { Sim } from '../sim';
import type { SimEnemy, SimUnit } from '../types';
import { sortSkillOrder } from './target';

export interface SpRunner {
  id: number;
  skill: 'charge' | 'lap';
  src: SimUnit;
  /** +1 with the flow of the enemies, -1 against it. */
  dir: 1 | -1;
  /** Road coordinate in [0, PATH_LENGTH) of the head at the start of its run. */
  start: number;
  /** px the run covers, px the head moves a tick, and the number of ticks of movement (the last one stops at `dist`). */
  dist: number;
  step: number;
  runTicks: number;
  /** Ticks after the cast before the head starts to move (the leap). */
  delayTicks: number;
  /** px the first tick of movement also covers behind the start. */
  lead: number;
  /** Ticks since the cast, and how far the head has come. */
  age: number;
  head: number;
  hits: number;
  /** uids of the enemies already touched. */
  touched: Set<number>;
  /** Damage of a touch, and what is left of the run's pool (nominal damage before armour; Infinity = no pool). */
  amount: number;
  pool: number;
  /** The newest enemy uid on the field at the cast: the "originals" the pool is reserved for (only matters for a run with a pool). */
  maxUid: number;
  ignoreDefence: boolean;
  /** The burst of a felled enemy: damage and radius (radius 0 = none). */
  burstDamage: number;
  burstRadius: number;
}

export interface RunLaunch {
  skill: 'charge' | 'lap';
  src: SimUnit;
  dir: 1 | -1;
  /** Any road coordinate; wrapped into [0, PATH_LENGTH). */
  start: number;
  dist: number;
  /** px/s. */
  speed: number;
  /** Seconds before the head starts to move. */
  delay?: number;
  lead?: number;
  amount: number;
  pool?: number;
  ignoreDefence?: boolean;
  burstDamage?: number;
  burstRadius?: number;
}

/** Puts a run on the simulation's list. Its first movement is in the next tick. */
export function launchRun(s: Sim, p: RunLaunch): SpRunner {
  const step = p.speed * TICK;
  const r: SpRunner = {
    id: ++s.runSeq, skill: p.skill, src: p.src, dir: p.dir, start: wrapPath(p.start), dist: p.dist, step,
    runTicks: Math.max(1, Math.ceil(p.dist / step - 1e-9)), delayTicks: Math.round((p.delay ?? 0) / TICK), lead: p.lead ?? 0,
    age: 0, head: 0, hits: 0, touched: new Set<number>(), amount: p.amount, pool: p.pool ?? Infinity, maxUid: s.uidEnemy,
    ignoreDefence: p.ignoreDefence ?? false, burstDamage: p.burstDamage ?? 0, burstRadius: p.burstRadius ?? 0,
  };
  s.runners.push(r);
  return r;
}

/** Scratch lists: the enemies one sweep touches (in the order they are met) and where along the run, and the victims of a burst. */
const met: SimEnemy[] = [];
const metAt: number[] = [];
const caught: SimEnemy[] = [];

/** Advances every run by one tick and ends the ones that reached the end of their stretch. */
export function stepRunners(s: Sim): void {
  const list = s.runners;
  for (let i = 0; i < list.length; i++) {
    const r = list[i] as SpRunner;
    r.age++;
    const k = r.age - r.delayTicks;
    if (k <= 0) continue;
    const last = k >= r.runTicks;
    sweep(s, r, k === 1 ? 0 : (k - 1) * r.step, last ? r.dist : k * r.step, k === 1 ? r.lead : 0);
    if (!last) continue;
    list.splice(i, 1);
    i--;
    if (s.ev.has('spRunEnd')) s.ev.emit('spRunEnd', { runId: r.id, skill: r.skill, unit: r.src, hits: r.hits });
  }
}

/** The head moved from `from` to `to` px along the run this tick: touch every enemy it passed. */
function sweep(s: Sim, r: SpRunner, from: number, to: number, lead: number): void {
  r.head = to;
  met.length = 0;
  metAt.length = 0;
  for (const e of s.enemies) {
    if (e.dead || r.touched.has(e.uid)) continue;
    const radius = e.spec.radius;
    const lo = from - lead - radius;
    const u = wrapPath(r.dir * (e.travelled - r.start));
    let v = u - PATH_LENGTH;
    if (v < lo) v = u;
    if (v < lo) v = u + PATH_LENGTH;
    if (v > to + radius) continue;
    let j = met.length;
    met.push(e);
    metAt.push(v);
    while (j > 0 && ((metAt[j - 1] as number) > v || ((metAt[j - 1] as number) === v && (met[j - 1] as SimEnemy).uid > e.uid))) {
      met[j] = met[j - 1] as SimEnemy;
      metAt[j] = metAt[j - 1] as number;
      j--;
    }
    met[j] = e;
    metAt[j] = v;
  }
  const type = r.src.spec.damageType;
  for (let n = 0; n < met.length; n++) {
    const e = met[n] as SimEnemy;
    if (e.dead) continue;
    r.touched.add(e.uid);
    const dmg = r.amount < r.pool ? r.amount : r.pool;
    if (!(dmg > 1e-9)) continue;
    // A late enemy (it appeared after the cast) is passed by if the pool would then fall short of a share for every original still owed one.
    if (e.uid > r.maxUid && r.pool !== Infinity && r.pool - dmg < owed(s, r) * r.amount - 1e-9 * r.amount) continue;
    r.pool -= dmg;
    r.hits++;
    if (s.ev.has('spRunHit')) s.ev.emit('spRunHit', { runId: r.id, skill: r.skill, enemy: e, x: e.x, y: e.y, head: to });
    if (damageEnemy(s, e, dmg, type, r.src, false, null, r.ignoreDefence) && r.burstRadius > 0) burst(s, r, e);
  }
}

/** How many of the enemies that stood on the field at the cast are alive and not yet touched: each is still owed a share of the pool. */
function owed(s: Sim, r: SpRunner): number {
  let n = 0;
  for (const o of s.enemies) if (o.uid <= r.maxUid && !o.dead && !r.touched.has(o.uid)) n++;
  return n;
}

/** The burst of an enemy the run felled: everything whose body touches the circle around where it fell takes `burstDamage`, once. */
function burst(s: Sim, r: SpRunner, fallen: SimEnemy): void {
  const x = fallen.x;
  const y = fallen.y;
  caught.length = 0;
  for (const o of s.enemies) {
    if (o.dead) continue;
    const dx = o.x - x;
    const dy = o.y - y;
    const reach = r.burstRadius + o.spec.radius;
    if (dx * dx + dy * dy <= reach * reach) caught.push(o);
  }
  sortSkillOrder(caught);
  if (s.ev.has('spRunBurst')) {
    s.ev.emit('spRunBurst', {
      runId: r.id, skill: 'lap', x, y, radius: r.burstRadius, points: caught.map((o) => ({ x: o.x, y: o.y, uid: o.uid })),
    });
  }
  const type = r.src.spec.damageType;
  for (const o of caught) if (!o.dead) damageEnemy(s, o, r.burstDamage, type, r.src, false, null);
}
