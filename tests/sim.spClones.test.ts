/**
 * The ninja's skill, Surprise Clones (docs/design_skills_v2.md 3.4 with 3.4.1 to 3.4.4, 4.4, 4.5 and the appendix; directive decisions 2, 3
 * and 11): two phantom attackers that belong to the ninja, never units on the board. They stand on the two nearest empty tiles (stacked on
 * the ninja's tile when there are none), echo the ninja's volley with one shuriken each four times at an enemy the volley is not on, never
 * block a tile, and go at their last throw, after 8 s, when a new cast replaces them, with the ninja, and at the end of a stage or of the
 * battle. The frame it stands on (the gauge, the cast, the order of several full gauges) is tested in `sim.spSkills.test.ts`.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { BattleEvents, BattleInit, CloneEndReason, EnemyId, SpClonesData, UnitId } from '@/game/api';
import { UNIT_IDS } from '@/game/api';
import { LASER_RADIUS, TICK } from '@/game/data/balance';
import { enemySpec } from '@/game/data/enemies';
import { SP_ROWS } from '@/game/data/spSkills';
import { unitDef } from '@/game/data/units';
import { CELL_COUNT, PATH_TOP, cellCenterX, cellCenterY } from '@/game/geometry';
import { openSummonOffer, placeUnit } from '@/game/sim/board';
import { lose, startWave } from '@/game/sim/flow';
import { launch } from '@/game/sim/combat';
import { clones, endClones, followVolley } from '@/game/sim/sp/clones';
import { SP_HANDLERS } from '@/game/sim/sp/registry';
import type { Sim } from '@/game/sim/sim';
import type { SimEnemy, SimUnit } from '@/game/sim/types';
import { advance, foe, newSim, put, quietWave, record, rich, slay } from './simHelpers';

const ROW = SP_ROWS.clones;
/** The damage of one cucumber hit by a ninja's shuriken (level 1: 30 damage, the cucumber ignores 8% of physical damage), without a crit. */
const HIT = 30 * (1 - enemySpec('cucumber').armor);
const NINJA_INDEX = UNIT_IDS.indexOf('r_ninja');

// ───────────────────────────── helpers ─────────────────────────────

/** A battle in its first wave with the scripted spawns cancelled and the wave made endless: a test controls the field. */
function arena(over: Partial<BattleInit> = {}, level = 1): Sim {
  const sim = newSim(over, level);
  quietWave(sim);
  sim.waveDuration = 1e6;
  // No sunbeam tile: a ninja on one throws 20% faster, and the tests count seconds.
  sim.sunCell.fill(0);
  return sim;
}

/** A ninja whose skill gauge is empty (it casts only when a test says so), with no crit so every shuriken is the same size. */
function ninja(sim: Sim, cell: number, charge = 0): SimUnit {
  const u = put(sim, cell, 'r_ninja', charge);
  u.sp = 0;
  u.stats.crit = 0;
  return u;
}

/**
 * `n` cucumbers held in place along the top of the road, the oldest first (the first has travelled the farthest and stands on the left).
 * Every one is inside the range of a ninja on the middle tile and of both of its neighbours up and down.
 */
function crowd(sim: Sim, n: number, x0 = 150, step = 30): SimEnemy[] {
  const out: SimEnemy[] = [];
  for (let i = 0; i < n; i++) {
    const e = foe(sim, 'cucumber', 600 - i * 10);
    e.frozen = true;
    e.x = x0 + i * step;
    e.y = PATH_TOP;
    out.push(e);
  }
  return out;
}

/** An enemy held in place at a point. */
function hold(sim: Sim, x: number, y: number, travelled = 300, id: EnemyId = 'cucumber'): SimEnemy {
  const e = foe(sim, id, travelled);
  e.frozen = true;
  e.x = x;
  e.y = y;
  return e;
}

/** Casts through the handler, as the gauge pass does once `ready` has said yes (the ready condition has its own tests). */
function cast(sim: Sim, u: SimUnit): void {
  expect(clones.cast(sim, u)).toBe(true);
}

/** Steps until `done()` or `max` seconds have passed; fails the test when the time runs out. */
function until(sim: Sim, done: () => boolean, max = 20, what = 'the condition'): void {
  for (let i = 0; i < Math.round(max / TICK); i++) {
    if (done()) return;
    sim.step(TICK);
  }
  expect(done(), `${what} within ${max} s`).toBe(true);
}

interface Seen {
  type: keyof BattleEvents;
  time: number;
  payload: unknown;
}

/** Every event of the listed types, in the order they were emitted, with the simulation time. */
function tape(sim: Sim, types: Array<keyof BattleEvents>): Seen[] {
  const out: Seen[] = [];
  for (const type of types) sim.events.on(type, (payload) => out.push({ type, time: sim.time, payload }));
  return out;
}

/** The payloads of the clones' casts. */
function castsOf(sim: Sim): SpClonesData[] {
  const out: SpClonesData[] = [];
  sim.events.on('spCast', (e) => {
    if (e.skill === 'clones') out.push(e.data);
  });
  return out;
}

/** Every empty tile, in tile order. */
function emptyTiles(sim: Sim): number[] {
  const out: number[] = [];
  for (let c = 0; c < CELL_COUNT; c++) if (sim.units[c] === null) out.push(c);
  return out;
}

/** Fills every tile that is empty and not in `keep` with a plain cat (a `put` that skips the tiles the test wants to stay empty). */
function fillExcept(sim: Sim, keep: number[], id: UnitId = 'w_paw'): void {
  for (let c = 0; c < CELL_COUNT; c++) if (sim.units[c] === null && !keep.includes(c)) put(sim, c, id, 0);
}

function standing(u: SimUnit): number[] {
  return u.clone.filter((c) => c.cell >= 0).map((c) => c.cell);
}

const restores: Array<() => void> = [];
afterEach(() => {
  while (restores.length > 0) (restores.pop() as () => void)();
});

/** Changes a knob of the row for one test. */
function knob<K extends 'spread' | 'copyTargetsPerk' | 'throws' | 'maxLife' | 'arrive' | 'readyMinEnemies'>(key: K, value: (typeof ROW)[K]): void {
  const before = ROW[key];
  ROW[key] = value;
  restores.push(() => {
    ROW[key] = before;
  });
}

// ───────────────────────────── the data and the registration ─────────────────────────────

describe('Surprise Clones, the data', () => {
  it('has the design appendix\'s cells and is built: the ninja carries the skill and its handler is registered', () => {
    expect(ROW).toMatchObject({
      id: 'clones', unit: 'r_ninja', rank: 3, cooldown: 18, clones: 2, throws: 4, arrive: 0.3, maxLife: 8, copyTargetsPerk: false, spread: true,
      readyMinEnemies: 5, seats: 'nearestEmpty', figureCap: 10, numbers: 'ninjaStats', reachFrom: 'cloneTile', built: true,
    });
    expect(ROW.stackOffset).toEqual({ x: 16, y: -6, scale: 0.92, alpha: 0.45, standingAlpha: 0.55 });
    expect(unitDef('r_ninja').spSkill).toEqual({ id: 'clones', rank: 3, cooldown: 18, nameKey: 'sp.clones.name' });
    expect(SP_HANDLERS.clones).toBe(clones);
  });

  it('gives every cat an empty list of clones, and the ninja none until it casts', () => {
    const sim = arena();
    const u = ninja(sim, 12);
    const paw = put(sim, 0, 'w_paw');
    expect(u.clone).toEqual([]);
    expect(paw.clone).toEqual([]);
    expect(sim.cloners).toEqual([]);
  });

  it('fills the ninja\'s gauge in 18 s, from the 50% a cat starts at in 9 s, and casts as soon as five enemies are in reach', () => {
    const sim = arena();
    const u = put(sim, 12, 'r_ninja', 0);
    expect(u.sp).toBe(0.5);
    crowd(sim, 5);
    const casts = castsOf(sim);
    advance(sim, 8.9);
    expect(casts).toHaveLength(0);
    expect(u.sp).toBeLessThan(1);
    advance(sim, 0.3);
    expect(casts).toHaveLength(1);
    expect(u.sp).toBeLessThan(0.1);
    expect(u.clone).toHaveLength(2);
  });
});

// ───────────────────────────── when it is ready ─────────────────────────────

describe('the ready condition: five enemies in the ninja\'s own reach', () => {
  it('is not ready with four, ready with five, and counts neither enemies out of reach nor dead ones', () => {
    const sim = arena();
    const u = ninja(sim, 12);
    const list = crowd(sim, 4);
    expect(clones.ready(sim, u)).toBe(false);
    const far = hold(sim, 700, 640);
    expect(clones.ready(sim, u)).toBe(false);
    const fifth = hold(sim, 330, PATH_TOP);
    expect(clones.ready(sim, u)).toBe(true);
    fifth.dead = true;
    expect(clones.ready(sim, u)).toBe(false);
    fifth.dead = false;
    far.dead = false;
    expect(list).toHaveLength(4);
  });

  it('reads the knob', () => {
    const sim = arena();
    const u = ninja(sim, 12);
    crowd(sim, 3);
    expect(clones.ready(sim, u)).toBe(false);
    knob('readyMinEnemies', 3);
    expect(clones.ready(sim, u)).toBe(true);
  });

  it('waits full with four enemies and casts within 0.2 s of the fifth (the pass asks every 0.2 s, not every tick)', () => {
    const sim = arena();
    const u = ninja(sim, 12);
    crowd(sim, 4);
    const casts = castsOf(sim);
    u.sp = 1;
    advance(sim, 1);
    expect(casts).toHaveLength(0);
    expect(u.sp).toBe(1);
    hold(sim, 330, PATH_TOP);
    advance(sim, 0.21);
    expect(casts).toHaveLength(1);
    expect(u.sp).toBeLessThan(0.05);
  });

  it('does not cast a blocked ninja\'s skill: a full gauge waits for the end of the hazard', () => {
    const sim = arena();
    const u = ninja(sim, 12);
    crowd(sim, 6);
    sim.hazardCount[12] = 1;
    u.sp = 1;
    const casts = castsOf(sim);
    advance(sim, 1);
    expect(casts).toHaveLength(0);
    sim.hazardCount[12] = 0;
    advance(sim, 0.6);
    expect(casts).toHaveLength(1);
  });
});

// ───────────────────────────── the seats ─────────────────────────────

describe('where the clones stand', () => {
  it('stand on the nearest empty tiles by distance between centres: above and below (96 px) before left and right (108 px)', () => {
    const sim = arena();
    const u = ninja(sim, 12);
    crowd(sim, 5);
    const casts = castsOf(sim);
    cast(sim, u);
    expect(standing(u)).toEqual([7, 17]);
    expect(casts[0]).toEqual({
      seats: [
        { cell: 7, stacked: false, x: cellCenterX(7), y: cellCenterY(7) },
        { cell: 17, stacked: false, x: cellCenterX(17), y: cellCenterY(17) },
      ],
      throws: 4, arrive: 0.3, at: sim.time, life: 8,
    });
    expect(u.clone.map((c) => c.index)).toEqual([0, 1]);
    expect(u.clone.every((c) => c.left === 4)).toBe(true);
    expect(sim.cloners).toEqual([u]);
  });

  it('take the lower tile number when two tiles are equally near (the top row: below, then the left neighbour)', () => {
    const sim = arena();
    const u = ninja(sim, 2);
    crowd(sim, 5);
    cast(sim, u);
    expect(standing(u)).toEqual([7, 1]);
  });

  it('go to the nearest tiles that are empty, however far (the surrounding eight are cats)', () => {
    const sim = arena();
    const u = ninja(sim, 12);
    crowd(sim, 5);
    fillExcept(sim, [2, 22]);
    cast(sim, u);
    expect(standing(u)).toEqual([2, 22]);
  });

  it('put the second clone on the ninja when only one tile is empty, and both when none is: stacked, on the ninja\'s own tile', () => {
    const sim = arena();
    const u = ninja(sim, 12);
    crowd(sim, 5);
    fillExcept(sim, [3]);
    const casts = castsOf(sim);
    cast(sim, u);
    expect(u.clone.map((c) => c.cell)).toEqual([3, -1]);
    expect(casts[0]?.seats).toEqual([
      { cell: 3, stacked: false, x: cellCenterX(3), y: cellCenterY(3) },
      { cell: 12, stacked: true, x: cellCenterX(12), y: cellCenterY(12) },
    ]);
    const full = arena();
    const v = ninja(full, 12);
    crowd(full, 5);
    fillExcept(full, []);
    expect(emptyTiles(full)).toEqual([]);
    const castsFull = castsOf(full);
    cast(full, v);
    expect(v.clone.map((c) => c.cell)).toEqual([-1, -1]);
    expect(castsFull[0]?.seats.every((x) => x.stacked && x.cell === 12)).toBe(true);
  });

  it('never take a tile: a clone is not a unit, so the board still counts the tile as empty and the game treats it as one', () => {
    const sim = arena();
    const u = ninja(sim, 12);
    crowd(sim, 5);
    fillExcept(sim, [7, 17]);
    cast(sim, u);
    expect(standing(u)).toEqual([7, 17]);
    expect(sim.units[7]).toBeNull();
    expect(sim.units[17]).toBeNull();
    expect(emptyTiles(sim)).toEqual([7, 17]);
    expect(sim.units.filter((x) => x !== null).every((x) => (x as SimUnit).clone.length === 0 || x === u)).toBe(true);
    expect(sim.dropAction(0, 7)).toBe('move');
    sim.fish = 10_000;
    expect(sim.summon()).toBeNull();
  });

  it('do not count for the synergies or anything that reads the board', () => {
    const sim = arena();
    const u = ninja(sim, 12);
    crowd(sim, 5);
    const read = (): unknown => ({
      tier: Array.from(sim.tier), distinct: Array.from(sim.distinct), special: Array.from(sim.special), units: sim.units.filter(Boolean).length, summoned: sim.summonedUnits,
    });
    const before = read();
    cast(sim, u);
    expect(read()).toEqual(before);
  });

  it('keep two ninjas\' clones on four different tiles (a tile another ninja\'s clone stands on does not count as empty)', () => {
    const sim = arena();
    const a = ninja(sim, 12);
    const b = ninja(sim, 13);
    crowd(sim, 5);
    cast(sim, a);
    cast(sim, b);
    expect(standing(a)).toEqual([7, 17]);
    // Tiles 8 and 18 are the next nearest to 13 (96 px); 7 and 17 are taken.
    expect(standing(b)).toEqual([8, 18]);
    const all = [...standing(a), ...standing(b)];
    expect(new Set(all).size).toBe(4);
    expect(sim.cloners).toEqual([a, b]);
  });

  it('send the ninja\'s old clones away first when it casts again, and may take the same tiles', () => {
    const sim = arena();
    const u = ninja(sim, 12);
    crowd(sim, 5);
    const seen = tape(sim, ['cloneEnd', 'spCast']);
    cast(sim, u);
    advance(sim, 1);
    cast(sim, u);
    const kinds = seen.map((x) => (x.type === 'cloneEnd' ? `end:${(x.payload as BattleEvents['cloneEnd']).reason}:${(x.payload as BattleEvents['cloneEnd']).index}` : 'cast'));
    expect(kinds).toEqual(['cast', 'end:replaced:0', 'end:replaced:1', 'cast']);
    expect(standing(u)).toEqual([7, 17]);
    expect(u.clone.every((c) => c.left === 4)).toBe(true);
    expect(sim.cloners).toEqual([u]);
  });
});

// ───────────────────────────── the throws ─────────────────────────────

describe('the clones\' throws', () => {
  it('echo the ninja\'s volley: one shuriken each, at the 4th and 5th oldest, never at an enemy the ninja is on', () => {
    const sim = arena();
    const u = ninja(sim, 12);
    const list = crowd(sim, 8);
    const attacks = record(sim, 'attack');
    const throws = record(sim, 'cloneThrow');
    // Where each shuriken is when it is thrown (the object moves on in the same tick).
    const starts: Array<[number, number]> = [];
    sim.events.on('cloneThrow', (e) => starts.push([e.projectile.x, e.projectile.y]));
    cast(sim, u);
    until(sim, () => throws.length >= 2, 3, 'the first throws');
    expect(starts).toEqual([[cellCenterX(7), cellCenterY(7)], [cellCenterX(17), cellCenterY(17)]]);
    expect(attacks.map((a) => a.targetUid)).toEqual([list[0], list[1], list[2]].map((e) => (e as SimEnemy).uid));
    expect(throws.map((t) => t.targetUid)).toEqual([(list[3] as SimEnemy).uid, (list[4] as SimEnemy).uid]);
    expect(throws.map((t) => t.index)).toEqual([0, 1]);
    // The clone on tile 7 (above) throws first, then the one on tile 17; each from its own tile's centre.
    expect(throws.map((t) => t.cell)).toEqual([7, 17]);
    expect(throws.map((t) => [t.x, t.y])).toEqual([[cellCenterX(7), cellCenterY(7)], [cellCenterX(17), cellCenterY(17)]]);
    expect(throws.every((t) => !t.stacked && t.left === 3)).toBe(true);
    // The ninja's volley announces itself with `attack` events (three); the clones' shuriken do not (they would make the ninja swing again).
    expect(attacks).toHaveLength(3);
    expect(attacks.every((a) => a.projectile !== null && a.projectile.ghost !== true)).toBe(true);
    expect(throws.every((t) => t.projectile.ghost === true && t.projectile.unitId === 'r_ninja')).toBe(true);
    expect(sim.projectiles.filter((p) => p.ghost === true)).toHaveLength(2);
    expect(sim.projectiles.filter((p) => p.ghost !== true).length).toBeGreaterThanOrEqual(3);
    expect(throws.map((t) => t.projectile.targetUid)).toEqual(throws.map((t) => t.targetUid));
  });

  it('throw at six different enemies at level 7: the ninja has four stars, each clone one (the perk is not copied)', () => {
    const sim = arena({}, 7);
    const u = ninja(sim, 12);
    const list = crowd(sim, 9);
    const attacks = record(sim, 'attack');
    const throws = record(sim, 'cloneThrow');
    cast(sim, u);
    until(sim, () => throws.length >= 2, 3, 'the first throws');
    // Level 7: the ninja throws four stars. The clones do not copy the perk: one each, at the 5th and 6th oldest.
    expect(attacks).toHaveLength(4);
    expect(throws.map((t) => t.targetUid)).toEqual([(list[4] as SimEnemy).uid, (list[5] as SimEnemy).uid]);
    expect(new Set([...attacks.map((a) => a.targetUid), ...throws.map((t) => t.targetUid)]).size).toBe(6);
  });

  it('copy the level 7 perk when the knob says so: two shuriken each, all at different enemies', () => {
    knob('copyTargetsPerk', true);
    const sim = arena({}, 7);
    const u = ninja(sim, 12);
    const list = crowd(sim, 12);
    const throws = record(sim, 'cloneThrow');
    cast(sim, u);
    until(sim, () => throws.length >= 4, 3, 'the first throws');
    expect(throws.map((t) => t.targetUid)).toEqual([4, 5, 6, 7].map((i) => (list[i] as SimEnemy).uid));
    expect(throws.map((t) => t.index)).toEqual([0, 0, 1, 1]);
    // A volley is one throw however many stars it holds.
    expect(u.clone.map((c) => c.left)).toEqual([3, 3]);
  });

  it('may aim at the same enemy as the ninja when the knob `spread` is off: each clone picks the oldest in its own reach', () => {
    knob('spread', false);
    const sim = arena();
    const u = ninja(sim, 12);
    const list = crowd(sim, 8);
    const throws = record(sim, 'cloneThrow');
    cast(sim, u);
    until(sim, () => throws.length >= 2, 3, 'the first throws');
    expect(throws.map((t) => t.targetUid)).toEqual([(list[0] as SimEnemy).uid, (list[0] as SimEnemy).uid]);
  });

  it('start only after they have landed: a volley within the 0.3 s of the leap is the ninja\'s alone and spends nothing', () => {
    const sim = arena();
    const u = ninja(sim, 12, 1);
    crowd(sim, 8);
    const attacks = record(sim, 'attack');
    const throws = record(sim, 'cloneThrow');
    cast(sim, u);
    sim.step(TICK);
    expect(attacks).toHaveLength(3);
    expect(throws).toHaveLength(0);
    expect(u.clone.map((c) => c.left)).toEqual([4, 4]);
    until(sim, () => throws.length >= 2, 3, 'the first throws');
    expect(sim.time).toBeGreaterThan(0.3);
  });

  it('go after four throws each, at the volley that throws the fourth, with one `cloneEnd` (done) each: eight shuriken in all', () => {
    const sim = arena();
    const u = ninja(sim, 12);
    crowd(sim, 8);
    const seen = tape(sim, ['attack', 'cloneThrow', 'cloneEnd']);
    const hits = record(sim, 'hit');
    const born = sim.time;
    cast(sim, u);
    until(sim, () => u.clone.length === 0, 6, 'the clones to go');
    const throws = seen.filter((x) => x.type === 'cloneThrow');
    const ends = seen.filter((x) => x.type === 'cloneEnd');
    expect(throws).toHaveLength(8);
    expect(ends.map((x) => (x.payload as BattleEvents['cloneEnd']).reason)).toEqual(['done', 'done']);
    expect(ends.map((x) => (x.payload as BattleEvents['cloneEnd']).index)).toEqual([0, 1]);
    // Each leaves right after its own fourth throw, in the tick of the ninja's fourth volley: about 4 x 0.8 s after the cast.
    expect(ends[0]?.time).toBe(throws[6]?.time);
    expect(seen.indexOf(ends[0] as Seen)).toBe(seen.indexOf(throws[6] as Seen) + 1);
    expect(seen.indexOf(ends[1] as Seen)).toBe(seen.indexOf(throws[7] as Seen) + 1);
    // Four volleys of the ninja, 0.8 s apart (give or take the tick the gauge fills on).
    expect(Math.abs((ends[1] as Seen).time - born - 4 * u.stats.interval)).toBeLessThan(3 * TICK);
    expect(sim.cloners).toEqual([]);
    // Nothing more is thrown, however long the ninja goes on.
    const count = seen.length;
    advance(sim, 2);
    expect(seen.filter((x) => x.type === 'cloneThrow')).toHaveLength(8);
    expect(seen.length).toBeGreaterThan(count); // the ninja's own volleys go on
    expect(hits.length).toBeGreaterThan(0);
  });

  it('are the ninja\'s shuriken: its damage, its credit, its kills', () => {
    const sim = arena();
    const u = ninja(sim, 12);
    crowd(sim, 8);
    const throws = record(sim, 'cloneThrow');
    const hits = record(sim, 'hit');
    // The shuriken objects are pooled and reused, so what a landing shuriken was is written down when it lands.
    const lands: Array<{ ghost: boolean; hit: boolean }> = [];
    sim.events.on('projectileEnd', (e) => lands.push({ ghost: e.projectile.ghost === true, hit: e.hit }));
    cast(sim, u);
    until(sim, () => throws.length >= 8 && sim.projectiles.length === 0, 8, 'all shuriken to land');
    const ghostLands = lands.filter((l) => l.ghost);
    expect(ghostLands).toHaveLength(8);
    expect(ghostLands.every((l) => l.hit)).toBe(true);
    expect(hits.every((h) => h.unitId === 'r_ninja' && !h.crit && Math.abs(h.amount - HIT) < 1e-9)).toBe(true);
    // 4 volleys x (3 + 2) shuriken.
    expect(hits).toHaveLength(20);
    expect(u.damageDealt).toBeCloseTo(20 * HIT, 6);
    expect(sim.damageByUnit[NINJA_INDEX]).toBeCloseTo(20 * HIT, 6);
  });

  it('roll their crits like the ninja\'s own shuriken, at the ninja\'s chance and multiple', () => {
    const sim = arena();
    const u = ninja(sim, 12);
    u.stats.crit = 1;
    u.stats.critMult = 2;
    crowd(sim, 8);
    const throws = record(sim, 'cloneThrow');
    const hits = record(sim, 'hit');
    cast(sim, u);
    until(sim, () => throws.length >= 2 && sim.projectiles.length === 0, 4, 'the first volley to land');
    expect(hits).toHaveLength(5);
    expect(hits.every((h) => h.crit && Math.abs(h.amount - 2 * HIT) < 1e-9)).toBe(true);
  });

  it('use the ninja\'s damage as it is at the throw', () => {
    const sim = arena();
    const u = ninja(sim, 12);
    crowd(sim, 8);
    cast(sim, u);
    u.stats.damage = 100;
    const throws = record(sim, 'cloneThrow');
    until(sim, () => throws.length >= 2, 3, 'the first throws');
    const hits = record(sim, 'hit');
    until(sim, () => hits.length >= 5, 3, 'the first volley to land');
    expect(hits.every((h) => Math.abs(h.amount - 100 * (1 - enemySpec('cucumber').armor)) < 1e-9)).toBe(true);
  });

  it('rest when nobody is left to aim at: with four enemies only the first clone throws; with three, nobody does, and nothing is spent', () => {
    const sim = arena();
    const u = ninja(sim, 12);
    crowd(sim, 3);
    const throws = record(sim, 'cloneThrow');
    cast(sim, u);
    advance(sim, 1.7);
    expect(throws).toHaveLength(0);
    expect(u.clone.map((c) => c.left)).toEqual([4, 4]);
    hold(sim, 190, PATH_TOP, 300);
    advance(sim, 0.8);
    expect(throws.map((t) => [t.index, t.left])).toEqual([[0, 3]]);
    expect(u.clone.map((c) => c.left)).toEqual([3, 4]);
  });

  it('rest while the ninja rests: no volley, no throw', () => {
    const sim = arena();
    const u = ninja(sim, 12);
    crowd(sim, 8);
    const throws = record(sim, 'cloneThrow');
    cast(sim, u);
    sim.hazardCount[12] = 1;
    advance(sim, 2);
    expect(throws).toHaveLength(0);
    expect(u.clone.map((c) => c.left)).toEqual([4, 4]);
    sim.hazardCount[12] = 0;
    until(sim, () => throws.length >= 2, 3, 'the throws after the hazard');
  });

  it('measure the ninja\'s range from the clone\'s own tile, not from the ninja\'s: a clone sees what the ninja cannot', () => {
    const sim = arena();
    const u = ninja(sim, 0);
    // A is in the ninja's reach (and everyone's); E is 470 px below the ninja's tile centre (range 440 + the cucumber's 18): out of the
    // ninja's reach, 374 px from the tile below it (where the first clone stands) and 482 px from the tile to its right.
    const a = hold(sim, 244, 238, 400);
    const e = hold(sim, 144, 608, 300);
    expect(Math.hypot(e.x - cellCenterX(0), e.y - cellCenterY(0))).toBeGreaterThan(440 + 18);
    const attacks = record(sim, 'attack');
    const throws = record(sim, 'cloneThrow');
    knob('readyMinEnemies', 2);
    cast(sim, u);
    expect(standing(u)).toEqual([5, 1]);
    until(sim, () => attacks.length >= 1, 2, 'the ninja\'s volley');
    expect(attacks.map((x) => x.targetUid)).toEqual([a.uid]);
    expect(throws.map((t) => [t.index, t.cell, t.targetUid])).toEqual([[0, 5, e.uid]]);
    // The second clone, on tile 1, sees only the enemy the volley is on: it rests and spends nothing.
    expect(u.clone.map((c) => c.left)).toEqual([3, 4]);
  });

  it('read the ninja range as it is at the throw (from the clone tile, with the ninja current reach)', () => {
    const sim = arena();
    const u = ninja(sim, 12);
    crowd(sim, 8);
    cast(sim, u);
    advance(sim, 0.4);
    const throws = record(sim, 'cloneThrow');
    u.stats.range = 100;
    followVolley(sim, u, [], launch);
    expect(throws).toHaveLength(0);
    expect(u.clone.map((c) => c.left)).toEqual([4, 4]);
    u.stats.range = 440;
    followVolley(sim, u, [], launch);
    expect(throws.map((t) => t.index)).toEqual([0, 1]);
    expect(u.clone.map((c) => c.left)).toEqual([3, 3]);
  });

  it('aim like the ninja: the laser\'s dot first (the nearest enemy inside it that the volley is not on), else the oldest', () => {
    const sim = arena();
    const u = ninja(sim, 12);
    const list = crowd(sim, 10);
    // The dot sits between the 9th (x 390) and the 10th (x 420) enemies and covers x 270 to 530: enemies 5 to 10.
    expect(sim.setLaser(400, PATH_TOP)).toBeNull();
    expect(sim.laser.radius).toBe(LASER_RADIUS);
    const attacks = record(sim, 'attack');
    const throws = record(sim, 'cloneThrow');
    cast(sim, u);
    until(sim, () => throws.length >= 2, 3, 'the first throws');
    // The ninja: the enemy nearest the dot (the 9th), then the two oldest. The clones: the nearest to the dot of the rest, then the next.
    expect(attacks.map((a) => a.targetUid)).toEqual([8, 0, 1].map((i) => (list[i] as SimEnemy).uid));
    expect(throws.map((t) => t.targetUid)).toEqual([9, 7].map((i) => (list[i] as SimEnemy).uid));
  });

  it('prefer an elite or a boss inside the dot, as every cat does', () => {
    const sim = arena();
    const u = ninja(sim, 12);
    const list = crowd(sim, 8);
    const boss = hold(sim, 200, PATH_TOP, 100, 'boss_cucumber');
    expect(boss.isBoss || boss.isElite).toBe(true);
    // Not the ninja's choice: a boss in range is first on the dot's list for everyone.
    expect(sim.setLaser(200, PATH_TOP)).toBeNull();
    const attacks = record(sim, 'attack');
    const throws = record(sim, 'cloneThrow');
    cast(sim, u);
    until(sim, () => throws.length >= 2, 3, 'the first throws');
    expect(attacks[0]?.targetUid).toBe(boss.uid);
    // The boss is in the volley, so no clone aims at it (a boss never gets more than one shuriken of a volley).
    expect(throws.some((t) => t.targetUid === boss.uid)).toBe(false);
    expect(list.length).toBe(8);
  });

  it('never put two shuriken of a volley on one enemy: every volley is the ninja four and the clones two at six different enemies', () => {
    const sim = arena({}, 7);
    const u = ninja(sim, 12);
    crowd(sim, 14);
    const seen = tape(sim, ['attack', 'cloneThrow']);
    cast(sim, u);
    until(sim, () => u.clone.length === 0, 6, 'the clones to go');
    const volleys = new Map<number, number[]>();
    for (const x of seen) {
      const uid = x.type === 'attack' ? (x.payload as BattleEvents['attack']).targetUid : (x.payload as BattleEvents['cloneThrow']).targetUid;
      const key = Math.round(x.time / TICK);
      volleys.set(key, [...(volleys.get(key) ?? []), uid]);
    }
    expect(volleys.size).toBeGreaterThanOrEqual(4);
    for (const [, list] of volleys) {
      expect(list).toHaveLength(6);
      expect(new Set(list).size).toBe(6);
    }
  });
});

// ───────────────────────────── stepping aside ─────────────────────────────

describe('stepping aside', () => {
  /** A ninja on tile 12 whose clones stand on 7 and 17, the only empty tiles. */
  function twoSeats(): { sim: Sim; u: SimUnit } {
    const sim = arena();
    const u = ninja(sim, 12);
    crowd(sim, 8);
    fillExcept(sim, [7, 17]);
    rich(sim);
    cast(sim, u);
    return { sim, u };
  }

  it('hops the clone back to the ninja\'s tile when a cat is summoned onto its tile, before the summon event, keeping its throws', () => {
    const { sim, u } = twoSeats();
    const seen = tape(sim, ['cloneStep', 'summon']);
    expect(sim.summon()).toBeNull();
    expect(seen.map((x) => x.type)).toEqual(['cloneStep', 'summon']);
    const step = seen[0]?.payload as BattleEvents['cloneStep'];
    const summon = seen[1]?.payload as BattleEvents['summon'];
    expect([7, 17]).toContain(step.from);
    expect(step.from).toBe(summon.unit.cell);
    expect(step).toMatchObject({ unit: u, to: 12, x: cellCenterX(step.from), y: cellCenterY(step.from) });
    const hopped = u.clone.find((c) => c.index === step.index) as { cell: number; left: number };
    expect(hopped.cell).toBe(-1);
    expect(hopped.left).toBe(4);
    // The other one stands where it stood.
    expect(standing(u)).toEqual([step.from === 7 ? 17 : 7]);
  });

  it('does the same for a cat dropped on the empty tile, a twin, a gift and the partner capsule\'s `placeUnit` (source \'skill\')', () => {
    const { sim, u } = twoSeats();
    const steps = record(sim, 'cloneStep');
    expect(sim.drop(0, 7)).toBeNull();
    expect(steps.map((s) => [s.index, s.from, s.to])).toEqual([[0, 7, 12]]);
    expect(u.clone.map((c) => c.cell)).toEqual([-1, 17]);
    placeUnit(sim, 'w_paw', 17, 'skill');
    expect(steps.map((s) => [s.index, s.from, s.to])).toEqual([[0, 7, 12], [1, 17, 12]]);
    expect(u.clone.map((c) => c.cell)).toEqual([-1, -1]);
    // Nothing left to step aside: the next cat on a tile with no clone changes nothing.
    sim.drop(1, 0);
    expect(steps).toHaveLength(2);
  });

  it('does it for every clone on the tile, of any ninja', () => {
    const sim = arena();
    const a = ninja(sim, 12);
    const b = ninja(sim, 13);
    crowd(sim, 8);
    fillExcept(sim, [7, 17, 8, 18]);
    cast(sim, a);
    cast(sim, b);
    const steps = record(sim, 'cloneStep');
    placeUnit(sim, 'w_paw', 8, 'button');
    expect(steps.map((s) => [s.unit.cell, s.from, s.to])).toEqual([[13, 8, 13]]);
    expect(standing(a)).toEqual([7, 17]);
    expect(standing(b)).toEqual([18]);
  });

  it('turns the ninja dropped onto its own clone\'s tile into a stacked clone on that same tile, and the clone throws from there', () => {
    const { sim, u } = twoSeats();
    const steps = record(sim, 'cloneStep');
    const moves = record(sim, 'move');
    expect(sim.drop(12, 7)).toBeNull();
    expect(u.cell).toBe(7);
    expect(steps.map((s) => [s.index, s.from, s.to])).toEqual([[0, 7, 7]]);
    expect(u.clone.map((c) => c.cell)).toEqual([-1, 17]);
    expect(moves).toHaveLength(1);
    const throws = record(sim, 'cloneThrow');
    const starts: Array<[number, number]> = [];
    sim.events.on('cloneThrow', (e) => starts.push([e.projectile.x, e.projectile.y]));
    until(sim, () => throws.length >= 2, 3, 'the first throws');
    // The stacked one throws from the ninja's tile, the standing one from its own; the lower tile goes first.
    expect(throws.map((t) => [t.index, t.cell, t.stacked])).toEqual([[0, 7, true], [1, 17, false]]);
    expect(starts).toEqual([[cellCenterX(7), cellCenterY(7)], [cellCenterX(17), cellCenterY(17)]]);
  });

  it('lets a standing clone stay put when its ninja is moved, and takes a stacked one along', () => {
    const sim = arena();
    const u = ninja(sim, 12);
    crowd(sim, 8);
    fillExcept(sim, [7]);
    cast(sim, u);
    expect(u.clone.map((c) => c.cell)).toEqual([7, -1]);
    // A swap with the cat on tile 13: the ninja changes tiles, the clone on 7 does not, the stacked one is on the ninja's new tile.
    expect(sim.drop(12, 13)).toBeNull();
    expect(u.cell).toBe(13);
    expect(u.clone.map((c) => c.cell)).toEqual([7, -1]);
    const throws = record(sim, 'cloneThrow');
    until(sim, () => throws.length >= 2, 3, 'the first throws');
    expect(throws.map((t) => [t.index, t.cell, t.stacked])).toEqual([[0, 7, false], [1, 13, true]]);
  });

  it('keeps each ninja its own clones through a swap with another cat (two ninjas cannot swap: they merge)', () => {
    const sim = arena();
    const a = ninja(sim, 12);
    const b = ninja(sim, 6);
    crowd(sim, 8);
    fillExcept(sim, []);
    cast(sim, a);
    cast(sim, b);
    expect(sim.drop(12, 13)).toBeNull();
    expect([a.cell, b.cell]).toEqual([13, 6]);
    const throws = record(sim, 'cloneThrow');
    until(sim, () => throws.length >= 4, 3, 'the first throws');
    expect(throws.filter((t) => t.unit === a).map((t) => t.cell)).toEqual([13, 13]);
    expect(throws.filter((t) => t.unit === b).map((t) => t.cell)).toEqual([6, 6]);
  });
});

// ───────────────────────────── going away ─────────────────────────────

describe('how the clones go', () => {
  it('go after 8 s when their ninja never throws a volley (`timeout`), the time standing still under a popup', () => {
    const sim = arena();
    const u = ninja(sim, 12);
    crowd(sim, 5);
    // Nothing in reach after the cast: the ninja throws nothing.
    cast(sim, u);
    for (const e of sim.enemies.slice()) e.x = 700, e.y = 640;
    const ends = record(sim, 'cloneEnd');
    advance(sim, 5);
    expect(ends).toHaveLength(0);
    // A choice popup stops the simulation, so it stops the clones' time too.
    openSummonOffer(sim, false);
    const left = u.clone.map((c) => c.until - sim.time);
    sim.step(30);
    expect(sim.phase).toBe('choice');
    expect(u.clone.map((c) => c.until - sim.time)).toEqual(left);
    expect(sim.pickSummon(0)).toBeNull();
    advance(sim, 2.9);
    expect(ends).toHaveLength(0);
    advance(sim, 0.2);
    expect(ends.map((x) => [x.index, x.reason])).toEqual([[0, 'timeout'], [1, 'timeout']]);
    expect(u.clone).toEqual([]);
    expect(sim.cloners).toEqual([]);
  });

  it('go at once, before the sell event, when their ninja is sold, and the shuriken already in the air still land and are credited to it', () => {
    const sim = arena();
    const u = ninja(sim, 12);
    crowd(sim, 8);
    const throws = record(sim, 'cloneThrow');
    cast(sim, u);
    until(sim, () => throws.length >= 2, 3, 'the first throws');
    const seen = tape(sim, ['cloneEnd', 'sell']);
    const hits = record(sim, 'hit');
    expect(sim.sell(12)).toBeNull();
    expect(seen.map((x) => x.type)).toEqual(['cloneEnd', 'cloneEnd', 'sell']);
    expect(seen.slice(0, 2).map((x) => (x.payload as BattleEvents['cloneEnd']).reason)).toEqual(['sold', 'sold']);
    expect((seen[0]?.payload as BattleEvents['cloneEnd']).unit).toBe(u);
    expect(sim.cloners).toEqual([]);
    expect(u.clone).toEqual([]);
    until(sim, () => sim.projectiles.length === 0, 3, 'the shuriken to land');
    expect(hits.length).toBeGreaterThanOrEqual(5);
    expect(hits.every((h) => h.unitId === 'r_ninja')).toBe(true);
    // No more throws after the sale.
    const after = record(sim, 'cloneThrow');
    advance(sim, 3);
    expect(after).toHaveLength(0);
  });

  it('go when their ninja is merged (a merge of two ninjas ends both ninjas\' clones), and the result starts without any', () => {
    const sim = arena();
    const a = ninja(sim, 12);
    const b = ninja(sim, 13);
    crowd(sim, 8);
    cast(sim, a);
    cast(sim, b);
    const seen = tape(sim, ['cloneEnd', 'merge']);
    expect(sim.dropAction(12, 13)).toBe('merge');
    expect(sim.drop(12, 13)).toBeNull();
    expect(seen.map((x) => x.type)).toEqual(['cloneEnd', 'cloneEnd', 'cloneEnd', 'cloneEnd', 'merge']);
    expect(seen.slice(0, 4).map((x) => (x.payload as BattleEvents['cloneEnd']).reason)).toEqual(['merged', 'merged', 'merged', 'merged']);
    expect(sim.cloners).toEqual([]);
    const result = sim.units[13] as SimUnit;
    expect(result.id).toBe('r_gunner');
    expect(result.clone).toEqual([]);
  });

  it('go when their ninja molts into another class, and a cat that molts into a ninja has none', () => {
    const sim = arena();
    const u = ninja(sim, 12);
    crowd(sim, 8);
    rich(sim);
    cast(sim, u);
    const seen = tape(sim, ['cloneEnd', 'molt']);
    expect(sim.molt(12, 'mage')).toBeNull();
    expect(seen.map((x) => x.type)).toEqual(['cloneEnd', 'cloneEnd', 'molt']);
    expect((seen[0]?.payload as BattleEvents['cloneEnd']).reason).toBe('molted');
    expect(sim.cloners).toEqual([]);
    expect(sim.units[12]?.id).toBe('m_storm');
    expect(sim.units[12]?.clone).toEqual([]);
    const paw = put(sim, 0, 'w_viking');
    expect(sim.molt(0, 'ranger')).toBeNull();
    expect(paw.clone).toEqual([]);
    expect(sim.units[0]?.id).toBe('r_ninja');
    expect(sim.units[0]?.clone).toEqual([]);
  });

  it('go in the pass when their ninja has left the board by a way that did not tell them (`gone`)', () => {
    const sim = arena();
    const u = ninja(sim, 12);
    crowd(sim, 8);
    cast(sim, u);
    const ends = record(sim, 'cloneEnd');
    u.removed = true;
    sim.units[12] = null;
    advance(sim, 0.05);
    expect(ends.map((x) => x.reason)).toEqual(['gone', 'gone']);
    expect(sim.cloners).toEqual([]);
  });

  it('leave with the stage: the elite or boss falls, and 1.2 s later (the stage ends) every clone goes, before the stage\'s reward event', () => {
    const sim = newSim();
    quietWave(sim);
    startWave(sim, 4);
    sim.spawnIds.length = 0;
    sim.spawnTimes.length = 0;
    sim.spawnIdx = 0;
    advance(sim, 1.05);
    expect(sim.boss).not.toBeNull();
    const u = ninja(sim, 12);
    crowd(sim, 5);
    cast(sim, u);
    const seen = tape(sim, ['cloneEnd', 'actClear', 'relicOffer']);
    slay(sim);
    advance(sim, 1.1);
    expect(seen).toHaveLength(0);
    advance(sim, 0.2);
    expect(seen.map((x) => x.type)).toEqual(['cloneEnd', 'cloneEnd', 'actClear', 'relicOffer']);
    expect(seen.slice(0, 2).map((x) => (x.payload as BattleEvents['cloneEnd']).reason)).toEqual(['stage', 'stage']);
    expect(sim.cloners).toEqual([]);
    expect(sim.phase).toBe('choice');
  });

  it('leave with the last stage too, before the victory event', () => {
    const sim = newSim();
    quietWave(sim);
    startWave(sim, sim.totalWaves);
    sim.spawnIds.length = 0;
    sim.spawnTimes.length = 0;
    sim.spawnIdx = 0;
    advance(sim, 1.05);
    const u = ninja(sim, 12);
    crowd(sim, 5);
    cast(sim, u);
    const seen = tape(sim, ['cloneEnd', 'victory']);
    slay(sim);
    advance(sim, 1.5);
    expect(sim.phase).toBe('won');
    expect(seen.map((x) => x.type)).toEqual(['cloneEnd', 'cloneEnd', 'victory']);
  });

  it('leave with a defeat, before the defeat event, and a revived battle starts without them', () => {
    const sim = arena();
    const u = ninja(sim, 12);
    crowd(sim, 8);
    cast(sim, u);
    const seen = tape(sim, ['cloneEnd', 'defeat', 'revive']);
    lose(sim, 'overrun');
    expect(seen.map((x) => x.type)).toEqual(['cloneEnd', 'cloneEnd', 'defeat']);
    expect(seen.slice(0, 2).map((x) => (x.payload as BattleEvents['cloneEnd']).reason)).toEqual(['end', 'end']);
    expect(sim.cloners).toEqual([]);
    expect(sim.revive()).toBeNull();
    const throws = record(sim, 'cloneThrow');
    advance(sim, 3);
    expect(throws).toHaveLength(0);
    expect(u.clone).toEqual([]);
  });

  it('give every clone exactly one `cloneEnd`, whatever the reason', () => {
    const sim = arena();
    const a = ninja(sim, 12);
    const b = ninja(sim, 13);
    crowd(sim, 8);
    const seen = tape(sim, ['cloneEnd']);
    const casts = castsOf(sim);
    cast(sim, a);
    cast(sim, b);
    advance(sim, 1);
    cast(sim, a);
    sim.sell(13);
    advance(sim, 9);
    const reasons: CloneEndReason[] = seen.map((x) => (x.payload as BattleEvents['cloneEnd']).reason);
    const made = casts.reduce((n, c) => n + c.seats.length, 0);
    expect(made).toBe(6);
    expect(reasons).toHaveLength(6);
    expect(new Set(seen.map((x) => `${(x.payload as BattleEvents['cloneEnd']).unit.uid}:${x.time}:${(x.payload as BattleEvents['cloneEnd']).index}`)).size).toBe(6);
    expect(sim.cloners).toEqual([]);
  });
});

// ───────────────────────────── the other cases ─────────────────────────────

describe('around the skill', () => {
  it('knows nothing of a battle played without skills: no clone, no gauge, the ninja throws its three stars alone', () => {
    const sim = arena({ sp: false });
    const u = put(sim, 12, 'r_ninja', 0);
    crowd(sim, 8);
    const seen = tape(sim, ['cloneThrow', 'cloneStep', 'cloneEnd', 'spCast']);
    const attacks = record(sim, 'attack');
    advance(sim, 30);
    expect(seen).toHaveLength(0);
    expect(u.sp).toBe(0);
    expect(u.clone).toEqual([]);
    expect(attacks.length).toBeGreaterThan(0);
    expect(sim.projectiles.every((p) => p.ghost !== true)).toBe(true);
  });

  it('goes on through a change of wave: clones belong to the field, not to the wave, and only the end of a stage sends them away', () => {
    const sim = arena();
    const u = ninja(sim, 12);
    crowd(sim, 8);
    cast(sim, u);
    const ends = record(sim, 'cloneEnd');
    const throws = record(sim, 'cloneThrow');
    advance(sim, 1);
    expect(throws).toHaveLength(2);
    startWave(sim, 6);
    sim.spawnIds.length = 0;
    sim.spawnTimes.length = 0;
    sim.spawnIdx = 0;
    sim.waveDuration = 1e6;
    expect(u.clone.map((c) => c.left)).toEqual([3, 3]);
    expect(ends).toHaveLength(0);
    until(sim, () => throws.length >= 4, 3, 'the throws of the next wave');
    expect(u.clone.map((c) => c.left)).toEqual([2, 2]);
  });

  it('plays the same with or without a listener on the clones\' events (no random number, no state depends on being watched)', () => {
    function run(listen: boolean): { time: number; rng: string; hp: number[]; left: number[]; hits: number } {
      const sim = arena();
      let hits = 0;
      sim.events.on('hit', () => {
        hits++;
      });
      if (listen) {
        for (const t of ['cloneThrow', 'cloneStep', 'cloneEnd', 'spCast'] as const) sim.events.on(t, () => undefined);
      }
      const u = put(sim, 12, 'r_ninja', 0.3);
      u.sp = 0.95;
      crowd(sim, 9);
      fillExcept(sim, [7, 17]);
      advance(sim, 2);
      sim.drop(0, 7);
      advance(sim, 6);
      return { time: sim.time, rng: sim.rng.states().join(','), hp: sim.enemies.map((e) => e.hp), left: u.clone.map((c) => c.left), hits };
    }
    const quiet = run(false);
    const watched = run(true);
    expect(watched).toEqual(quiet);
    expect(quiet.hits).toBeGreaterThan(10);
  });

  it('plays the same at 1x, 2x and 3x speed: the steps of the simulation are the same ticks', () => {
    function run(ticksPerStep: number): string {
      const sim = arena();
      const u = put(sim, 12, 'r_ninja', 0.3);
      u.sp = 0.9;
      crowd(sim, 9);
      fillExcept(sim, [7, 17]);
      const seen = tape(sim, ['cloneThrow', 'cloneStep', 'cloneEnd']);
      for (let i = 0; i < 702 / ticksPerStep; i++) {
        if (i === 198 / ticksPerStep) sim.drop(0, 7);
        sim.step(TICK * ticksPerStep);
      }
      return JSON.stringify(seen.map((x) => [x.type, Math.round(x.time * 1000), (x.payload as { index: number }).index]));
    }
    const one = run(1);
    expect(one.length).toBeGreaterThan(100);
    expect(run(2)).toBe(one);
    expect(run(3)).toBe(one);
  });

  it('works with three ninjas and a crowd: seats never overlap, every clone is accounted for, and the board is never blocked', { timeout: 30_000 }, () => {
    const sim = arena({ seed: 77 });
    const ninjas = [ninja(sim, 6), ninja(sim, 12), ninja(sim, 18)];
    for (let i = 0; i < ninjas.length; i++) (ninjas[i] as SimUnit).sp = 0.9 + i * 0.03;
    const list = crowd(sim, 14, 120, 28);
    expect(list).toHaveLength(14);
    const casts = castsOf(sim);
    const ends = record(sim, 'cloneEnd');
    for (let t = 0; t < Math.round(40 / TICK); t++) {
      sim.step(TICK);
      checkInvariants(sim);
    }
    expect(casts.length).toBeGreaterThanOrEqual(3);
    lose(sim, 'overrun');
    checkInvariants(sim);
    expect(ends).toHaveLength(casts.reduce((n, c) => n + c.seats.length, 0));
  });
});

/** What must hold after every tick, whatever happened. */
function checkInvariants(sim: Sim): void {
  const seen = new Set<number>();
  const holders: SimUnit[] = [];
  for (let c = 0; c < CELL_COUNT; c++) {
    const u = sim.units[c];
    if (!u || u.clone.length === 0) continue;
    holders.push(u);
    expect(u.id).toBe('r_ninja');
    expect(u.removed).toBe(false);
    expect(u.clone.length).toBeLessThanOrEqual(ROW.clones);
    const indexes = new Set<number>();
    for (const k of u.clone) {
      expect(indexes.has(k.index)).toBe(false);
      indexes.add(k.index);
      expect(k.left).toBeGreaterThan(0);
      expect(k.left).toBeLessThanOrEqual(ROW.throws);
      expect(k.until).toBeGreaterThan(sim.time - 1e-9);
      expect(k.until - k.readyAt).toBeCloseTo(ROW.maxLife - ROW.arrive, 9);
      if (k.cell >= 0) {
        expect(sim.units[k.cell]).toBeNull();
        expect(seen.has(k.cell)).toBe(false);
        seen.add(k.cell);
      }
    }
  }
  expect(sim.cloners.slice().sort((a, b) => a.cell - b.cell)).toEqual(holders);
  for (const u of sim.cloners) expect(u.removed).toBe(false);
}

// ───────────────────────────── whole battles ─────────────────────────────

describe('whole battles with ninjas on the board', () => {
  const MODES: Array<{ name: string; over: Partial<BattleInit>; wave: number }> = [
    { name: 'a chapter', over: { seed: 4101, mode: 'chapter', chapter: 2 }, wave: 3 },
    { name: 'a chapter at butler level 5', over: { seed: 4102, mode: 'chapter', chapter: 4, stake: 5 }, wave: 5 },
    { name: 'the daily challenge with rules', over: { seed: 4103, mode: 'daily', chapter: 3, modifiers: ['swarm', 'rush'] }, wave: 3 },
    { name: 'endless mode', over: { seed: 4104, mode: 'endless', chapter: 2 }, wave: 4 },
    { name: 'the gold dungeon', over: { seed: 4105, mode: 'gold', chapter: 1 }, wave: 2 },
    { name: 'the tutorial', over: { seed: 4106, mode: 'tutorial', chapter: 1 }, wave: 1 },
  ];

  for (const mode of MODES) {
    it(`keeps its books in ${mode.name}: invariants every tick, one end for every clone, the same events on a second run`, { timeout: 60_000 }, () => {
      function play(): string {
        const sim = newSim(mode.over, 4);
        if (mode.over.mode === 'tutorial') sim.summon();
        rich(sim);
        const ninjaOne = put(sim, 6, 'r_ninja', 0.5);
        put(sim, 12, 'r_ninja', 0.2);
        put(sim, 13, 'r_archer', 0.4);
        put(sim, 7, 'w_paw', 0.1);
        put(sim, 11, 'w_viking', 0.9);
        const made = { clones: 0, ends: 0, throws: 0, steps: 0 };
        sim.events.on('spCast', (e) => {
          if (e.skill === 'clones') made.clones += e.data.seats.length;
        });
        sim.events.on('cloneEnd', () => made.ends++);
        sim.events.on('cloneThrow', () => made.throws++);
        sim.events.on('cloneStep', () => made.steps++);
        const log: string[] = [];
        sim.events.on('cloneThrow', (e) => log.push(`T${e.index}:${e.cell}:${e.targetUid}`));
        advance(sim, 2);
        // One cast by hand, so that there are clones to keep books of whatever the waves do (the gauges cast the others).
        expect(clones.cast(sim, ninjaOne)).toBe(true);
        // Skip to the wave the mode is worth testing from, then play on to a stage end or a defeat (or 150 s).
        if (mode.over.mode !== 'tutorial') startWave(sim, mode.wave);
        const total = Math.round(150 / TICK);
        for (let t = 0; t < total && sim.phase !== 'won' && sim.phase !== 'lost'; t++) {
          if (sim.phase === 'choice') {
            if (sim.pending?.kind === 'summon') sim.pickSummon(0);
            else sim.pickRelic(0);
            continue;
          }
          if (t % 600 === 300) sim.drop(7, 8);
          if (t % 600 === 0) sim.summon();
          sim.step(TICK);
          if (t % 7 === 0) checkInvariants(sim);
        }
        checkInvariants(sim);
        lose(sim, 'overrun');
        expect(sim.cloners).toEqual([]);
        expect(made.ends).toBe(made.clones);
        // The tutorial's little waves rarely put five enemies in a ninja's reach, so only the other modes must see a throw.
        if (mode.over.mode !== 'tutorial') expect(made.throws).toBeGreaterThan(0);
        return `${made.clones}/${made.throws}/${made.steps}/${log.join(',')}/${Math.round(sim.time * 1000)}`;
      }
      const first = play();
      expect(play()).toBe(first);
    });
  }
});

describe('Surprise Clones, what the review pinned down', () => {
  it('throws the stacked clones\' shuriken in the order of their index: the first at the older enemy, the second at the next', () => {
    const sim = arena();
    const u = ninja(sim, 12);
    const list = crowd(sim, 8);
    fillExcept(sim, []);
    const throws = record(sim, 'cloneThrow');
    cast(sim, u);
    until(sim, () => throws.length >= 2, 3, 'the first throws');
    expect(throws.map((t) => [t.index, t.stacked, t.cell, t.targetUid])).toEqual([
      [0, true, 12, (list[3] as SimEnemy).uid], [1, true, 12, (list[4] as SimEnemy).uid],
    ]);
  });

  it('breaks a tie between enemies that have walked equally far by the lower `uid`, for the clones as for the ninja', () => {
    const sim = arena();
    const u = ninja(sim, 12);
    // Six enemies at the same place on the road (and so the same `travelled`), made in the order of their uids.
    const list = [0, 1, 2, 3, 4, 5].map((i) => hold(sim, 150 + i * 30, PATH_TOP, 300));
    expect(new Set(list.map((e) => e.travelled)).size).toBe(1);
    const attacks = record(sim, 'attack');
    const throws = record(sim, 'cloneThrow');
    cast(sim, u);
    until(sim, () => throws.length >= 2, 3, 'the first throws');
    expect(attacks.map((a) => a.targetUid)).toEqual([0, 1, 2].map((i) => (list[i] as SimEnemy).uid));
    expect(throws.map((t) => t.targetUid)).toEqual([3, 4].map((i) => (list[i] as SimEnemy).uid));
  });

  it('prefers, inside the laser dot, an elite or a boss that the volley is not on to a plain enemy that is nearer the dot and older', () => {
    const sim = arena();
    const u = ninja(sim, 12);
    // The ninja's volley takes the dot's focus (a boss) and then the two oldest (a and b, outside the dot).
    hold(sim, 150, PATH_TOP, 700);
    hold(sim, 160, PATH_TOP, 690);
    const bossA = hold(sim, 400, PATH_TOP, 300, 'boss_vacuum');
    const bossB = hold(sim, 440, PATH_TOP, 100, 'boss_vacuum');
    // Inside the dot, 10 px from its centre, older than the second boss: without the preference the first clone would take it.
    const plain = hold(sim, 410, PATH_TOP, 400);
    expect(sim.setLaser(400, PATH_TOP)).toBeNull();
    const attacks = record(sim, 'attack');
    const throws = record(sim, 'cloneThrow');
    cast(sim, u);
    until(sim, () => throws.length >= 2, 3, 'the first throws');
    const focus = attacks[0]?.targetUid;
    expect([bossA.uid, bossB.uid]).toContain(focus);
    const other = focus === bossA.uid ? bossB : bossA;
    expect(throws.map((t) => t.targetUid)).toEqual([other.uid, plain.uid]);
  });

  it('puts the puff where the clone stood: a standing clone on its own tile (`cell` is that tile), a stacked one on the ninja\'s tile (`cell` is -1)', () => {
    const standing = arena();
    const a = ninja(standing, 12);
    crowd(standing, 5);
    fillExcept(standing, [7, 17]);
    const endsA = record(standing, 'cloneEnd');
    cast(standing, a);
    endClones(standing, a, 'timeout');
    expect(endsA.map((e) => [e.index, e.cell, e.x, e.y, e.reason])).toEqual([
      [0, 7, cellCenterX(7), cellCenterY(7), 'timeout'], [1, 17, cellCenterX(17), cellCenterY(17), 'timeout'],
    ]);

    // One tile empty: one clone stands on it and the other is stacked.
    const half = arena();
    const b = ninja(half, 12);
    crowd(half, 5);
    fillExcept(half, [3]);
    const endsB = record(half, 'cloneEnd');
    cast(half, b);
    endClones(half, b, 'sold');
    expect(endsB.map((e) => [e.index, e.cell, e.x, e.y])).toEqual([
      [0, 3, cellCenterX(3), cellCenterY(3)], [1, -1, cellCenterX(12), cellCenterY(12)],
    ]);

    const full = arena();
    const c = ninja(full, 12);
    crowd(full, 5);
    fillExcept(full, []);
    const endsC = record(full, 'cloneEnd');
    cast(full, c);
    endClones(full, c, 'merged');
    expect(endsC.map((e) => [e.index, e.cell, e.x, e.y])).toEqual([
      [0, -1, cellCenterX(12), cellCenterY(12)], [1, -1, cellCenterX(12), cellCenterY(12)],
    ]);
  });
});
