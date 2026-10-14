/**
 * The cats' skills, simulation side of step 1 (docs/design_skills_v2.md, docs/qa/directive_2026-10-13_skills_build.md): the gauge, the
 * automatic cast, the delayed list, the damage hooks, the viking's shove, and the proof that `sp: false` leaves the battle as it was.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SP_SKILL_IDS, UNIT_IDS, type SpSkillDef, type SpCastEvent, type UnitId } from '@/game/api';
import { HAZARD_RECOVER, TICK } from '@/game/data/balance';
import { getLang, setLang, t } from '@/core/i18n';
import { enemySpec } from '@/game/data/enemies';
import {
  SP_COOLDOWN, SP_RANK5_GAP, SP_RANK_OF, SP_RECHECK, SP_ROWS, SP_START_MERGE, SP_START_NEW, SP_START_RESTORE, SP_UNIT_OF, spRowOf,
  spSkillOfUnit,
} from '@/game/data/spSkills';
import { allUnitDefs, unitDef, unitSpec } from '@/game/data/units';
import { PATH_BOTTOM, PATH_LEFT, PATH_RADIUS, PATH_RIGHT, PATH_TOP, cellCenterX, cellCenterY, pathPoint } from '@/game/geometry';
import { dealDamage, damageEnemy, pullEnemy, shoveEnemy } from '@/game/sim/enemies';
import { createBattle } from '@/game/sim/create';
import { refresh } from '@/game/sim/board';
import { later, registerLater, runLater, type LaterItem } from '@/game/sim/sp/later';
import { announceCast } from '@/game/sim/sp/cast';
import { SP_HANDLERS } from '@/game/sim/sp/registry';
import { shove } from '@/game/sim/sp/shove';
import { collectInReach, inReach, skillBefore, sortSkillOrder } from '@/game/sim/sp/target';
import type { SpHandler } from '@/game/sim/sp/types';
import type { Sim } from '@/game/sim/sim';
import type { SimEnemy, SimZone } from '@/game/sim/types';
import { advance, clearEnemies, foe, initOf, newSim, put, quietWave, record } from './simHelpers';
import { fingerprintRun } from './spHelpers';

// ───────────────────────────── helpers ─────────────────────────────

const ROW = SP_ROWS.shove;
/** Where the bottom edge of the road begins, as a distance travelled (the top edge, a corner, the right edge, a corner). */
const BOTTOM_EDGE = PATH_RIGHT - PATH_LEFT - 2 * PATH_RADIUS + (Math.PI / 2) * PATH_RADIUS * 2 + (PATH_BOTTOM - PATH_TOP - 2 * PATH_RADIUS);

/** A battle in its first wave with the scripted spawns cancelled: a test controls the field. */
function arena(over: Parameters<typeof newSim>[0] = {}, level = 1): Sim {
  const sim = newSim(over, level);
  quietWave(sim);
  return sim;
}

/** An enemy on the top edge of the road, `travelled` px from the start, held in place (the flag only: it can still be pushed). */
function pinned(sim: Sim, travelled: number, id: Parameters<typeof foe>[1] = 'cucumber', hp = 1e9): SimEnemy {
  const e = foe(sim, id, travelled, hp);
  e.frozen = true;
  return e;
}

/** A full gauge on a viking in `cell`. */
function fullViking(sim: Sim, cell: number) {
  const u = put(sim, cell, 'w_viking');
  u.sp = 1;
  return u;
}

/** A skill that never has anything to do: a lent skill must not run the real handler of a skill that is built later. */
const IDLE: SpHandler = { ready: () => false, cast: () => false };

/** Gives a cat a skill in the data for the length of a test (with a handler: idle unless one is given). */
const restores: Array<() => void> = [];
function lend(id: UnitId, def: SpSkillDef, handler: SpHandler = IDLE): void {
  const spec = unitSpec(id);
  const before = spec.spSkill;
  const handlers = SP_HANDLERS as Record<string, SpHandler | null | undefined>;
  const had = handlers[def.id];
  spec.spSkill = def;
  handlers[def.id] = handler;
  restores.push(() => {
    if (before) spec.spSkill = before;
    else delete spec.spSkill;
    // Put back exactly what was there: since step 2 the registry lists all twelve skills, a skill that is not built with a `null`.
    if (had !== undefined) handlers[def.id] = had;
    else delete handlers[def.id];
  });
}
/** Takes a cat's skill away from its definition for the length of a test (a cat that has none: the skill is built but this test wants a plain one). */
function stripSkill(id: UnitId): void {
  const spec = unitSpec(id);
  const before = spec.spSkill;
  delete spec.spSkill;
  restores.push(() => {
    if (before) spec.spSkill = before;
  });
}
afterEach(() => {
  while (restores.length > 0) (restores.pop() as () => void)();
  vi.restoreAllMocks();
});

const RANK5: SpSkillDef = { id: 'charge', rank: 5, cooldown: 34, nameKey: 'sp.charge.name' };

/** A handler that is always ready, logs when and for which cat it cast, and announces. */
function fakeHandler(log: Array<{ time: number; cell: number }>): SpHandler {
  return {
    ready: () => true,
    cast(s, u) {
      log.push({ time: s.time, cell: u.cell });
      announceCast(s, u, { skill: 'charge', data: { runId: 0, at: 0, dir: -1, delay: 0, duration: 0, startPath: 0, landX: 0, landY: 0, dist: 0, speed: 0, leap: 0 } });
      return true;
    },
  };
}

// ───────────────────────────── the data ─────────────────────────────

describe('the skill data', () => {
  it('reserves all twelve names, one cat each, and the default cooldown table by rank is 18 / 24 / 34 (a starting value: each row has its own cell)', () => {
    expect(SP_SKILL_IDS).toHaveLength(12);
    expect(SP_COOLDOWN).toEqual({ 3: 18, 4: 24, 5: 34 });
    expect(new Set(Object.values(SP_UNIT_OF)).size).toBe(12);
    for (const id of SP_SKILL_IDS) {
      const unit = SP_UNIT_OF[id];
      // The cat's rank is its rarity (epic 3, legendary 4, mythic 5).
      expect(SP_RANK_OF[id], id).toBe(unitSpec(unit).rarity === 'epic' ? 3 : unitSpec(unit).rarity === 'legendary' ? 4 : 5);
    }
  });

  it('has a row for each step-1 skill with the design appendix\'s cells (the shove is built)', () => {
    // The cooldown is NOT in these: it is each skill's own cell and starts at the rank's value (checked below, as a ceiling and a starting value).
    expect(SP_ROWS.shove).toMatchObject({
      push: 160, slide: 0.35, thump: 0.25, eliteFactor: 0.35, bossFactor: 0.2, window: 3, minTravelled: 30, built: true,
    });
    expect(SP_ROWS.charge).toMatchObject({
      dist: 1100, speed: 1000, leap: 0.3, power: 1.2, ignoreDefence: true, weights: [1, 2, 3], minWeight: 3,
    });
    expect(SP_ROWS.lap).toMatchObject({
      speed: 2000, extra: 100, power: 0.8, pool: 12.8, burst: { pct: 0.25, radius: 90 }, minEnemies: 4,
    });
    expect(SP_ROWS.wanted).toMatchObject({
      bite: 0.06, pool: 0.12, ignoreCap: true, ignoreDefence: true, small: 0.2, hold: 'nextWaveSpecial',
    });
    for (const id of ['shove', 'charge', 'lap', 'wanted'] as const) {
      const row = SP_ROWS[id];
      expect(row.id).toBe(id);
      expect(row.unit).toBe(SP_UNIT_OF[id]);
      expect(row.rank).toBe(SP_RANK_OF[id]);
      expect(spRowOf(id)).toBe(row);
    }
    // Step 2 gave every skill its row (the ground work, tests/sim.spGround.test.ts) and built the other eight (one test file each): all twelve rows exist and are built.
    expect(spRowOf('cut')).toBe(SP_ROWS.cut);
    expect(spRowOf('cut')?.built).toBe(true);
  });

  it('keeps the cooldown in each row\'s own cell: positive and never longer than the owner\'s 34 s, and the four step-1 skills at the values the owner settled', () => {
    for (const id of ['shove', 'charge', 'lap', 'wanted'] as const) {
      const row = SP_ROWS[id];
      expect(row.cooldown, `${id} cooldown`).toBeGreaterThan(0);
      expect(row.cooldown, `${id} cooldown`).toBeLessThanOrEqual(34);
      // The cat's definition carries what the row says.
      expect(unitDef(row.unit).spSkill?.cooldown, `${id} definition`).toBe(row.cooldown);
    }
    // The owner's values of 2026-10-14: the shove 18 -> 12 s and the lap 34 -> 26 s (the lead's proposal after the step-1 bot report), the
    // charge 34 -> 30 s (his own, after playing it), the wanted shot at its starting 24 s.
    expect(['shove', 'charge', 'lap', 'wanted'].map((id) => SP_ROWS[id as 'shove'].cooldown)).toEqual([12, 30, 26, 24]);
  });

  it('has a name for every built skill in Korean and in English, and the cat\'s definition points at it (the name bubble reads it)', () => {
    const g = globalThis as { document?: unknown };
    const hadDocument = g.document;
    // setLang touches document.documentElement; give the node environment a stand-in.
    g.document = { documentElement: { lang: '' } };
    const original = getLang();
    try {
      const names: Record<string, string[]> = {};
      for (const lang of ['ko', 'en'] as const) {
        setLang(lang);
        for (const id of SP_SKILL_IDS) {
          const row = spRowOf(id);
          if (!row?.built) continue;
          expect(row.nameKey).toBe(`sp.${id}.name`);
          expect(unitDef(row.unit).spSkill?.nameKey, id).toBe(row.nameKey);
          const name = t(row.nameKey);
          expect(name, `${id} ${lang}`).not.toBe(row.nameKey);
          expect(name.length, `${id} ${lang}`).toBeGreaterThan(2);
          (names[id] ??= []).push(name);
        }
      }
      for (const [id, pair] of Object.entries(names)) expect(pair[0], id).not.toBe(pair[1]);
      // All twelve skills are built, so all twelve names were checked (`names` is filled only for built rows: the list below is not true by construction).
      expect(SP_SKILL_IDS.every((id) => spRowOf(id)?.built), 'every skill is built').toBe(true);
      expect(Object.keys(names).sort()).toEqual([...SP_SKILL_IDS].sort());
      for (const id of ['charge', 'lap', 'shove', 'wanted']) expect(names[id], id).toBeDefined();
    } finally {
      setLang(original);
      if (hadDocument === undefined) delete g.document;
      else g.document = hadDocument;
    }
  });

  it('builds a cat\'s definition from its row\'s cooldown, not from its rank: a row with another number gives the cat that number', async () => {
    vi.resetModules();
    try {
      const rows = await import('@/game/data/spSkills');
      rows.SP_ROWS.wanted.cooldown = 20;
      rows.SP_ROWS.shove.cooldown = 11;
      const units = await import('@/game/data/units');
      expect(units.unitDef('r_gunner').spSkill?.cooldown).toBe(20);
      expect(units.unitDef('w_viking').spSkill?.cooldown).toBe(11);
      expect(units.unitDef('w_tiger').spSkill?.cooldown).toBe(30);
    } finally {
      vi.resetModules();
    }
  });

  it('gives a cat a skill on its definition only when the row is built, and a built row always has a handler (and the other way round)', () => {
    const built = SP_SKILL_IDS.map((id) => spRowOf(id)).filter((row) => row?.built).map((row) => row?.unit as UnitId);
    const withSkill = allUnitDefs().filter((d) => d.spSkill).map((d) => d.id);
    expect(withSkill.slice().sort()).toEqual(built.slice().sort());
    expect(built).toContain('w_viking');
    expect(unitDef('w_viking').spSkill).toEqual({ id: 'shove', rank: 3, cooldown: 12, nameKey: 'sp.shove.name' });
    expect(spSkillOfUnit('w_viking')).toBe(SP_ROWS.shove);
    for (const row of [SP_ROWS.charge, SP_ROWS.lap, SP_ROWS.wanted]) {
      expect(unitDef(row.unit).spSkill !== undefined, row.id).toBe(row.built);
      expect(spSkillOfUnit(row.unit) !== null, row.id).toBe(row.built);
    }
    for (const id of SP_SKILL_IDS) {
      const row = spRowOf(id);
      expect(Boolean(SP_HANDLERS[id]), `${id}: handler registered`).toBe(row?.built === true);
    }
    for (const id of UNIT_IDS) expect(Boolean(unitSpec(id).spSkill), id).toBe(spSkillOfUnit(id) !== null);
  });
});

// ───────────────────────────── the gauge ─────────────────────────────

describe('the gauge', () => {
  it('starts at 50% for a cat put on the board, and a cat without a skill has none', () => {
    const sim = newSim();
    expect(put(sim, 0, 'w_viking').sp).toBe(SP_START_NEW);
    expect(SP_START_NEW).toBe(0.5);
    expect(put(sim, 1, 'w_paw').sp).toBe(0);
    expect(put(sim, 2, 'w_sword').sp).toBe(0); // was `w_samurai` until its skill was built in step 2: any cat of rank 1 or 2 stays without one
  });

  it('fills by TICK / cooldown, by simulation time only: attack speed, weakening and a bell next to it do not change it', () => {
    const plain = arena();
    const a = put(plain, 0, 'w_viking');
    a.sp = 0;
    advance(plain, 3);
    expect(a.sp).toBeCloseTo(3 / SP_ROWS.shove.cooldown, 6);

    const busy = arena();
    const b = put(busy, 0, 'w_viking');
    put(busy, 1, 't_bell');
    b.sp = 0;
    b.weakened = 10;
    busy.statsDirty = true;
    advance(busy, 3);
    expect(b.buffAttackSpeed).toBeGreaterThan(0);
    expect(b.sp).toBeCloseTo(3 / SP_ROWS.shove.cooldown, 6);
  });

  it('takes half its cooldown from a start of 50% to a full gauge (the viking: 6 s of its 12)', () => {
    const sim = arena();
    const u = put(sim, 0, 'w_viking');
    advance(sim, SP_ROWS.shove.cooldown / 2 - 0.1);
    expect(u.sp).toBeLessThan(1);
    advance(sim, 0.2);
    expect(u.sp).toBe(1);
  });

  it('fills at the speed of its own cooldown cell: a rank 3 cat whose definition says 20 s (or 12 s) takes 20 s (or 12 s), not the rank\'s 18', () => {
    for (const cooldown of [20, 12]) {
      const sim = arena();
      lend('w_viking', { id: 'shove', rank: 3, cooldown, nameKey: 'sp.shove.name' });
      const u = put(sim, 0, 'w_viking');
      u.sp = 0;
      advance(sim, cooldown / 2);
      expect(u.sp, `${cooldown} s`).toBeCloseTo(0.5, 4);
      advance(sim, cooldown / 2 + 0.1);
      expect(u.sp, `${cooldown} s`).toBe(1);
    }
  });

  it('stands still while the cat is blocked by a hazard cell and for the 0.3 s of recovery, like the attack gauge', () => {
    const sim = arena();
    const u = put(sim, 0, 'w_viking');
    u.sp = 0.2;
    sim.hazardCount[0] = 1;
    advance(sim, 2);
    expect(u.blocked).toBe(true);
    expect(u.sp).toBe(0.2);
    // Moved off the hazard: the recovery starts, then the gauge runs again.
    expect(sim.drop(0, 1)).toBeNull();
    advance(sim, HAZARD_RECOVER - 0.05);
    expect(u.sp).toBe(0.2);
    advance(sim, 0.2);
    expect(u.sp).toBeGreaterThan(0.2);
    expect(u.sp).toBeLessThan(0.2 + 0.2 / SP_ROWS.shove.cooldown + 1e-9);
  });

  it('is kept by moving and by swapping', () => {
    const sim = arena();
    const u = put(sim, 0, 'w_viking');
    const paw = put(sim, 3, 'w_paw');
    u.sp = 0.7;
    expect(sim.drop(0, 5)).toBeNull();
    expect(sim.units[5]).toBe(u);
    expect(u.sp).toBe(0.7);
    expect(sim.drop(5, 3)).toBeNull();
    expect(sim.units[3]).toBe(u);
    expect(sim.units[5]).toBe(paw);
    expect(u.sp).toBe(0.7);
  });

  it('starts a merge result at 50% whatever the two cats had', () => {
    const sim = arena();
    put(sim, 0, 'w_sword');
    put(sim, 1, 'w_sword');
    expect(sim.drop(0, 1)).toBeNull();
    const made = sim.units[1];
    expect(made?.id).toBe('w_viking');
    expect(made?.sp).toBe(SP_START_MERGE);
    expect(SP_START_MERGE).toBe(0.5);
    // Two vikings merge into a samurai, whose skill was built in step 2: it starts at the merge value whatever the vikings had.
    const v1 = put(sim, 2, 'w_viking');
    const v2 = put(sim, 3, 'w_viking');
    v1.sp = 0.9;
    v2.sp = 0.1;
    expect(sim.drop(2, 3)).toBeNull();
    expect(sim.units[3]?.id).toBe('w_samurai');
    expect(sim.units[3]?.sp).toBe(SP_START_MERGE);
    // Two paws merge into a sword, a cat without a skill: no gauge.
    put(sim, 4, 'w_paw');
    put(sim, 5, 'w_paw');
    expect(sim.drop(4, 5)).toBeNull();
    expect(sim.units[5]?.id).toBe('w_sword');
    expect(sim.units[5]?.sp).toBe(0);
  });

  it('keeps the ratio through a molt when the new cat has a skill, and starts the cat of a plain one as a new cat', () => {
    const sim = arena();
    sim.purr = 20;
    lend('m_storm', { id: 'cloud', rank: 3, cooldown: 18, nameKey: 'sp.cloud.name' });
    const viking = put(sim, 0, 'w_viking');
    viking.sp = 0.37;
    expect(sim.molt(0, 'mage')).toBeNull();
    expect(sim.units[0]?.id).toBe('m_storm');
    expect(sim.units[0]?.sp).toBe(0.37);
    // A cat with a skill molting into one without: nothing to keep. (The ninja got its skill in step 2 and every epic cat is getting one, so
    // the ninja plays "the cat without a skill" with its skill taken away for this test.)
    stripSkill('r_ninja');
    const second = put(sim, 1, 'w_viking');
    second.sp = 0.8;
    expect(sim.molt(1, 'ranger')).toBeNull();
    expect(sim.units[1]?.id).toBe('r_ninja');
    expect(sim.units[1]?.sp).toBe(0);
    // A plain cat molting into a skill cat starts at the new-cat value.
    expect(sim.molt(1, 'warrior')).toBeNull();
    expect(sim.units[1]?.id).toBe('w_viking');
    expect(sim.units[1]?.sp).toBe(SP_START_NEW);
  });

  it('keeps the ratio through an awakening when the guardian has a skill', () => {
    const sim = arena();
    sim.purr = 30;
    lend('w_samurai', { id: 'cut', rank: 4, cooldown: 24, nameKey: 'sp.cut.name' });
    lend('w_tiger', RANK5);
    put(sim, 5, 'w_viking');
    const samurai = put(sim, 0, 'w_samurai');
    samurai.sp = 0.64;
    expect(sim.awaken(0)).toBeNull();
    expect(sim.units[0]?.id).toBe('w_tiger');
    expect(sim.units[0]?.sp).toBe(0.64);
  });

  it('puts every cat of a restored run at 50%, whatever the gauges were when the run was saved', () => {
    const sim = newSim();
    const a = put(sim, 12, 'w_viking');
    const b = put(sim, 13, 'w_viking');
    put(sim, 14, 'w_paw');
    a.sp = 0.9;
    b.sp = 0.1;
    advance(sim, 3.1);
    const saved = sim.snapshot();
    expect(saved).not.toBeNull();
    const resumed = createBattle(sim.init, saved as NonNullable<typeof saved>) as Sim;
    expect(resumed.units[12]?.id).toBe('w_viking');
    expect(resumed.units[12]?.sp).toBe(SP_START_RESTORE);
    expect(resumed.units[13]?.sp).toBe(SP_START_RESTORE);
    expect(resumed.units[14]?.sp).toBe(0);
    expect(SP_START_RESTORE).toBe(0.5);
    expect(saved?.data).not.toMatch(/"sp"|later|spSeen/);
  });

  it('ends with the cat when it is sold', () => {
    const sim = arena();
    const u = fullViking(sim, 0);
    pinned(sim, 200);
    const casts = record(sim, 'spCast');
    expect(sim.sell(0)).toBeNull();
    expect(u.removed).toBe(true);
    advance(sim, 1);
    expect(casts).toHaveLength(0);
  });

  it('has no gauge at all in a battle played without skills: a cat that would have a skill starts at 0 and stays there (a ring must also look at BattleApi.spOn)', () => {
    const sim = arena({ sp: false });
    const viking = put(sim, 0, 'w_viking');
    const tiger = put(sim, 1, 'w_tiger');
    const paw = put(sim, 2, 'w_paw');
    expect([viking.sp, tiger.sp, paw.sp]).toEqual([0, 0, 0]);
    pinned(sim, 200);
    advance(sim, 25);
    expect([viking.sp, tiger.sp, paw.sp]).toEqual([0, 0, 0]);
    // A merge result and a restored cat too.
    put(sim, 3, 'w_sword');
    put(sim, 4, 'w_sword');
    expect(sim.drop(3, 4)).toBeNull();
    expect(sim.units[4]?.id).toBe('w_viking');
    expect(sim.units[4]?.sp).toBe(0);
    const saved = sim.snapshot();
    expect(saved).not.toBeNull();
    const resumed = createBattle(sim.init, saved as NonNullable<typeof saved>) as Sim;
    expect(resumed.spOn).toBe(false);
    for (const u of resumed.units) if (u) expect(u.sp, u.id).toBe(0);
    // And with the skills on the same cats start at 50%.
    const on = arena();
    expect(put(on, 0, 'w_viking').sp).toBe(SP_START_NEW);
  });

  it('does not move at all when the battle was started with sp: false', () => {
    const sim = arena({ sp: false });
    expect(sim.spOn).toBe(false);
    const u = fullViking(sim, 0);
    u.sp = 0.5;
    const e = pinned(sim, 200);
    const casts = record(sim, 'spCast');
    advance(sim, 10);
    expect(u.sp).toBe(0.5);
    expect(casts).toHaveLength(0);
    expect(e.travelled).toBe(200);
    expect(e.shoveImmuneUntil).toBe(0);
  });
});

// ───────────────────────────── the cast ─────────────────────────────

describe('the cast', () => {
  it('happens in the tick the gauge fills when the skill is ready, and the gauge goes back to 0', () => {
    const sim = arena();
    const u = put(sim, 0, 'w_viking');
    pinned(sim, 200);
    u.sp = 1 - 0.5 * (TICK / SP_ROWS.shove.cooldown);
    const casts = record(sim, 'spCast');
    sim.step(TICK);
    expect(casts).toHaveLength(1);
    expect(casts[0]?.unit).toBe(u);
    expect(u.sp).toBe(0);
    expect(u.spCheckAt).toBe(0);
  });

  it('waits full when there is nothing to push and casts at the next look after something arrives (within 0.2 s)', () => {
    const sim = arena();
    const u = fullViking(sim, 0);
    const casts = record(sim, 'spCast');
    advance(sim, 2);
    expect(u.sp).toBe(1);
    expect(casts).toHaveLength(0);
    const arrived = sim.time;
    pinned(sim, 200);
    advance(sim, SP_RECHECK + 2 * TICK);
    expect(casts).toHaveLength(1);
    expect(u.sp).toBeLessThan(0.02);
    expect(casts[0]!.unit).toBe(u);
    expect(sim.time - arrived).toBeLessThanOrEqual(SP_RECHECK + 2 * TICK);
  });

  it('asks whether it is ready every 0.2 s while it waits, not every tick', () => {
    const sim = arena();
    fullViking(sim, 0);
    const ready = vi.spyOn(shove, 'ready');
    advance(sim, 5);
    expect(SP_RECHECK).toBe(0.2);
    expect(ready.mock.calls.length).toBeGreaterThanOrEqual(24);
    expect(ready.mock.calls.length).toBeLessThanOrEqual(27);
  });

  it('casts a blocked cat\'s full gauge only after the hazard and the recovery are over', () => {
    const sim = arena();
    const u = fullViking(sim, 0);
    pinned(sim, 200);
    sim.hazardCount[0] = 1;
    const casts = record(sim, 'spCast');
    advance(sim, 1);
    expect(casts).toHaveLength(0);
    sim.hazardCount[0] = 0;
    u.recoverAt = sim.time + HAZARD_RECOVER;
    advance(sim, HAZARD_RECOVER - 0.05);
    expect(casts).toHaveLength(0);
    advance(sim, 0.2);
    expect(casts).toHaveLength(1);
  });

  it('casts several full gauges of one tick in cell order, not in the order the cats were put down', () => {
    const sim = arena();
    for (const cell of [24, 4, 0]) fullViking(sim, cell);
    // One enemy for each of the three: the top left, the top right and the bottom right of the road.
    pinned(sim, 60);
    pinned(sim, 540);
    pinned(sim, BOTTOM_EDGE + 100);
    const casts = record(sim, 'spCast');
    sim.step(TICK);
    expect(casts.map((c) => c.unit.cell)).toEqual([0, 4, 24]);
  });

  it('spaces rank 5 casts at least 1.2 s apart: the later cat waits with its gauge full', () => {
    const sim = arena();
    const log: Array<{ time: number; cell: number }> = [];
    lend('w_tiger', RANK5, fakeHandler(log));
    lend('r_star', { id: 'lap', rank: 5, cooldown: 34, nameKey: 'sp.lap.name' });
    const cats = [3, 1, 2].map((cell) => {
      const u = put(sim, cell, cell === 2 ? 'r_star' : 'w_tiger');
      u.sp = 1;
      return u;
    });
    expect(SP_RANK5_GAP).toBe(1.2);
    advance(sim, 4);
    // The star archer's skill has no handler here; the two tigers cast in cell order, 1.2 s apart.
    expect(log.map((l) => l.cell)).toEqual([1, 3]);
    expect(log[1]!.time - log[0]!.time).toBeGreaterThanOrEqual(1.2 - 1e-9);
    expect(log[1]!.time - log[0]!.time).toBeLessThan(1.2 + 2 * TICK);
    expect(cats[0]!.sp).toBeLessThan(1);
    expect(cats[1]!.sp).toBeLessThan(1);
  });

  it('keeps a waiting rank 5 cat full until the gap is over, then casts in that very tick', () => {
    const sim = arena();
    const log: Array<{ time: number; cell: number }> = [];
    lend('w_tiger', RANK5, fakeHandler(log));
    const first = put(sim, 1, 'w_tiger');
    const second = put(sim, 3, 'w_tiger');
    first.sp = 1;
    second.sp = 1;
    sim.step(TICK);
    expect(log).toHaveLength(1);
    expect(first.sp).toBe(0);
    expect(second.sp).toBe(1);
    advance(sim, 1.1);
    expect(log).toHaveLength(1);
    expect(second.sp).toBe(1);
    advance(sim, 0.12);
    expect(log).toHaveLength(2);
    expect(log[1]!.time - log[0]!.time).toBeLessThan(1.2 + TICK + 1e-9);
  });

  it('takes back everything a cast that found nothing to do had spent: the gauge is full again, the next look is 0.2 s away, the rank 5 gap and the "first" flag are given back', () => {
    const sim = arena();
    const log: Array<{ time: number; cell: number }> = [];
    const inner = fakeHandler(log);
    let calls = 0;
    let triedAt = -1;
    lend('w_tiger', RANK5, {
      ready: () => true,
      cast(s, u) {
        calls++;
        if (calls === 1) {
          triedAt = s.time;
          return false;
        }
        return inner.cast(s, u);
      },
    });
    const a = put(sim, 1, 'w_tiger');
    const b = put(sim, 3, 'w_tiger');
    a.sp = 1;
    b.sp = 1;
    const casts = record(sim, 'spCast');
    sim.step(TICK);
    // Cell 1 tried and gave up (`cast` said false). Its gauge is full again and it looks again in 0.2 s.
    expect(calls).toBe(2);
    expect(a.sp).toBe(1);
    expect(a.spCheckAt).toBeCloseTo(triedAt + SP_RECHECK, 9);
    // Its attempt left no 1.2 s gap behind: cell 3 cast in the same tick, and for the run it is still the first cast of the skill.
    expect(casts).toHaveLength(1);
    expect(casts[0]?.unit).toBe(b);
    expect(casts[0]?.first).toBe(true);
    expect(b.sp).toBe(0);
    // The gap that cast started is the real one: the cat that gave up casts at the first look after it, and it is not a first any more.
    advance(sim, 1.3);
    expect(casts).toHaveLength(2);
    expect(casts[1]?.unit).toBe(a);
    expect(casts[1]?.first).toBe(false);
    expect(log[1]!.time - log[0]!.time).toBeGreaterThanOrEqual(SP_RANK5_GAP - 1e-9);
    expect(log[1]!.time - log[0]!.time).toBeLessThan(SP_RANK5_GAP + SP_RECHECK + 2 * TICK);
  });

  it('does not space rank 3 casts: two vikings with enemies of their own cast in the same tick', () => {
    const sim = arena();
    fullViking(sim, 0);
    fullViking(sim, 4);
    pinned(sim, 60);
    pinned(sim, 540);
    const casts = record(sim, 'spCast');
    sim.step(TICK);
    expect(casts).toHaveLength(2);
  });

  it('puts the cast event before the thump\'s hits and tells the view who, where and what', () => {
    const sim = arena();
    const u = fullViking(sim, 0);
    const e = pinned(sim, 200);
    const where = { x: e.x, y: e.y, angle: e.angle };
    const log: string[] = [];
    const casts: SpCastEvent[] = [];
    sim.events.on('spCast', (c) => {
      log.push('cast');
      casts.push(c);
    });
    sim.events.on('hit', () => log.push('hit'));
    sim.step(TICK);
    expect(log).toEqual(['cast', 'hit']);
    const c = casts[0] as SpCastEvent;
    expect(c.unit).toBe(u);
    expect(c.skill).toBe('shove');
    expect(c.first).toBe(true);
    expect(c.x).toBe(cellCenterX(0));
    expect(c.y).toBe(cellCenterY(0));
    if (c.skill !== 'shove') throw new Error('shove');
    expect(c.data.range).toBe(u.stats.range);
    expect(c.data.slide).toBe(ROW.slide);
    expect(c.data.pushed).toHaveLength(1);
    const p = c.data.pushed[0]!;
    expect(p).toMatchObject({ uid: e.uid, x: where.x, y: where.y, angle: where.angle, distance: 160 });
    const to = pathPoint(200 - 160);
    expect(p.toX).toBeCloseTo(to.x, 9);
    expect(p.toY).toBeCloseTo(to.y, 9);
  });

  it('flags the first cast of a skill in the run, for any cat, and only that one', () => {
    const sim = arena();
    const a = fullViking(sim, 0);
    pinned(sim, 120);
    const casts = record(sim, 'spCast');
    sim.step(TICK);
    expect(casts.map((c) => c.first)).toEqual([true]);
    // A second viking, and the first one again on a fresh enemy: neither is a first.
    const b = fullViking(sim, 4);
    pinned(sim, 520);
    pinned(sim, 180);
    a.sp = 1;
    advance(sim, 0.5);
    expect(casts).toHaveLength(3);
    expect(casts.slice(1).every((c) => c.first === false)).toBe(true);
    expect(casts.map((c) => c.unit)).toContain(b);
  });

  it('does not roll crits and draws no random number: a viking that always crits shoves and thumps without touching a stream', () => {
    const sim = arena();
    const u = fullViking(sim, 0);
    u.perk.crit = 1;
    refresh(sim);
    expect(u.stats.crit).toBe(1);
    pinned(sim, 200);
    const hits = record(sim, 'hit');
    const before = sim.rng.states().join();
    sim.step(TICK);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.crit).toBe(false);
    expect(sim.rng.states().join()).toBe(before);
  });
});

// ───────────────────────────── targets and reach ─────────────────────────────

describe('who a skill looks at', () => {
  it('orders enemies: inside the laser\'s dot, then elites and bosses, then the farthest travelled, then the lower uid', () => {
    const sim = arena();
    const far = foe(sim, 'cucumber', 500);
    const near = foe(sim, 'cucumber', 100);
    const tie = foe(sim, 'cucumber', 100);
    const elite = foe(sim, 'spray', 50);
    const boss = foe(sim, 'boss_vacuum', 20);
    const dot = foe(sim, 'cucumber', 10);
    dot.focused = true;
    const list = [near, tie, boss, dot, far, elite];
    sortSkillOrder(list);
    expect(list.map((e) => e.uid)).toEqual([dot, elite, boss, far, near, tie].map((e) => e.uid));
    expect(skillBefore(boss, elite)).toBe(false);
    expect(skillBefore(elite, boss)).toBe(true);
    expect(skillBefore(near, near)).toBe(false);
    expect(skillBefore(near, tie)).toBe(true);
    expect(skillBefore(tie, near)).toBe(false);
  });

  it('lets rank 3 and 4 see only the enemies inside their own range and rank 5 the whole field', () => {
    const sim = arena();
    const viking = put(sim, 0, 'w_viking');
    lend('w_tiger', RANK5);
    const tiger = put(sim, 0 + 1, 'w_tiger');
    const near = foe(sim, 'cucumber', 150);
    const far = foe(sim, 'cucumber', 1600);
    expect(inReach(viking, near)).toBe(true);
    expect(inReach(viking, far)).toBe(false);
    expect(inReach(tiger, near)).toBe(true);
    expect(inReach(tiger, far)).toBe(true);
    const out: SimEnemy[] = [];
    expect(collectInReach(sim, viking, out)).toEqual([near]);
    expect(collectInReach(sim, tiger, out).map((e) => e.uid)).toEqual([far.uid, near.uid]);
    // Even a cat in the middle of the board, which reaches no road, sees all of it as rank 5.
    const middle = put(sim, 12, 'w_tiger');
    expect(collectInReach(sim, middle, out)).toHaveLength(2);
    const plain = put(sim, 13, 'w_viking');
    expect(collectInReach(sim, plain, out)).toHaveLength(0);
  });
});

// ───────────────────────────── the delayed list ─────────────────────────────

describe('the delayed list', () => {
  const ran: Array<{ at: number; a: number; kind: string }> = [];
  registerLater('probe', (s, item) => ran.push({ at: s.time, a: item.a, kind: item.kind }));

  it('runs items when they are due, in order of time and then of the order they were put in', () => {
    ran.length = 0;
    const sim = arena();
    const start = sim.time;
    later(sim, 1.0, 'probe', { a: 3 });
    later(sim, 0.5, 'probe', { a: 1 });
    later(sim, 1.0, 'probe', { a: 4 });
    later(sim, 0.5, 'probe', { a: 2 });
    expect(sim.later.map((i) => i.a)).toEqual([1, 2, 3, 4]);
    advance(sim, 0.45);
    expect(ran).toHaveLength(0);
    advance(sim, 0.1);
    expect(ran.map((r) => r.a)).toEqual([1, 2]);
    advance(sim, 0.5);
    expect(ran.map((r) => r.a)).toEqual([1, 2, 3, 4]);
    for (const r of ran) expect(r.at).toBeGreaterThanOrEqual(start + 0.5 - 1e-9);
    expect(ran[2]!.at - start).toBeLessThan(1.0 + 2 * TICK);
    expect(sim.later).toHaveLength(0);
  });

  it('runs the item the tick its time comes, in tick order, also with the skills switched off', () => {
    ran.length = 0;
    const sim = arena({ sp: false });
    later(sim, 0.2, 'probe', { a: 7 });
    const ticks = Math.round(0.2 / TICK);
    for (let i = 0; i < ticks - 1; i++) sim.step(TICK);
    expect(ran).toHaveLength(0);
    sim.step(TICK);
    sim.step(TICK);
    expect(ran).toHaveLength(1);
  });

  it('runs an item put in by a runner in the same pass when it is already due, and later ones on their own tick', () => {
    const order: number[] = [];
    registerLater('probe', (s, item) => {
      order.push(item.a);
      if (item.a === 1) {
        later(s, 0, 'probe', { a: 2 });
        later(s, 0.5, 'probe', { a: 3 });
      }
    });
    const sim = arena();
    later(sim, 0.1, 'probe', { a: 1 });
    advance(sim, 0.2);
    expect(order).toEqual([1, 2]);
    advance(sim, 0.6);
    expect(order).toEqual([1, 2, 3]);
    registerLater('probe', (s, item) => ran.push({ at: s.time, a: item.a, kind: item.kind }));
  });

  it('hands the runner what was put in and drops a kind nobody runs', () => {
    const got: LaterItem[] = [];
    registerLater('probe', (_s, item) => got.push(item));
    const sim = arena();
    const e = pinned(sim, 100);
    const u = put(sim, 0, 'w_viking');
    later(sim, 0, 'probe', { unit: u, enemy: e, x: 11, y: 22, a: 33, b: 44 });
    later(sim, 0, 'capsule', { a: 1 });
    expect(runLater(sim)).toBe(2);
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ unit: u, enemy: e, x: 11, y: 22, a: 33, b: 44, kind: 'probe' });
    expect(sim.later).toHaveLength(0);
    registerLater('probe', (s, item) => ran.push({ at: s.time, a: item.a, kind: item.kind }));
  });

  it('is not part of a saved run: a resumed battle starts with it empty', () => {
    const sim = newSim();
    later(sim, 5, 'probe');
    advance(sim, 3.1);
    const saved = sim.snapshot();
    expect(saved?.data).not.toContain('later');
    const resumed = createBattle(sim.init, saved as NonNullable<typeof saved>) as Sim;
    expect(resumed.later).toHaveLength(0);
  });
});

// ───────────────────────────── the damage hooks ─────────────────────────────

describe('damage hooks', () => {
  it('leaves the ordinary path as it was: armour and ward cut, the cap and the shield come in the same order', () => {
    const sim = arena();
    const roomba = foe(sim, 'roomba', 100, 1000);
    const hits = record(sim, 'hit');
    damageEnemy(sim, roomba, 100, 'physical', null, false, null);
    expect(hits[0]?.amount).toBeCloseTo(65, 9);
    const orange = foe(sim, 'tangerine', 100, 1000);
    damageEnemy(sim, orange, 100, 'magic', null, false, null);
    expect(hits[1]?.amount).toBeCloseTo(65, 9);
    damageEnemy(sim, orange, 100, 'physical', null, false, null, false);
    expect(hits[2]?.amount).toBeCloseTo(92, 9);
  });

  it('skips armour and ward when asked, and keeps the vulnerability product and the damage allowance', () => {
    const sim = arena();
    const roomba = foe(sim, 'roomba', 100, 1000);
    const hits = record(sim, 'hit');
    damageEnemy(sim, roomba, 100, 'physical', null, false, null, true);
    expect(hits[0]?.amount).toBe(100);
    const orange = foe(sim, 'tangerine', 100, 1000);
    damageEnemy(sim, orange, 100, 'magic', null, false, null, true);
    expect(hits[1]?.amount).toBe(100);
    // A broken armour or an armour-ignoring cat changes nothing for it; the laser's vulnerability still counts.
    roomba.focused = true;
    damageEnemy(sim, roomba, 100, 'physical', null, false, null, true);
    expect(hits[2]?.amount).toBeCloseTo(115, 9);
    // The elite's allowance still applies.
    const elite = foe(sim, 'spray', 100, 1000);
    elite.target = true;
    elite.capTokens = 30;
    damageEnemy(sim, elite, 100, 'physical', null, false, null, true);
    expect(hits[3]?.amount).toBe(30);
    expect(elite.capTokens).toBe(0);
  });

  it('lets dealDamage give damage outside the allowance: the tokens are neither used nor needed, and the rest of the path is the same', () => {
    const sim = arena();
    const boss = foe(sim, 'boss_vacuum', 100, 1000);
    boss.target = true;
    boss.capTokens = 5;
    boss.shield = 50;
    boss.maxShield = 50;
    const hits = record(sim, 'hit');
    const broke = record(sim, 'shieldBreak');
    const enraged = record(sim, 'enrage');
    expect(dealDamage(sim, boss, 400, 'physical', null, false, null, true)).toBe(false);
    expect(boss.capTokens).toBe(5);
    expect(boss.shield).toBe(0);
    expect(boss.hp).toBe(650);
    expect(hits[0]).toMatchObject({ amount: 400, absorbed: 50, killed: false });
    expect(broke).toHaveLength(1);
    expect(enraged).toHaveLength(0);
    // Below half health the rage comes on; at the last point of health the enemy dies.
    dealDamage(sim, boss, 200, 'physical', null, false, null, true);
    expect(enraged).toHaveLength(1);
    expect(dealDamage(sim, boss, 1e6, 'physical', null, false, null, true)).toBe(true);
    expect(boss.dead).toBe(true);
  });

  it('stays quiet when asked not to announce (a bite is not a hit)', () => {
    const sim = arena();
    const e = foe(sim, 'cucumber', 100, 1000);
    const hits = record(sim, 'hit');
    dealDamage(sim, e, 10, 'physical', null, false, null, false);
    expect(hits).toHaveLength(0);
    expect(e.hp).toBe(990);
  });

  it('pushes an enemy back with a window of its own: the black hole\'s fields stay as they were', () => {
    const sim = arena();
    const e = pinned(sim, 300);
    expect(shoveEnemy(sim, e, 160, 0.35, 3)).toBe(160);
    expect(e.shoveLeft).toBe(160);
    expect(e.shoveImmuneUntil).toBeCloseTo(sim.time + 3, 9);
    expect(e.pullUid).toBe(0);
    expect(e.pullImmuneUntil).toBe(0);
    // Inside the window: refused, and the black hole's window does not make a difference either way.
    expect(shoveEnemy(sim, e, 160, 0.35, 3)).toBe(0);
    e.pullImmuneUntil = 99;
    advance(sim, 3.01);
    expect(shoveEnemy(sim, e, 50, 0.35, 3)).toBeGreaterThan(0);
  });

  it('never pushes below the start of the road, and not at all from the start', () => {
    const sim = arena();
    const low = pinned(sim, 100);
    expect(shoveEnemy(sim, low, 160, 0.35, 3)).toBe(100);
    const start = pinned(sim, 0);
    expect(shoveEnemy(sim, start, 160, 0.35, 3)).toBe(0);
    expect(start.shoveImmuneUntil).toBe(0);
  });
});

// ───────────────────────────── the viking's shove ─────────────────────────────

describe('the shove', () => {
  it('slides everything in reach back 160 px over 0.35 s with the gaps between them kept, and the enemies do not walk meanwhile', () => {
    const sim = arena();
    fullViking(sim, 0);
    const a = foe(sim, 'cucumber', 200);
    const b = foe(sim, 'cucumber', 230);
    sim.step(TICK);
    // The slide begins at the next tick and takes 21 ticks.
    expect(a.shoveLeft).toBeCloseTo(160, 9);
    expect(a.travelled).toBeGreaterThan(199);
    advance(sim, 0.2);
    expect(a.travelled).toBeLessThan(200 - 60);
    expect(b.travelled - a.travelled).toBeCloseTo(30, 6);
    advance(sim, 0.2);
    expect(a.shoveLeft).toBe(0);
    // 200 on the way in, 160 back, and at most a few ticks of walking after the slide.
    expect(a.travelled).toBeGreaterThan(40 - 1e-6);
    expect(a.travelled).toBeLessThan(40 + 70 * 0.1);
    expect(b.travelled - a.travelled).toBeCloseTo(30, 6);
    const p = pathPoint(a.travelled);
    expect(a.x).toBeCloseTo(p.x, 9);
    expect(a.y).toBeCloseTo(p.y, 9);
  });

  it('carries a pinned enemy exactly 160 px back along the road and then leaves it where it is', () => {
    const sim = arena();
    fullViking(sim, 0);
    const a = pinned(sim, 250);
    sim.step(TICK);
    advance(sim, 0.5);
    expect(a.travelled).toBeCloseTo(90, 6);
    expect(a.shoveLeft).toBe(0);
  });

  it('thumps each pushed enemy for a quarter of the cat\'s hit through its armour, with no crit', () => {
    const sim = arena();
    const u = fullViking(sim, 0);
    const e = pinned(sim, 200);
    const hits = record(sim, 'hit');
    sim.step(TICK);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ crit: false, type: 'physical', unitId: 'w_viking', dot: null, killed: false });
    expect(hits[0]?.amount).toBeCloseTo(0.25 * u.stats.damage * (1 - enemySpec('cucumber').armor), 9);
    expect(1e9 - e.hp).toBeCloseTo(hits[0]!.amount, 3);
    expect(u.damageDealt).toBeGreaterThan(0);
  });

  it('pushes an elite 35% as far and a boss 20%, and still thumps them under their allowance', () => {
    const sim = arena();
    fullViking(sim, 0);
    const elite = pinned(sim, 200, 'spray');
    const boss = pinned(sim, 160, 'boss_vacuum');
    boss.target = true;
    boss.capTokens = 3;
    const hits = record(sim, 'hit');
    const casts = record(sim, 'spCast');
    sim.step(TICK);
    advance(sim, 0.5);
    expect(elite.travelled).toBeCloseTo(200 - 160 * 0.35, 6);
    expect(boss.travelled).toBeCloseTo(160 - 160 * 0.2, 6);
    expect(ROW.eliteFactor).toBe(0.35);
    expect(ROW.bossFactor).toBe(0.2);
    const cast = casts[0] as SpCastEvent;
    const data = cast.skill === 'shove' ? cast.data : null;
    expect(data?.pushed.map((p) => p.distance).sort((x, y) => x - y)).toEqual([32, 56]);
    const bossHit = hits.find((h) => h.enemy === boss);
    expect(bossHit?.amount).toBe(3);
  });

  it('does not touch an enemy inside its window, one near the start, one out of reach, or one standing at the start', () => {
    const sim = arena();
    const u = fullViking(sim, 0);
    const fresh = pinned(sim, 200);
    const recent = pinned(sim, 150);
    recent.shoveImmuneUntil = sim.time + 2;
    const nearStart = pinned(sim, ROW.minTravelled - 1);
    const atStart = pinned(sim, 0);
    const out = pinned(sim, 1400);
    const hits = record(sim, 'hit');
    sim.step(TICK);
    expect(hits.map((h) => h.enemy.uid)).toEqual([fresh.uid]);
    expect(recent.shoveLeft).toBe(0);
    expect(nearStart.shoveLeft).toBe(0);
    expect(atStart.shoveLeft).toBe(0);
    expect(out.shoveLeft).toBe(0);
    expect(recent.hp).toBe(1e9);
    expect(u.sp).toBe(0);
  });

  it('pushes an enemy that has just passed the near-start limit all the way to the start, never below it', () => {
    const sim = arena();
    fullViking(sim, 0);
    const e = pinned(sim, ROW.minTravelled + 10);
    sim.step(TICK);
    advance(sim, 0.5);
    expect(e.travelled).toBeCloseTo(0, 9);
    expect(e.shoveLeft).toBe(0);
    const p = pathPoint(0);
    expect(e.x).toBeCloseTo(p.x, 9);
  });

  it('is not ready with nothing to push: nobody in reach, only enemies inside their window, or only enemies at the start', () => {
    const sim = arena();
    const u = fullViking(sim, 0);
    expect(shove.ready(sim, u)).toBe(false);
    const far = pinned(sim, 1500);
    expect(shove.ready(sim, u)).toBe(false);
    const start = pinned(sim, 10);
    expect(shove.ready(sim, u)).toBe(false);
    const window = pinned(sim, 200);
    window.shoveImmuneUntil = sim.time + 1;
    expect(shove.ready(sim, u)).toBe(false);
    window.shoveImmuneUntil = 0;
    expect(shove.ready(sim, u)).toBe(true);
    expect([far, start].every((e) => !e.dead)).toBe(true);
  });

  it('never casts a middle-of-the-board viking that reaches no road: its gauge stays full', () => {
    const sim = arena();
    const u = fullViking(sim, 12);
    for (let t = 0; t < 1600; t += 100) pinned(sim, t);
    const casts = record(sim, 'spCast');
    advance(sim, 2);
    expect(casts).toHaveLength(0);
    expect(u.sp).toBe(1);
  });

  it('lets several vikings push an enemy once in a window: the second finds it taken and pushes what is left', () => {
    const sim = arena();
    const a = fullViking(sim, 0);
    const b = fullViking(sim, 1);
    const shared = pinned(sim, 250);
    const casts = record(sim, 'spCast');
    sim.step(TICK);
    // Cell 0 pushed it; cell 1 had nothing fresh in reach and waits, full.
    expect(casts.map((c) => c.unit.cell)).toEqual([0]);
    expect(b.sp).toBe(1);
    advance(sim, 0.5);
    expect(shared.travelled).toBeCloseTo(90, 6);
    // A fresh enemy for the second one: it casts, and the first one is still not pushed a second time.
    const other = pinned(sim, 260);
    advance(sim, SP_RECHECK + 0.05);
    expect(casts.map((c) => c.unit.cell)).toEqual([0, 1]);
    advance(sim, 0.5);
    expect(other.travelled).toBeCloseTo(100, 6);
    expect(shared.travelled).toBeCloseTo(90, 6);
    // After the 3 s window both can be pushed again.
    a.sp = 1;
    advance(sim, 2.9);
    expect(casts).toHaveLength(3);
    expect(shared.travelled).toBeLessThan(90);
  });

  it('works on balloons like on any enemy, and the children of a balloon that falls to the thump stand where it stood', () => {
    const sim = arena();
    const u = fullViking(sim, 0);
    const balloon = pinned(sim, 220, 'balloon', 5);
    const deaths = record(sim, 'enemyDie');
    sim.step(TICK);
    expect(balloon.dead).toBe(true);
    expect(deaths[0]?.killer).toBe(u);
    const kids = sim.enemies.filter((e) => e.id === 'balloon_small');
    expect(kids).toHaveLength(2);
    for (const k of kids) {
      expect(Math.abs(k.travelled - 220)).toBeLessThanOrEqual(7.01);
      expect(k.shoveLeft).toBe(0);
      expect(k.shoveImmuneUntil).toBe(0);
    }
  });

  it('lets a pushed balloon fall later where it has slid to: its children spawn there', () => {
    const sim = arena();
    fullViking(sim, 0);
    const balloon = pinned(sim, 260, 'balloon', 1e6);
    sim.step(TICK);
    advance(sim, 0.5);
    expect(balloon.travelled).toBeCloseTo(100, 6);
    balloon.frozen = false;
    damageEnemy(sim, balloon, 1e9, 'physical', null, false, null);
    const kids = sim.enemies.filter((e) => e.id === 'balloon_small');
    expect(kids).toHaveLength(2);
    for (const k of kids) expect(Math.abs(k.travelled - 100)).toBeLessThanOrEqual(7.01);
  });

  it('carries a stunned or frozen enemy too, and leaves the black hole\'s window alone', () => {
    const sim = arena();
    fullViking(sim, 0);
    const e = foe(sim, 'cucumber', 220);
    e.stunned = true;
    e.stunUntil = sim.time + 5;
    e.mask |= 2;
    sim.step(TICK);
    advance(sim, 0.5);
    expect(e.travelled).toBeCloseTo(60, 6);
    expect(e.pullImmuneUntil).toBe(0);
    expect(e.pullUid).toBe(0);
  });

  it('does not walk a sliding enemy forward and resumes its walk when the slide is over', () => {
    const sim = arena();
    fullViking(sim, 0);
    const e = foe(sim, 'cucumber', 260);
    sim.step(TICK);
    advance(sim, 0.4);
    const after = e.travelled;
    expect(e.shoveLeft).toBe(0);
    advance(sim, 1);
    expect(e.travelled - after).toBeCloseTo(70 * 1, 0);
  });

  it('casts again once the gauge has filled a second time, on enemies whose window is over', () => {
    const sim = arena();
    const u = fullViking(sim, 0);
    const e = pinned(sim, 200);
    const casts = record(sim, 'spCast');
    sim.step(TICK);
    advance(sim, 4);
    expect(casts).toHaveLength(1);
    expect(u.sp).toBeCloseTo(4 / SP_ROWS.shove.cooldown, 2);
    // The window is over by now (3 s): the next full gauge pushes the same enemy again, from where it stands.
    expect(e.travelled).toBeCloseTo(40, 6);
    u.sp = 1;
    advance(sim, 0.6);
    expect(casts).toHaveLength(2);
    expect(e.travelled).toBeCloseTo(0, 6);
  });

  it('can be cleared away: pushed enemies removed in the same tick break nothing', () => {
    const sim = arena();
    fullViking(sim, 0);
    pinned(sim, 200);
    pinned(sim, 230);
    sim.step(TICK);
    clearEnemies(sim);
    advance(sim, 1);
    expect(sim.enemies).toHaveLength(0);
  });

  it('never takes an enemy below the start of the road, also when a black hole pulls it back while it slides (both together would pass it)', () => {
    // The spec says so (22.6): the slide and the pull each stop at the start. The enemy has 100 px to go; the slide is 100 px and the hole
    // takes 3 px a tick on top of it, so for the last ticks the slide has more to give than the road has left.
    const sim = arena();
    fullViking(sim, 0);
    const e = pinned(sim, 100);
    const hole = { uid: 1, timeLeft: 5 } as SimZone;
    sim.step(TICK);
    expect(e.shoveLeft).toBeCloseTo(100, 9);
    let pulled = 0;
    for (let i = 0; i < 30; i++) {
      sim.step(TICK);
      pulled += pullEnemy(sim, e, 3, hole);
      expect(e.travelled, `tick ${i}`).toBeGreaterThanOrEqual(0);
      const p = pathPoint(e.travelled);
      expect(e.x).toBeCloseTo(p.x, 9);
    }
    expect(e.shoveLeft).toBe(0);
    expect(e.travelled).toBe(0);
    expect(pulled).toBeGreaterThan(30);
  });

  it('wakes the cats that found nothing in range while a slide goes on: a cat fires on the very tick a shoved enemy enters its range', () => {
    // A cat that finds nothing in range sleeps until the nearest enemy could arrive at the fastest walking speed (210 px/s). A slide moves
    // an enemy 457 px/s, so a cat on the road's far side of the slide would see it late (found by the review: up to 0.25 s).
    const sim = arena();
    const viking = put(sim, 14, 'w_viking');
    viking.sp = 0;
    const paw = put(sim, 4, 'w_paw', 1);
    // The right edge of the road runs down from the first corner. The viking (cell 14) reaches its lower part, the paw (cell 4) its upper part.
    const rightEdge = PATH_RIGHT - PATH_LEFT - 2 * PATH_RADIUS + (Math.PI / 2) * PATH_RADIUS;
    const e = pinned(sim, rightEdge + 480 - (PATH_TOP + PATH_RADIUS));
    const reach = paw.stats.range + e.spec.radius;
    const dist = () => Math.hypot(e.x - cellCenterX(4), e.y - cellCenterY(4));
    expect(dist()).toBeGreaterThan(reach + 100);
    const attacks = record(sim, 'attack');
    // The paw looks once, finds nothing and goes to sleep for about 0.65 s.
    sim.step(TICK);
    expect(paw.searchAfter).toBeGreaterThan(sim.time + 0.5);
    viking.sp = 1;
    let entered = -1;
    let fired = -1;
    for (let i = 0; i < 80 && fired < 0; i++) {
      sim.step(TICK);
      if (entered < 0 && dist() <= reach) entered = i;
      if (attacks.length > 0) fired = i;
    }
    expect(entered).toBeGreaterThan(0);
    expect(attacks[0]?.unit).toBe(paw);
    expect(attacks[0]?.targetUid).toBe(e.uid);
    // The attack comes in the tick the enemy crossed the line (the enemies move first, then the cats look), not when the cache runs out.
    expect(fired).toBe(entered);
    // It was still sliding then (the slide is 21 ticks and the line is about 19 ticks in): the cache had about 0.3 s left to run.
    expect(e.shoveLeft).toBeGreaterThan(0);
  });

  it('does not wake anybody when nothing slides: the cache of a cat that found nothing is kept', () => {
    const sim = arena();
    const paw = put(sim, 4, 'w_paw', 1);
    pinned(sim, 1500);
    sim.step(TICK);
    const until = paw.searchAfter;
    expect(until).toBeGreaterThan(sim.time + 0.3);
    advance(sim, 0.1);
    expect(paw.searchAfter).toBe(until);
  });
});

// ───────────────────────────── sp off, determinism ─────────────────────────────

/** Fingerprints of eight seeded bot runs taken on the tree BEFORE the skills existed (events in order, then end state and random streams). */
const BEFORE: Array<{ policy: 'synergy' | 'merge' | 'random'; seed: number; chapter: number; level: number; hash: string; events: number; wave: number; time: number; end: string }> = [
  { policy: 'synergy', seed: 10007, chapter: 1, level: 1, hash: '35670687', events: 25668, wave: 24, time: 476.567, end: '5d6bc307' },
  { policy: 'synergy', seed: 17926, chapter: 1, level: 1, hash: '283f28e3', events: 20232, wave: 24, time: 464.15, end: '9923729f' },
  { policy: 'merge', seed: 25845, chapter: 1, level: 1, hash: '64a4db21', events: 17736, wave: 24, time: 520.883, end: 'a691be76' },
  { policy: 'synergy', seed: 33764, chapter: 3, level: 3, hash: 'c9f93425', events: 14427, wave: 24, time: 435.383, end: '8b5570ca' },
  { policy: 'merge', seed: 41683, chapter: 2, level: 2, hash: '2ef3782c', events: 24790, wave: 24, time: 489.083, end: '12de53ef' },
  { policy: 'synergy', seed: 49602, chapter: 5, level: 6, hash: 'f4ed90bb', events: 20194, wave: 24, time: 446.817, end: '6e31b708' },
  { policy: 'random', seed: 57521, chapter: 1, level: 1, hash: '54f88d3c', events: 20552, wave: 16, time: 355.117, end: '3179f535' },
  { policy: 'synergy', seed: 65440, chapter: 4, level: 4, hash: 'e50406f1', events: 1373, wave: 4, time: 89.033, end: 'e6abe291' },
];

/**
 * Fingerprints of nine more seeded bot runs in the other modes (the daily challenge with modifiers, endless, the gold dungeon, the tutorial,
 * a stake 5 chapter), taken on the tree BEFORE the skills existed: `git archive` of the commit before the skill work, `fingerprintRun` from
 * `tests/spHelpers.ts` with the same init. Every one of those modes goes through code the skills touched (`damageEnemy`, `makeUnit`,
 * `updateEnemies`, `createBattle`), so "sp off = unchanged" has to hold in each of them, not only in the chapters.
 */
const BEFORE_MODES: Array<{
  name: string; over: Parameters<typeof initOf>[0]; level: number; policy: 'synergy' | 'merge'; maxSeconds?: number;
  hash: string; events: number; wave: number; time: number; end: string;
}> = [
  { name: 'daily swarm+rush', over: { seed: 70001, mode: 'daily', chapter: 2, modifiers: ['swarm', 'rush'] }, level: 5, policy: 'synergy', hash: 'e4801e62', events: 9344, wave: 16, time: 227.717, end: '9b09c4e7' },
  { name: 'daily giants+glass_cannon', over: { seed: 70002, mode: 'daily', chapter: 3, modifiers: ['giants', 'glass_cannon'] }, level: 5, policy: 'merge', hash: '69ad2666', events: 5436, wave: 16, time: 292.1, end: '192fc610' },
  { name: 'daily', over: { seed: 303, mode: 'daily', chapter: 2 }, level: 3, policy: 'synergy', hash: '5eefaffd', events: 5820, wave: 16, time: 275.3, end: '3bbdadf8' },
  { name: 'endless ch3', over: { seed: 70003, mode: 'endless', chapter: 3 }, level: 4, policy: 'synergy', maxSeconds: 900, hash: 'd9cc7494', events: 52936, wave: 51, time: 899.3, end: '56c86c1a' },
  { name: 'endless ch2', over: { seed: 301, mode: 'endless', chapter: 2 }, level: 4, policy: 'synergy', maxSeconds: 700, hash: '8dfef24a', events: 26282, wave: 40, time: 699.517, end: 'bae7e3d3' },
  { name: 'gold dungeon ch1', over: { seed: 70004, mode: 'gold', chapter: 1 }, level: 3, policy: 'synergy', hash: '8e90ae7e', events: 2311, wave: 8, time: 138.267, end: '6383ed95' },
  { name: 'gold dungeon ch5', over: { seed: 70005, mode: 'gold', chapter: 5 }, level: 6, policy: 'merge', hash: '67406c26', events: 2580, wave: 8, time: 140.017, end: '81adadd5' },
  { name: 'tutorial', over: { seed: 70006, mode: 'tutorial', chapter: 1 }, level: 1, policy: 'merge', hash: '66d4bef8', events: 1921, wave: 8, time: 120.2, end: '168101ca' },
  { name: 'stake 5', over: { seed: 70007, mode: 'chapter', chapter: 3, stake: 5 }, level: 3, policy: 'synergy', hash: 'd8adbe9', events: 1405, wave: 4, time: 76.033, end: '2b34045d' },
];

describe('skills switched off', () => {
  it('plays eight seeded bot runs exactly as the simulation did before the skills: same events in the same order, same end state, same random streams', () => {
    for (const r of BEFORE) {
      const print = fingerprintRun({ ...initOf({ seed: r.seed, chapter: r.chapter }, r.level), sp: false }, r.policy);
      expect(print, `${r.policy} seed ${r.seed} chapter ${r.chapter}`).toMatchObject({ hash: r.hash, events: r.events, wave: r.wave, time: r.time, end: r.end });
    }
  });

  it('plays nine more runs in the daily, endless, gold dungeon, tutorial and stake 5 modes exactly as before the skills too', { timeout: 30_000 }, () => {
    for (const r of BEFORE_MODES) {
      const print = fingerprintRun({ ...initOf(r.over, r.level), sp: false }, r.policy, r.maxSeconds ? { maxSeconds: r.maxSeconds } : {});
      expect(print, r.name).toMatchObject({ hash: r.hash, events: r.events, wave: r.wave, time: r.time, end: r.end });
    }
  });

  it('is the skills\' doing in those modes too: with them on (the default) at least four of the nine runs differ', () => {
    let differing = 0;
    for (const r of BEFORE_MODES) {
      const print = fingerprintRun(initOf(r.over, r.level), r.policy, r.maxSeconds ? { maxSeconds: r.maxSeconds } : {});
      if (print.hash !== r.hash) differing++;
    }
    expect(differing).toBeGreaterThanOrEqual(4);
  });

  it('is the only thing that makes those runs the same: with the skills on (the default) the shove changes them', () => {
    let casts = 0;
    let differing = 0;
    for (const r of BEFORE) {
      const print = fingerprintRun(initOf({ seed: r.seed, chapter: r.chapter }, r.level), r.policy, {
        setup: (s) => s.events.on('spCast', () => casts++),
      });
      if (print.hash !== r.hash) differing++;
    }
    expect(casts).toBeGreaterThan(20);
    expect(differing).toBeGreaterThanOrEqual(3);
  });

  it('is the same as leaving the field out only for the skills: sp: true and a missing field play identically', () => {
    const a = fingerprintRun(initOf({ seed: 10007 }), 'synergy');
    const b = fingerprintRun({ ...initOf({ seed: 10007 }), sp: true }, 'synergy');
    expect(b).toEqual(a);
  });
});

describe('determinism with the skills on', () => {
  it('plays the same seed twice to the same events, end state and random streams', () => {
    for (const seed of [10007, 33764]) {
      const a = fingerprintRun(initOf({ seed, chapter: 2 }, 2), 'synergy');
      const b = fingerprintRun(initOf({ seed, chapter: 2 }, 2), 'synergy');
      expect(b).toEqual(a);
    }
  });

  it('plays a run resumed from the same wave-start save the same way twice, and the vikings on it start at 50%', () => {
    const sim = newSim({ seed: 777 });
    for (const cell of [0, 4, 20, 24, 1]) put(sim, cell, 'w_viking');
    put(sim, 6, 'r_archer');
    advance(sim, 3.1);
    const saved = sim.snapshot();
    expect(saved).not.toBeNull();
    const init = sim.init;
    let casts = 0;
    const run = () => fingerprintRun(init, 'synergy', {
      snapshot: saved as NonNullable<typeof saved>,
      maxSeconds: 150,
      setup: (s) => {
        for (const u of s.units) if (u?.id === 'w_viking') expect(u.sp).toBe(0.5);
        s.events.on('spCast', () => casts++);
      },
    });
    const a = run();
    const b = run();
    expect(b).toEqual(a);
    expect(casts).toBeGreaterThan(0);
  });
});

