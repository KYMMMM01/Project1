/**
 * The bard's skill, Jam Session! (docs/design_skills_v2.md 3.10, directive decision 23): four golden notes fly to the four other skill cats with
 * the lowest gauges and add 20% each (a gauge at 80% or more is passed over); a note with no gauge to fill goes to the nearest cat without a skill
 * that can attack right now, which gets one free attack. The frame it stands on is tested in `sim.spSkills.test.ts`.
 *
 * The skill cats used here are the ones whose skills exist whatever the other step-2 agents have built: the viking, the tiger, the gunner, the
 * star archer and the alchemist; the cats without a skill are the paw, the sling, the sword and the tabby chef.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BattleEvents, SpCastEvent, SpJamNote, SpSkillDef, UnitId } from '@/game/api';
import { TICK } from '@/game/data/balance';
import { SP_ROWS } from '@/game/data/spSkills';
import { unitDef, unitSpec } from '@/game/data/units';
import { cellCenterX, cellCenterY } from '@/game/geometry';
import { jam } from '@/game/sim/sp/jam';
import { inRangeOf } from '@/game/sim/sp/near';
import { SP_HANDLERS } from '@/game/sim/sp/registry';
import type { SpHandler } from '@/game/sim/sp/types';
import type { Sim } from '@/game/sim/sim';
import type { SimEnemy, SimUnit } from '@/game/sim/types';
import { advance, clearEnemies, foe, newSim, put, quietWave, record } from './simHelpers';
import { fingerprintRun } from './spHelpers';

// ───────────────────────────── helpers ─────────────────────────────

const ROW = SP_ROWS.jam;
type JamCast = Extract<SpCastEvent, { skill: 'jam' }>;

/** A battle in a wave whose scripted spawns are cancelled: a test controls the field. */
function arena(over: Parameters<typeof newSim>[0] = {}): Sim {
  const sim = newSim(over);
  quietWave(sim);
  return sim;
}

/**
 * An enemy held in place on the top edge of the road, at (381, 45) when `travelled` is 300. From there: the paw at tile 2 (95 px) and tile 7
 * (190 px, range 200 + the enemy's 18) reach it, the sling (range 420) at tiles 11 and 13 (about 300 px) does, the sword (range 210) at tile 17
 * (381 px) does not.
 */
function target(sim: Sim, travelled = 300): SimEnemy {
  const e = foe(sim, 'cucumber', travelled, 1e9);
  e.frozen = true;
  return e;
}

/** A bard in `cell` with a full gauge and an empty attack gauge. */
function bardAt(sim: Sim, cell: number): SimUnit {
  const u = put(sim, cell, 't_bard', 0);
  u.sp = 1;
  return u;
}

/** A cat with a skill in `cell` and a gauge of `sp`. */
function skillCat(sim: Sim, cell: number, id: UnitId, sp: number): SimUnit {
  const u = put(sim, cell, id, 0);
  expect(u.spec.spSkill, `${id} must have a skill`).toBeDefined();
  u.sp = sp;
  return u;
}

/** A cat without a skill in `cell`, its attack gauge empty. */
function plain(sim: Sim, cell: number, id: UnitId): SimUnit {
  const u = put(sim, cell, id, 0);
  expect(u.spec.spSkill, `${id} must have no skill`).toBeUndefined();
  return u;
}

/** Casts through the handler (what the gauge pass does when the gauge is full) after asserting that the skill said it was ready. */
function strum(sim: Sim, bard: SimUnit): void {
  expect(jam.ready(sim, bard)).toBe(true);
  expect(jam.cast(sim, bard)).toBe(true);
}

/** The `spCast` events of the bard's skill, collected as they come. */
function jamCasts(sim: Sim): JamCast[] {
  const out: JamCast[] = [];
  sim.events.on('spCast', (e) => {
    if (e.skill === 'jam') out.push(e);
  });
  return out;
}

const restores: Array<() => void> = [];
afterEach(() => {
  while (restores.length > 0) (restores.pop() as () => void)();
  vi.restoreAllMocks();
});

const IDLE: SpHandler = { ready: () => false, cast: () => false };
/** Gives a cat a skill in the data for the length of a test (an idle handler, so a lent skill never runs). */
function lend(id: UnitId, def: SpSkillDef): void {
  const spec = unitSpec(id);
  const before = spec.spSkill;
  const handlers = SP_HANDLERS as Record<string, SpHandler | null | undefined>;
  const had = handlers[def.id];
  spec.spSkill = def;
  handlers[def.id] = IDLE;
  restores.push(() => {
    if (before) spec.spSkill = before;
    else delete spec.spSkill;
    if (had !== undefined) handlers[def.id] = had;
    else delete handlers[def.id];
  });
}

/** Takes a cat's skill away in the data for the length of a test (the cat then counts as a cat without a skill, whatever gets built later). */
function strip(id: UnitId): void {
  const spec = unitSpec(id);
  const before = spec.spSkill;
  delete spec.spSkill;
  restores.push(() => {
    if (before) spec.spSkill = before;
  });
}

/** Changes a cell of the bard's row (or the capsule's) for one test. */
function turn<T extends object, K extends keyof T>(row: T, key: K, value: T[K]): void {
  const old = row[key];
  row[key] = value;
  restores.push(() => {
    row[key] = old;
  });
}

// ───────────────────────────── the data and the registration ─────────────────────────────

describe('Jam Session, the data', () => {
  it('has the design appendix\'s cells and is built: the bard carries the skill and its handler is registered', () => {
    expect(ROW).toMatchObject({ id: 'jam', unit: 't_bard', rank: 3, cooldown: 18, targets: 4, fill: 0.2, skip: 0.8, leftoverCharge: 1, built: true });
    expect(unitDef('t_bard').spSkill).toEqual({ id: 'jam', rank: 3, cooldown: 18, nameKey: 'sp.jam.name' });
    expect(SP_HANDLERS.jam).toBe(jam);
  });

  it('fills the bard\'s gauge in 18 s, from the 50% a cat starts at in 9 s', () => {
    const sim = arena();
    const bard = put(sim, 12, 't_bard');
    expect(bard.sp).toBe(0.5);
    advance(sim, 8.8);
    expect(bard.sp).toBeLessThan(1);
    advance(sim, 0.4);
    // It cast (nobody to give a note to, so it waited full) or is full: either way not below the top.
    expect(bard.sp).toBeGreaterThanOrEqual(1 - 1e-9);
  });
});

// ───────────────────────────── gauge notes ─────────────────────────────

describe('the notes that fill gauges', () => {
  it('go to the four other skill cats with the lowest gauges, 20% each, lowest first; the fifth and the bard get nothing', () => {
    const sim = arena();
    const bard = bardAt(sim, 0);
    const viking = skillCat(sim, 1, 'w_viking', 0.1);
    const tiger = skillCat(sim, 2, 'w_tiger', 0.5);
    const gunner = skillCat(sim, 3, 'r_gunner', 0.3);
    const star = skillCat(sim, 4, 'r_star', 0.7);
    const alch = skillCat(sim, 5, 't_alch', 0.2);
    const casts = jamCasts(sim);
    strum(sim, bard);
    expect([viking.sp, alch.sp, gunner.sp, tiger.sp]).toEqual([0.1 + 0.2, 0.2 + 0.2, 0.3 + 0.2, 0.5 + 0.2]);
    expect(star.sp).toBe(0.7);
    expect(bard.sp).toBe(1);
    expect(casts).toHaveLength(1);
    expect(casts[0]!.data.notes).toEqual([
      { uid: viking.uid, cell: 1, kind: 'gauge', before: 0.1, after: 0.1 + 0.2 },
      { uid: alch.uid, cell: 5, kind: 'gauge', before: 0.2, after: 0.2 + 0.2 },
      { uid: gunner.uid, cell: 3, kind: 'gauge', before: 0.3, after: 0.3 + 0.2 },
      { uid: tiger.uid, cell: 2, kind: 'gauge', before: 0.5, after: 0.5 + 0.2 },
    ]);
    expect(casts[0]!.data.fill).toBe(0.2);
  });

  it('break a tie by the lower tile', () => {
    const sim = arena();
    const bard = bardAt(sim, 24);
    const cats = [
      skillCat(sim, 9, 't_alch', 0.4), skillCat(sim, 3, 'w_viking', 0.4), skillCat(sim, 7, 'r_gunner', 0.4),
      skillCat(sim, 20, 'w_tiger', 0.4), skillCat(sim, 5, 'r_star', 0.4),
    ];
    strum(sim, bard);
    const given = cats.filter((c) => c.sp > 0.4).map((c) => c.cell).sort((a, b) => a - b);
    expect(given).toEqual([3, 5, 7, 9]);
    expect(cats.find((c) => c.cell === 20)!.sp).toBe(0.4);
  });

  it('pass over a gauge at 80% or more (a full one that waits for its condition too), and take the next lowest instead', () => {
    const sim = arena();
    const bard = bardAt(sim, 0);
    const a = skillCat(sim, 1, 'w_viking', 0.8);
    const b = skillCat(sim, 2, 'w_tiger', 1);
    const c = skillCat(sim, 3, 'r_gunner', 0.79);
    const d = skillCat(sim, 4, 'r_star', 0.9);
    strum(sim, bard);
    expect([a.sp, b.sp, d.sp]).toEqual([0.8, 1, 0.9]);
    expect(c.sp).toBeCloseTo(0.99, 12);
  });

  it('never put a gauge above the top (a note on a gauge the row\'s skip would let through is clamped, and the full gauge casts at once)', () => {
    turn(ROW, 'skip', 1.01);
    const sim = arena();
    const bard = bardAt(sim, 0);
    const a = skillCat(sim, 1, 'w_viking', 0.9);
    a.spCheckAt = 99;
    strum(sim, bard);
    expect(a.sp).toBe(1);
    expect(a.spCheckAt).toBe(0);
  });

  it('are not given to the bard itself, and two bards fill each other once each and not themselves', () => {
    const sim = arena();
    const first = bardAt(sim, 0);
    const second = put(sim, 1, 't_bard', 0);
    second.sp = 0.3;
    strum(sim, first);
    expect(first.sp).toBe(1);
    expect(second.sp).toBeCloseTo(0.5, 12);
    first.sp = 0.1;
    second.sp = 1;
    strum(sim, second);
    expect(first.sp).toBeCloseTo(0.3, 12);
    expect(second.sp).toBe(1);
  });

  it('go to the lucky cat too (decision 23), and not when the row\'s knob keeps the bard away from it', () => {
    lend('t_lucky', { id: 'capsule', rank: 5, cooldown: 34, nameKey: 'sp.capsule.name' });
    const make = (): { bard: SimUnit; lucky: SimUnit; other: SimUnit } => {
      const sim = arena();
      const bard = bardAt(sim, 0);
      const lucky = put(sim, 1, 't_lucky', 0);
      lucky.sp = 0;
      const other = skillCat(sim, 2, 'w_viking', 0.6);
      strum(sim, bard);
      return { bard, lucky, other };
    };
    expect(SP_ROWS.capsule.bardTargetsCapsule).toBe(true);
    const on = make();
    expect(on.lucky.sp).toBeCloseTo(0.2, 12);
    expect(on.other.sp).toBeCloseTo(0.8, 12);
    turn(SP_ROWS.capsule, 'bardTargetsCapsule', false);
    const off = make();
    expect(off.lucky.sp).toBe(0);
    expect(off.lucky.charge).toBe(0);
    expect(off.other.sp).toBeCloseTo(0.8, 12);
  });
});

// ───────────────────────────── leftover notes ─────────────────────────────

describe('the notes with no gauge to fill', () => {
  /** The bard in the middle (tile 12) with the cats the notes can reach. Tiles by distance from 12: 7 (96), 11 and 13 (108), 2 (192). */
  function stage(): { sim: Sim; bard: SimUnit; paw7: SimUnit; sling11: SimUnit; sling13: SimUnit; paw2: SimUnit; sword17: SimUnit; e: SimEnemy } {
    const sim = arena();
    const e = target(sim);
    const bard = bardAt(sim, 12);
    const paw7 = plain(sim, 7, 'w_paw');
    const sling11 = plain(sim, 11, 'r_sling');
    const sling13 = plain(sim, 13, 'r_sling');
    const paw2 = plain(sim, 2, 'w_paw');
    const sword17 = plain(sim, 17, 'w_sword');
    return { sim, bard, paw7, sling11, sling13, paw2, sword17, e };
  }

  it('go to the nearest cats without a skill that have a target in reach (ties to the lower tile) and not to one that has none', () => {
    const { sim, bard, paw7, sling11, sling13, paw2, sword17, e } = stage();
    // The geometry the other tests lean on.
    expect([paw7, sling11, sling13, paw2].every((c) => inRangeOf(c.cell, c.stats.range, e))).toBe(true);
    expect(inRangeOf(sword17.cell, sword17.stats.range, e)).toBe(false);
    const casts = jamCasts(sim);
    strum(sim, bard);
    expect(casts[0]!.data.notes.map((n) => [n.cell, n.kind])).toEqual([[7, 'attack'], [11, 'attack'], [13, 'attack'], [2, 'attack']]);
    expect(casts[0]!.data.notes.every((n) => n.before === 0 && n.after === 0)).toBe(true);
    for (const c of [paw7, sling11, sling13, paw2]) expect(c.charge).toBe(1);
    expect(sword17.charge).toBe(0);
  });

  it('are the notes the skill cats cannot take: two gauge notes and two attack notes, and with no skill cat at all four attack notes', () => {
    const { sim, bard, paw7, sling11, sling13, paw2 } = stage();
    const viking = skillCat(sim, 1, 'w_viking', 0.3);
    const alch = skillCat(sim, 3, 't_alch', 0.4);
    const casts = jamCasts(sim);
    strum(sim, bard);
    expect(casts[0]!.data.notes.map((n) => [n.cell, n.kind])).toEqual([[1, 'gauge'], [3, 'gauge'], [7, 'attack'], [11, 'attack']]);
    expect([viking.sp, alch.sp]).toEqual([0.3 + 0.2, 0.4 + 0.2]);
    expect([paw7.charge, sling11.charge, sling13.charge, paw2.charge]).toEqual([1, 1, 0, 0]);
    // The same stage with the two skill cats too high to take a note: all four notes are attacks.
    const high = stage();
    skillCat(high.sim, 1, 'w_viking', 0.9);
    skillCat(high.sim, 3, 't_alch', 1);
    const more = jamCasts(high.sim);
    strum(high.sim, high.bard);
    expect(more[0]!.data.notes.map((n) => n.kind)).toEqual(['attack', 'attack', 'attack', 'attack']);
  });

  it('skip a cat that a hazard has stopped, one that already holds a full attack gauge, and one with no enemy in range', () => {
    const { sim, bard, paw7, sling11, sling13, paw2 } = stage();
    paw7.blocked = true;
    sling11.charge = 1;
    const casts = jamCasts(sim);
    strum(sim, bard);
    expect(casts[0]!.data.notes.map((n) => n.cell)).toEqual([13, 2]);
    expect(paw7.charge).toBe(0);
    expect(sling11.charge).toBe(1);
    expect([sling13.charge, paw2.charge]).toEqual([1, 1]);
  });

  it('give fewer than four notes when fewer cats can take one, and nothing at all when there are none (not ready: the gauge waits)', () => {
    const sim = arena();
    const bard = bardAt(sim, 12);
    target(sim);
    expect(jam.ready(sim, bard)).toBe(false);
    expect(jam.cast(sim, bard)).toBe(false);
    const paw = plain(sim, 7, 'w_paw');
    const casts = jamCasts(sim);
    strum(sim, bard);
    expect(casts[0]!.data.notes).toHaveLength(1);
    expect(paw.charge).toBe(1);
    // A field with no enemy: a plain cat has no target, so no note.
    const empty = arena();
    const b2 = bardAt(empty, 12);
    plain(empty, 7, 'w_paw');
    expect(jam.ready(empty, b2)).toBe(false);
  });

  it('make the cat attack in the next tick, once, at its own target, and not again until its gauge has filled', () => {
    const sim = arena();
    const e = target(sim);
    // The bard's gauge is not full: the strum is the test's own, at the moment of its choosing.
    const bard = put(sim, 12, 't_bard', 0);
    bard.sp = 0;
    const paw = plain(sim, 7, 'w_paw');
    const attacks = record(sim, 'attack');
    // A paw takes 0.55 s to charge: left alone it would not attack in the next half second.
    advance(sim, 0.1);
    expect(attacks.filter((a) => a.unit.uid === paw.uid)).toHaveLength(0);
    strum(sim, bard);
    sim.step(TICK);
    const mine = attacks.filter((a) => a.unit.uid === paw.uid);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.targetUid).toBe(e.uid);
    advance(sim, 0.3);
    expect(attacks.filter((a) => a.unit.uid === paw.uid)).toHaveLength(1);
    // The charge came back to where an attack leaves it: the gauge went on filling, it was not given a second free shot.
    expect(paw.charge).toBeLessThan(1);
  });

  it('wake a cat that is asleep on a stale "nothing in range" (an enemy shoved or pulled into reach between its two looks) so the free attack goes next tick', () => {
    const sim = arena();
    const e = target(sim);
    const bard = put(sim, 12, 't_bard', 0);
    bard.sp = 0;
    const paw = plain(sim, 7, 'w_paw');
    paw.searchAfter = sim.time + 100;
    const attacks = record(sim, 'attack');
    strum(sim, bard);
    expect(paw.searchAfter).toBe(0);
    sim.step(TICK);
    expect(attacks.filter((x) => x.unit.uid === paw.uid && x.targetUid === e.uid)).toHaveLength(1);
  });

  it('are kept when the target is gone: the free attack waits for the next enemy and then goes at once', () => {
    const sim = arena();
    target(sim);
    const bard = bardAt(sim, 12);
    const paw = plain(sim, 7, 'w_paw');
    strum(sim, bard);
    bard.sp = 0;
    // The target leaves before the cat's next look.
    clearEnemies(sim);
    const attacks = record(sim, 'attack');
    advance(sim, 0.5);
    expect(attacks).toHaveLength(0);
    expect(paw.charge).toBeGreaterThanOrEqual(1);
    const next = target(sim, 320);
    sim.step(TICK);
    expect(attacks.filter((a) => a.unit.uid === paw.uid && a.targetUid === next.uid)).toHaveLength(1);
  });

  it('count a cat whose skill is not built as a cat without one: it takes an attack note, not a gauge note', () => {
    strip('t_lucky');
    const sim = arena();
    target(sim);
    const bard = bardAt(sim, 12);
    const lucky = put(sim, 7, 't_lucky', 0);
    const casts = jamCasts(sim);
    strum(sim, bard);
    expect(casts[0]!.data.notes.map((n) => [n.uid, n.kind])).toEqual([[lucky.uid, 'attack']]);
    expect(lucky.charge).toBe(1);
    expect(lucky.sp).toBe(0);
  });

  it('keep away from the lucky cat entirely when the knob says so: neither a gauge note nor an attack note', () => {
    lend('t_lucky', { id: 'capsule', rank: 5, cooldown: 34, nameKey: 'sp.capsule.name' });
    turn(SP_ROWS.capsule, 'bardTargetsCapsule', false);
    const sim = arena();
    target(sim);
    const bard = bardAt(sim, 12);
    const lucky = put(sim, 7, 't_lucky', 0);
    lucky.sp = 0.5;
    expect(jam.ready(sim, bard)).toBe(false);
    expect(lucky.sp).toBe(0.5);
    expect(lucky.charge).toBe(0);
  });
});

// ───────────────────────────── through the real gauge pass ─────────────────────────────

describe('Jam Session in the battle', () => {
  it('casts the tick the gauge is full: the event comes first and carries the notes, the gauge goes back to 0, and the first cast is marked', () => {
    const sim = arena();
    target(sim);
    const bard = bardAt(sim, 12);
    const viking = skillCat(sim, 1, 'w_viking', 0.3);
    const paw = plain(sim, 7, 'w_paw');
    const order: string[] = [];
    sim.events.on('spCast', (e) => order.push(`cast:${e.skill}`));
    sim.events.on('attack', (a) => order.push(a.unit.uid === paw.uid ? 'pawAttack' : 'attack'));
    const casts = jamCasts(sim);
    sim.step(TICK);
    expect(casts).toHaveLength(1);
    expect(casts[0]).toMatchObject({ skill: 'jam', first: true, unit: { uid: bard.uid }, x: 360, y: 330 });
    expect(bard.sp).toBe(0);
    // The viking's own gauge ran this tick too (it stands before the bard in tile order; at its own cooldown) and the note came on top.
    expect(viking.sp).toBeCloseTo(0.3 + TICK / SP_ROWS.shove.cooldown + 0.2, 9);
    expect(paw.charge).toBeGreaterThan(1);
    expect(order).toEqual(['cast:jam']);
    sim.step(TICK);
    expect(order).toEqual(['cast:jam', 'pawAttack']);
    // A second strum much later is not the first.
    bard.sp = 1;
    bard.spCheckAt = 0;
    sim.step(TICK);
    expect(casts).toHaveLength(2);
    expect(casts[1]!.first).toBe(false);
  });

  it('waits full when no note can land, looks again every 0.2 s, and strums within one look of the moment a cat can take a note', () => {
    const sim = arena();
    target(sim);
    const bard = bardAt(sim, 12);
    const casts = jamCasts(sim);
    advance(sim, 1);
    expect(casts).toHaveLength(0);
    expect(bard.sp).toBe(1);
    expect(bard.spCheckAt).toBeGreaterThan(sim.time - 1e-9);
    expect(bard.spCheckAt).toBeLessThanOrEqual(sim.time + 0.2 + 1e-9);
    plain(sim, 7, 'w_paw');
    advance(sim, 0.25);
    expect(casts).toHaveLength(1);
    expect(bard.sp).toBeLessThan(0.1);
  });

  it('with two bards full at once, the second sees what the first did (cell order), and a second note never goes to a cat already holding a free attack', () => {
    const sim = arena();
    target(sim);
    const a = bardAt(sim, 0);
    const b = bardAt(sim, 1);
    const viking = skillCat(sim, 5, 'w_viking', 0.1);
    const tiger = skillCat(sim, 6, 'w_tiger', 0.2);
    const gunner = skillCat(sim, 7, 'r_gunner', 0.3);
    const star = skillCat(sim, 8, 'r_star', 0.4);
    const alch = skillCat(sim, 9, 't_alch', 0.5);
    const casts = jamCasts(sim);
    sim.step(TICK);
    expect(casts).toHaveLength(2);
    expect(casts[0]!.unit.uid).toBe(a.uid);
    expect(casts[1]!.unit.uid).toBe(b.uid);
    // First bard: the four lowest of the five (the second bard is full and passed over): .1 .2 .3 .4 -> .3 .4 .5 .6.
    expect(casts[0]!.data.notes.map((n) => n.cell)).toEqual([5, 6, 7, 8]);
    // Second bard: the first bard (gauge 0 after its cast), then .3 .4 .5 and the alchemist's .5 behind the gunner's .5 by tile.
    expect(casts[1]!.data.notes.map((n) => n.cell)).toEqual([0, 5, 6, 7]);
    expect(a.sp).toBeCloseTo(0.2, 12);
    expect(b.sp).toBe(0);
    const fill = (before: number, notes: number, cooldown: number): number => before + notes * 0.2 + TICK / cooldown;
    expect(viking.sp).toBeCloseTo(fill(0.1, 2, SP_ROWS.shove.cooldown), 9);
    expect(tiger.sp).toBeCloseTo(fill(0.2, 2, SP_ROWS.charge.cooldown), 9);
    expect(gunner.sp).toBeCloseTo(fill(0.3, 2, SP_ROWS.wanted.cooldown), 9);
    expect(star.sp).toBeCloseTo(fill(0.4, 1, SP_ROWS.lap.cooldown), 9);
    expect(alch.sp).toBeCloseTo(0.5 + TICK / 24, 9);

    // Two bards and one paw: the first bard's note makes the paw hold a free attack, so the second bard gives the paw nothing (it would be a
    // second shot out of one cat in one tick); its only note goes to the first bard, whose gauge went back to 0.
    const duo = arena();
    target(duo);
    const first = bardAt(duo, 0);
    bardAt(duo, 1);
    const paw = plain(duo, 7, 'w_paw');
    const more = jamCasts(duo);
    duo.step(TICK);
    expect(more.map((c) => c.data.notes.map((n) => [n.cell, n.kind]))).toEqual([[[7, 'attack']], [[0, 'gauge']]]);
    expect(first.sp).toBeCloseTo(0.2, 12);
    // One tick of its own filling (the bards' neighbour bonus and the synergies speed it up: the interval is the cat's own) and the one free attack.
    expect(paw.charge).toBeCloseTo(1 + TICK / paw.stats.interval, 9);
  });

  it('does not strum in a battle played without skills, and the gauge stays 0', () => {
    const sim = arena({ sp: false });
    target(sim);
    const bard = put(sim, 12, 't_bard', 0);
    plain(sim, 7, 'w_paw');
    const casts = jamCasts(sim);
    advance(sim, 25);
    expect(sim.spOn).toBe(false);
    expect(bard.sp).toBe(0);
    expect(casts).toHaveLength(0);
  });

  it('strums in every mode (chapter, daily, endless, gold dungeon, tutorial)', () => {
    for (const mode of ['chapter', 'daily', 'endless', 'gold', 'tutorial'] as const) {
      const sim = newSim({ mode });
      sim.summonedUnits = 1;
      quietWave(sim);
      expect(sim.phase, mode).toBe('wave');
      target(sim);
      const bard = bardAt(sim, 12);
      skillCat(sim, 1, 'w_viking', 0.2);
      const casts = jamCasts(sim);
      sim.step(TICK);
      expect(casts, mode).toHaveLength(1);
      expect(bard.sp, mode).toBe(0);
    }
  });

  it('also strums between waves, with no enemy on the field: the gauge notes need none, the attack notes have no cat that can attack', () => {
    const sim = arena();
    clearEnemies(sim);
    sim.stage = 'between';
    sim.stageTimer = 5;
    const bard = bardAt(sim, 12);
    const viking = skillCat(sim, 1, 'w_viking', 0.2);
    const paw = plain(sim, 7, 'w_paw');
    const casts = jamCasts(sim);
    sim.step(TICK);
    expect(casts).toHaveLength(1);
    expect(casts[0]!.data.notes.map((n) => [n.cell, n.kind])).toEqual([[1, 'gauge']]);
    expect(viking.sp).toBeCloseTo(0.2 + 0.2 + TICK / SP_ROWS.shove.cooldown, 9);
    expect(paw.charge).toBeLessThan(1);
    expect(bard.sp).toBe(0);
  });

  it('stands still while a choice popup is open, and goes on after it', () => {
    const sim = arena();
    target(sim);
    const bard = put(sim, 12, 't_bard', 0);
    bard.sp = 0.95;
    skillCat(sim, 1, 'w_viking', 0.2);
    const casts = jamCasts(sim);
    const phase = sim.phase;
    sim.phase = 'choice';
    sim.step(30);
    expect(bard.sp).toBe(0.95);
    expect(casts).toHaveLength(0);
    sim.phase = phase;
    advance(sim, 1.2);
    expect(casts).toHaveLength(1);
  });

  it('leaves nothing behind after the cast: no delayed item, no running body, so a sold, moved or merged cat cannot leave a dangling note', () => {
    const sim = arena();
    target(sim);
    const bard = bardAt(sim, 12);
    const viking = skillCat(sim, 1, 'w_viking', 0.3);
    const paw = plain(sim, 7, 'w_paw');
    strum(sim, bard);
    expect(sim.later).toHaveLength(0);
    expect(sim.runners).toHaveLength(0);
    // The cats the notes landed on are sold and moved in the same tick; the battle goes on without a trace of the skill.
    expect(sim.sell(7)).toBeNull();
    expect(sim.drop(1, 2)).toBeNull();
    expect(viking.cell).toBe(2);
    expect(viking.sp).toBeCloseTo(0.5, 12);
    advance(sim, 3);
    expect(sim.units[7]).toBeNull();
    expect(paw.removed).toBe(true);
  });

  it('is the same at 1x, 2x and 3x speed and with or without a listener, and draws no random number', () => {
    const random = vi.spyOn(Math, 'random');
    const play = (chunk: number, listen: boolean): string => {
      const sim = arena();
      target(sim);
      bardAt(sim, 12);
      const cats = [skillCat(sim, 1, 'w_viking', 0.2), skillCat(sim, 2, 'w_tiger', 0.5), skillCat(sim, 3, 'r_gunner', 0.9)];
      const paws = [plain(sim, 7, 'w_paw'), plain(sim, 11, 'r_sling')];
      const seen: string[] = [];
      if (listen) sim.events.on('spCast', (e) => seen.push(`${e.skill}@${sim.time.toFixed(4)}`));
      for (let n = 0; n < (20 * 60) / chunk; n++) sim.step(chunk * TICK);
      return JSON.stringify([cats.map((c) => c.sp), paws.map((c) => [c.charge, c.kills]), sim.time.toFixed(4), sim.rng.states()]);
    };
    const base = play(1, true);
    expect(play(2, true)).toBe(base);
    expect(play(3, true)).toBe(base);
    expect(play(1, false)).toBe(base);
    expect(random).not.toHaveBeenCalled();
  });

  it('plays a whole bot run twice with the same result when a bard and four skill cats are on the board, and strums in it', () => {
    const init = { ...newSim().init, seed: 4243 };
    const counts: number[] = [];
    const once = (): string => {
      let strums = 0;
      const print = fingerprintRun(init, 'synergy', {
        maxSeconds: 150,
        setup(s) {
          put(s, 12, 't_bard');
          put(s, 13, 'w_viking');
          put(s, 11, 'r_gunner');
          put(s, 7, 't_alch');
          s.events.on('spCast', (e) => {
            if (e.skill === 'jam') strums++;
          });
        },
      });
      counts.push(strums);
      return `${print.hash}/${print.end}/${print.events}`;
    };
    expect(once()).toBe(once());
    expect(counts[0]).toBe(counts[1]);
    expect(counts[0]).toBeGreaterThan(0);
  });
});

describe('Jam Session leaves the other events alone', () => {
  it('adds no event of its own but spCast (the free attack is the cat\'s ordinary attack) and no damage of its own', () => {
    const sim = arena();
    target(sim);
    const bard = bardAt(sim, 12);
    plain(sim, 7, 'w_paw');
    const seen: Array<keyof BattleEvents> = [];
    for (const type of ['spCast', 'hit', 'attack', 'status', 'enemyDie', 'fish', 'purr', 'strike', 'spRunHit', 'bite'] as const) {
      sim.events.on(type, () => seen.push(type));
    }
    strum(sim, bard);
    bard.sp = 0;
    expect(seen).toEqual(['spCast']);
    // The next tick brings the cat's own attack and its ordinary hit, and nothing else of the skill's.
    sim.step(TICK);
    expect(seen).toEqual(['spCast', 'attack', 'hit']);
  });
});

describe('Jam Session, what the review pinned down', () => {
  it('has written the gauges and the free attacks before the event arrives: `UnitState.sp` and `charge` show the `after` the payload promises', () => {
    const sim = arena();
    target(sim);
    const bard = bardAt(sim, 12);
    const viking = skillCat(sim, 1, 'w_viking', 0.1);
    const paw = plain(sim, 7, 'w_paw');
    const seen: Array<{ sp: number; charge: number; searchAfter: number; notes: SpJamNote[] }> = [];
    paw.searchAfter = sim.time + 100;
    sim.events.on('spCast', (e) => {
      if (e.skill === 'jam') seen.push({ sp: viking.sp, charge: paw.charge, searchAfter: paw.searchAfter, notes: e.data.notes });
    });
    strum(sim, bard);
    expect(seen).toHaveLength(1);
    const [gauge, attack] = seen[0]!.notes;
    expect(gauge).toMatchObject({ uid: viking.uid, kind: 'gauge', before: 0.1, after: 0.1 + 0.2 });
    expect(attack).toMatchObject({ uid: paw.uid, kind: 'attack' });
    // Read inside the listener: already the new values.
    expect(seen[0]!.sp).toBe(gauge!.after);
    expect(seen[0]!.charge).toBe(1);
    expect(seen[0]!.searchAfter).toBe(0);
  });

  it('lists the notes of equal gauges in the order of the tiles, lowest first, in the event as well as in what happens', () => {
    const sim = arena();
    const bard = bardAt(sim, 24);
    skillCat(sim, 12, 'r_gunner', 0.4);
    skillCat(sim, 3, 'w_viking', 0.4);
    skillCat(sim, 7, 't_alch', 0.4);
    const casts = jamCasts(sim);
    strum(sim, bard);
    expect(casts[0]!.data.notes.map((n) => [n.cell, n.kind])).toEqual([[3, 'gauge'], [7, 'gauge'], [12, 'gauge']]);
  });

  it('gives a free attack only to a cat whose enemy is inside its range plus the enemy\'s radius: one pixel beyond is out, and so is 10 or 59', () => {
    for (const [extra, ready] of [[-1, true], [1, false], [10, false], [59, false]] as const) {
      const sim = arena();
      const e = target(sim);
      const bard = bardAt(sim, 12);
      const paw = plain(sim, 7, 'w_paw');
      e.x = cellCenterX(7) + paw.stats.range + e.spec.radius + extra;
      e.y = cellCenterY(7);
      expect(inRangeOf(7, paw.stats.range, e), `enemy ${extra} px past the paw's reach`).toBe(ready);
      expect(jam.ready(sim, bard), `enemy ${extra} px past the paw's reach`).toBe(ready);
    }
  });
});
