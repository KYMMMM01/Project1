/**
 * The ground for step 2 of the skills (docs/handoff/skills2_sim.md): the rows of the eight remaining skills, their names, the stub files and
 * the registry, the two shared names ('skill' as a summon source and as a reason for a gain), and the searches that several skills share
 * (`sim/sp/near.ts`). No skill logic is tested here: the skill agents test their own skills.
 *
 * These tests are written to stay true while the skills are built: they pin the numbers the design gave (change a number on purpose and
 * change it here too) and the links between a row, a stub and the registry, never "this skill is not built".
 */
import { describe, expect, it } from 'vitest';
import { getLang, setLang, t } from '@/core/i18n';
import { SP_CAPSULE_KINDS, SP_SKILL_IDS, UNIT_IDS, type SpPayload, type SpSkillId } from '@/game/api';
import { SP_COOLDOWN, SP_RANK_OF, SP_RECHECK, SP_ROWS, SP_UNIT_OF, spRowOf, spSkillOfUnit } from '@/game/data/spSkills';
import { allUnitDefs, unitDef, unitSpec } from '@/game/data/units';
import { CELL_COUNT, CELL_H, CELL_W, cellCenterX, cellCenterY } from '@/game/geometry';
import { placeUnit } from '@/game/sim/board';
import { earnFish } from '@/game/sim/economy';
import { SP_HANDLERS } from '@/game/sim/sp/registry';
import {
  cellDist2, emptyCellsNear, enemiesAround, heaviestCluster, inRangeOf, nearestEmpty, nearestEnemyAround, touches, type ClusterPoint,
} from '@/game/sim/sp/near';
import { inReach, skillBefore } from '@/game/sim/sp/target';
import type { SpHandler } from '@/game/sim/sp/types';
import { advance, clearEnemies, foe, newSim, put, quietWave, record } from './simHelpers';

const EIGHT = ['cut', 'clones', 'cloud', 'knock', 'meteor', 'jam', 'fish', 'capsule'] as const satisfies readonly SpSkillId[];

// ───────────────────────────── the rows ─────────────────────────────

describe('the rows of the eight remaining skills', () => {
  it('has a row for each of the twelve skills, in the order of the ids, with the cat, the rank and the name key the design gives', () => {
    expect(Object.keys(SP_ROWS)).toEqual([...SP_SKILL_IDS]);
    for (const id of SP_SKILL_IDS) {
      const row = spRowOf(id);
      expect(row, id).toBe(SP_ROWS[id]);
      expect(row?.id, id).toBe(id);
      expect(row?.unit, id).toBe(SP_UNIT_OF[id]);
      expect(row?.rank, id).toBe(SP_RANK_OF[id]);
      expect(row?.nameKey, id).toBe(`sp.${id}.name`);
      expect(typeof row?.built, id).toBe('boolean');
    }
    expect(EIGHT.map((id) => SP_UNIT_OF[id])).toEqual(['w_samurai', 'r_ninja', 'm_storm', 'm_frost', 'm_cosmo', 't_bard', 't_alch', 't_lucky']);
    expect(EIGHT.map((id) => SP_RANK_OF[id])).toEqual([4, 3, 3, 4, 5, 3, 4, 5]);
  });

  it('gives every skill a cooldown in its own cell, positive and never above the owner\'s 34 s: the rank\'s 18 / 24 / 34 to start with, and 20 s for the cut and the knock by the owner\'s word', () => {
    for (const id of SP_SKILL_IDS) {
      const row = SP_ROWS[id];
      expect(row.cooldown, `${id} cooldown`).toBeGreaterThan(0);
      expect(row.cooldown, `${id} cooldown`).toBeLessThanOrEqual(34);
    }
    // The owner settled two of the eight on 2026-10-14 from the step-2 bot report (the cut and the knock waited 37 to 41 s between casts at
    // 24 s): both 20 s. The other six stay at the rank's starting value.
    expect(EIGHT.map((id) => SP_ROWS[id].cooldown)).toEqual([20, 18, 18, 20, 34, 18, 24, 34]);
    for (const id of EIGHT) if (id !== 'cut' && id !== 'knock') expect(SP_ROWS[id].cooldown, id).toBe(SP_COOLDOWN[SP_ROWS[id].rank]);
  });

  it('carries every number of the design appendix under the appendix\'s names', () => {
    expect(SP_ROWS.cut).toMatchObject({ half: 225, max: 10, fuse: 1.2, power: 1.4, reaim: 150, minEnemies: 2 });
    expect(SP_ROWS.clones).toMatchObject({
      clones: 2, throws: 4, arrive: 0.3, maxLife: 8, copyTargetsPerk: false, spread: true, readyMinEnemies: 5, seats: 'nearestEmpty',
      stackOffset: { x: 16, y: -6, scale: 0.92, alpha: 0.45, standingAlpha: 0.55 }, figureCap: 10, numbers: 'ninjaStats', reachFrom: 'cloneTile',
    });
    expect(SP_ROWS.cloud).toMatchObject({ life: 3.2, every: 0.4, host: 0.3, splash: { power: 0.15, radius: 60 }, hop: 150, cap: 6 });
    expect(SP_ROWS.knock).toMatchObject({ radius: 260, knot: 130, slowed: 3.0, frozen: 5.0, minChilled: 2 });
    expect(SP_ROWS.meteor).toMatchObject({
      warn: 1.0, inner: { radius: 90, power: 1.2 }, outer: { radius: 200, power: 0.5, delay: 0.25 },
      crater: { radius: 100, life: 4, burn: 0.3, every: 0.5 }, cluster: 150, weights: [1, 2, 3], minWeight: 3,
    });
    expect(SP_ROWS.jam).toMatchObject({ targets: 4, fill: 0.2, skip: 0.8, leftoverCharge: 1 });
    expect(SP_ROWS.fish).toMatchObject({
      flasks: 5, big: 1, smallTargets: { withBig: 4, withoutBig: 5 }, maxHp: 0.6, bounty: 2, fishSpeed: 0.25,
      fishTime: { boss: 4, elite: 2.5 }, fishLock: { boss: 8, elite: 5 }, reachMin: 3, minTargets: 2, inReachOnly: true,
    });
  });

  it('keeps every number of every row finite and not negative (the stack offset of the clones, a displacement on the screen, may be)', () => {
    const walk = (value: unknown, where: string): void => {
      if (typeof value === 'number') {
        expect(Number.isFinite(value), where).toBe(true);
        if (!where.startsWith('clones.stackOffset.')) expect(value, where).toBeGreaterThanOrEqual(0);
      } else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${where}[${i}]`));
      else if (value !== null && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(v, `${where}.${k}`);
    };
    for (const id of SP_SKILL_IDS) walk(SP_ROWS[id], id);
  });

  it('gives the lucky cat\'s capsule the six-line odds of design 3.12: they add up to 100 and roll in the order of the kinds', () => {
    const row = SP_ROWS.capsule;
    expect(Object.keys(row.weights)).toEqual([...SP_CAPSULE_KINDS]);
    expect(row.weights).toEqual({ fish: 30, purr: 25, partner: 25, more: 10, toy: 7, guardian: 3 });
    expect(Object.values(row.weights).reduce((a, b) => a + b, 0)).toBe(100);
    // The cumulative thresholds of the roll (design 3.12.1): 30 / 55 / 80 / 90 / 97 / 100.
    let sum = 0;
    expect(SP_CAPSULE_KINDS.map((k) => (sum += row.weights[k]))).toEqual([30, 55, 80, 90, 97, 100]);
    // The One More! capsule rolls inside among the three, 25 : 7 : 3, never fish, purr or a third One More!.
    expect(row.moreWeights).toEqual({ partner: 25, toy: 7, guardian: 3 });
    expect(Object.keys(row.moreWeights)).toEqual(['partner', 'toy', 'guardian']);
  });

  it('gives the capsule its delays, prizes, fallbacks, the twin\'s ranks, the toy\'s rarity floor and the half-gauge refund of the fish capsule', () => {
    const row = SP_ROWS.capsule;
    expect(row).toMatchObject({
      openDelay: 1.2, moreDelay: 1.0, fish: 1, purr: 2, fishRefund: 0.5, fallbackPurr: { partner: 3, toy: 5, guardian: 10 },
      partnerRanks: { min: 0, max: 2 }, partnerOrder: ['noPartner', 'fillsEmptyRung', 'higherRank', 'lowerCell'], partnerSafe: true, seat: 'nearestEmpty',
      toyPick: { options: 'relicChoices', picks: 1, reroll: false, common: false, floorRow: 1, rowKnob: 'act', stream: 'combat', opened: 'tickEnd', resumePhase: 'wave', dragReleased: true },
      guardianPick: { safe: true, order: ['stepDesc', 'classOrder', 'lowerCell'], free: true, eventFree: true },
      tutorial: { toyPurr: 5, guardianPurr: 10 },
      fullBoardFish: false, fullBoardPartnerFloor: false, bardTargetsCapsule: true, rollsFrom: 'combat',
    });
    // The refund keeps the gauge below full (1 would cast again in the same tick) and is never negative.
    expect(row.fishRefund).toBeGreaterThanOrEqual(0);
    expect(row.fishRefund).toBeLessThan(1);
    // The mean interval between capsules the design works out: cooldown x (1 - 0.30 x refund) = 28.9 s.
    expect(row.cooldown * (1 - (row.weights.fish / 100) * row.fishRefund)).toBeCloseTo(28.9, 5);
    expect(SP_CAPSULE_KINDS.map((k) => row.marks[k].color)).toEqual(['pink', 'pink', 'mint', 'pink', 'gold', 'rainbow']);
    expect(SP_CAPSULE_KINDS.map((k) => row.marks[k].mark)).toEqual(['none', 'heart', 'paws', 'smallCapsule', 'star', 'bands']);
  });

  it('puts a skill on a cat\'s definition exactly when its row is built, and nowhere else', () => {
    const built = SP_SKILL_IDS.filter((id) => SP_ROWS[id].built);
    expect(allUnitDefs().filter((d) => d.spSkill).map((d) => d.id).sort()).toEqual(built.map((id) => SP_UNIT_OF[id]).sort());
    for (const id of SP_SKILL_IDS) {
      const row = SP_ROWS[id];
      expect(unitDef(row.unit).spSkill !== undefined, id).toBe(row.built);
      expect(spSkillOfUnit(row.unit) !== null, id).toBe(row.built);
      if (row.built) expect(unitDef(row.unit).spSkill).toEqual({ id, rank: row.rank, cooldown: row.cooldown, nameKey: row.nameKey });
    }
    for (const unit of UNIT_IDS) expect(Boolean(unitSpec(unit).spSkill), unit).toBe(spSkillOfUnit(unit) !== null);
  });

  it('has an event payload member for each of the twelve skills', () => {
    // A compile-time check as much as a run-time one: a skill missing from the union (or one that is not a skill) fails tsc.
    const ids: Record<SpPayload['skill'], true> = {
      shove: true, cut: true, charge: true, clones: true, wanted: true, lap: true, cloud: true, knock: true, meteor: true, jam: true, fish: true, capsule: true,
    };
    expect(Object.keys(ids).sort()).toEqual([...SP_SKILL_IDS].sort());
  });
});

// ───────────────────────────── the names ─────────────────────────────

describe('the names of the skills', () => {
  const KO: Record<SpSkillId, string> = {
    shove: '방패 밀치기', cut: '이미 베었다냥', charge: '진짜 호랑이 납신다!', clones: '깜짝 분신술', wanted: '현상수배! 한 방!', lap: '별빛 한 바퀴',
    cloud: '졸졸 먹구름', knock: '톡, 와장창!', meteor: '운석 쿵!', jam: '다 같이 합주!', fish: '생선으로 변해라!', capsule: '복 뽑기 한 판!',
  };
  const EN: Record<SpSkillId, string> = {
    shove: 'Shield Shove', cut: 'Already Cut', charge: 'The Tiger Has Arrived!', clones: 'Surprise Clones', wanted: 'Wanted: One Shot!', lap: 'Starlight Lap',
    cloud: 'Tagalong Cloud', knock: 'Knock It Off!', meteor: 'Meteor Drop', jam: 'Jam Session!', fish: 'Turn Into Fish!', capsule: 'Lucky Capsule!',
  };

  it('has all twelve in Korean and in English, as the design\'s table of section 2 gives them', () => {
    const g = globalThis as { document?: unknown };
    const hadDocument = g.document;
    // setLang touches document.documentElement; give the node environment a stand-in.
    g.document = { documentElement: { lang: '' } };
    const original = getLang();
    try {
      for (const [lang, names] of [['ko', KO], ['en', EN]] as const) {
        setLang(lang);
        for (const id of SP_SKILL_IDS) expect(t(SP_ROWS[id].nameKey), `${id} ${lang}`).toBe(names[id]);
      }
    } finally {
      setLang(original);
      if (hadDocument === undefined) delete g.document;
      else g.document = hadDocument;
    }
  });

});

// ───────────────────────────── the stubs and the registry ─────────────────────────────

describe('the registry and the stubs', () => {
  const files = import.meta.glob('../src/game/sim/sp/*.ts', { eager: true }) as Record<string, Record<string, unknown>>;

  it('lists all twelve skills in the order of the ids', () => {
    expect(Object.keys(SP_HANDLERS)).toEqual([...SP_SKILL_IDS]);
  });

  it('has a file for every skill that exports the skill under its own id, and the registry holds exactly that export', () => {
    for (const id of SP_SKILL_IDS) {
      const file = files[`../src/game/sim/sp/${id}.ts`];
      expect(file, `${id}.ts exists`).toBeDefined();
      expect(Object.keys(file as object), id).toContain(id);
      expect(SP_HANDLERS[id], id).toBe((file as Record<string, unknown>)[id]);
    }
  });

  it('keeps a skill\'s row and its handler together: built exactly when there is a handler (a stub exports null)', () => {
    for (const id of SP_SKILL_IDS) {
      const handler: SpHandler | null = SP_HANDLERS[id];
      expect(handler === null || (typeof handler.ready === 'function' && typeof handler.cast === 'function'), id).toBe(true);
      expect(SP_ROWS[id].built, id).toBe(handler !== null);
    }
  });

  it('lets a full gauge whose handler is a stub wait without harm: it asks again every 0.2 s and never casts', () => {
    const handlers = SP_HANDLERS as Record<string, SpHandler | null>;
    const before = handlers.cut as SpHandler | null;
    const spec = unitSpec('w_samurai');
    const had = spec.spSkill;
    handlers.cut = null;
    spec.spSkill = { id: 'cut', rank: 4, cooldown: 24, nameKey: 'sp.cut.name' };
    try {
      const sim = newSim();
      quietWave(sim);
      const casts = record(sim, 'spCast');
      const u = put(sim, 12, 'w_samurai');
      u.sp = 1;
      advance(sim, 0.1);
      expect(u.sp).toBe(1);
      expect(u.spCheckAt).toBeGreaterThan(0);
      expect(u.spCheckAt).toBeLessThanOrEqual(sim.time + SP_RECHECK + 1e-9);
      const first = u.spCheckAt;
      advance(sim, 1);
      expect(u.sp).toBe(1);
      expect(u.spCheckAt).toBeGreaterThan(first);
      expect(casts).toHaveLength(0);
    } finally {
      handlers.cut = before;
      if (had) spec.spSkill = had;
      else delete spec.spSkill;
    }
  });
});

// ───────────────────────────── the shared names ─────────────────────────────

describe('the shared names', () => {
  it('lets placeUnit be called by a skill with the source \'skill\' and announces the cat like any other', () => {
    const sim = newSim();
    const seen = record(sim, 'summon');
    const before = sim.summonedUnits;
    const u = placeUnit(sim, 'w_paw', 7, 'skill');
    expect(sim.units[7]).toBe(u);
    expect(u.cell).toBe(7);
    expect(sim.summonedUnits).toBe(before + 1);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.source).toBe('skill');
    expect(seen[0]?.unit).toBe(u);
  });

  it('lets fish and purr come in for a skill: the event carries the reason \'skill\' and the place', () => {
    const sim = newSim();
    const fish = record(sim, 'fish');
    earnFish(sim, 40, 'skill', 100, 200);
    expect(fish).toHaveLength(1);
    expect(fish[0]).toMatchObject({ delta: 40 * sim.fishMult, reason: 'skill', x: 100, y: 200 });
  });
});

// ───────────────────────────── the shared searches ─────────────────────────────

describe('the tile searches', () => {
  it('measures the distance between tile centres in whole tile steps: up and down 96, left and right 108, the diagonal 144', () => {
    expect(cellDist2(12, 7)).toBe(CELL_H * CELL_H);
    expect(cellDist2(12, 17)).toBe(CELL_H * CELL_H);
    expect(cellDist2(12, 11)).toBe(CELL_W * CELL_W);
    expect(cellDist2(12, 13)).toBe(CELL_W * CELL_W);
    expect(cellDist2(12, 6)).toBe(CELL_W * CELL_W + CELL_H * CELL_H);
    expect(Math.sqrt(cellDist2(12, 6))).toBeCloseTo(144.5, 0);
    expect(cellDist2(3, 3)).toBe(0);
    // It is the distance between the tiles' real centres.
    for (const [a, b] of [[0, 24], [4, 20], [6, 18], [2, 22]] as const) {
      const dx = cellCenterX(a) - cellCenterX(b);
      const dy = cellCenterY(a) - cellCenterY(b);
      expect(cellDist2(a, b)).toBeCloseTo(dx * dx + dy * dy, 6);
    }
  });

  it('seats on the empty tile nearest to the centre: above and below (96 px) before left and right (108 px), ties to the lower tile', () => {
    const sim = newSim();
    put(sim, 12, 'r_ninja');
    // The design's example: a ninja on tile 12 gets 7 and 17 (96 px), not 11 and 13 (108 px).
    expect(emptyCellsNear(sim, 12).slice(0, 4)).toEqual([7, 17, 11, 13]);
    expect(nearestEmpty(sim, 12)).toBe(7);
    // The design's other example: a ninja on the top row (tile 2) gets 7 below it (96 px) and then tile 1 (108 px), the lower of 1 and 3.
    const top = newSim();
    put(top, 2, 'r_ninja');
    expect(emptyCellsNear(top, 2).slice(0, 3)).toEqual([7, 1, 3]);
    expect(nearestEmpty(top, 2)).toBe(7);
  });

  it('lists every empty tile exactly once, sorted by distance and then by tile number, and leaves out the occupied ones', () => {
    const sim = newSim();
    put(sim, 12, 'r_ninja');
    put(sim, 7, 'w_paw');
    put(sim, 13, 'w_paw');
    const list = emptyCellsNear(sim, 12);
    expect(list).toHaveLength(CELL_COUNT - 3);
    expect(new Set(list).size).toBe(list.length);
    expect(list).not.toContain(12);
    expect(list).not.toContain(7);
    expect(list).not.toContain(13);
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1] as number;
      const b = list[i] as number;
      const da = cellDist2(12, a);
      const db = cellDist2(12, b);
      expect(da < db || (da === db && a < b), `${a} before ${b}`).toBe(true);
    }
    expect(list.slice(0, 2)).toEqual([17, 11]);
    expect(nearestEmpty(sim, 12)).toBe(17);
  });

  it('counts a tile as taken when the caller says so (the ninja seats no two clones on one tile) and returns -1 when none is left', () => {
    const sim = newSim();
    put(sim, 12, 'r_ninja');
    const taken = new Set([7, 17]);
    expect(nearestEmpty(sim, 12, (c) => taken.has(c))).toBe(11);
    expect(emptyCellsNear(sim, 12, [], (c) => taken.has(c)).slice(0, 3)).toEqual([11, 13, 6]);
    expect(nearestEmpty(sim, 12, () => true)).toBe(-1);
    expect(emptyCellsNear(sim, 12, [], () => true)).toEqual([]);
    for (let c = 0; c < CELL_COUNT; c++) if (sim.units[c] === null) put(sim, c, 'w_paw');
    expect(nearestEmpty(sim, 12)).toBe(-1);
    expect(emptyCellsNear(sim, 12)).toEqual([]);
  });

  it('counts the origin itself when it is empty (distance 0), changes nothing and does not depend on a list given in', () => {
    const sim = newSim();
    put(sim, 0, 'w_paw');
    const before = sim.units.slice();
    expect(nearestEmpty(sim, 5)).toBe(5);
    expect(emptyCellsNear(sim, 5)[0]).toBe(5);
    const reuse = [99, 98, 97];
    expect(emptyCellsNear(sim, 5, reuse)).toBe(reuse);
    expect(reuse[0]).toBe(5);
    expect(reuse).toHaveLength(CELL_COUNT - 1);
    expect(sim.units).toEqual(before);
  });
});

describe('the enemy searches', () => {
  /** An enemy standing exactly at (x, y), whatever the road says: the searches read the position only. */
  function at(sim: ReturnType<typeof newSim>, x: number, y: number, id: Parameters<typeof foe>[1] = 'cucumber') {
    const e = foe(sim, id, 0);
    e.x = x;
    e.y = y;
    return e;
  }
  function arena() {
    const sim = newSim();
    quietWave(sim);
    clearEnemies(sim);
    return sim;
  }

  it('says an enemy touches a circle when its body does: centre distance up to the radius plus its own', () => {
    const sim = arena();
    const e = at(sim, 100, 100);
    const r = e.spec.radius;
    expect(touches(e, 100 + 50 + r, 100, 50)).toBe(true);
    expect(touches(e, 100 + 50 + r + 0.01, 100, 50)).toBe(false);
    expect(touches(e, 100, 100, 0)).toBe(true);
    expect(touches(e, 100 + r, 100, 0)).toBe(true);
  });

  it('asks the same question as a cat\'s reach does, for any tile and range', () => {
    const sim = arena();
    const u = put(sim, 12, 'r_archer');
    const e = at(sim, 0, 0);
    const reach = u.stats.range + e.spec.radius;
    for (const d of [0, reach - 1, reach - 1e-6, reach + 1e-6, reach + 1, 2 * reach]) {
      e.x = cellCenterX(12) + d;
      e.y = cellCenterY(12);
      expect(inRangeOf(12, u.stats.range, e), `distance ${d}`).toBe(inReach(u, e));
    }
    // Another tile, another range: the clone's tile with the ninja's range.
    e.x = cellCenterX(0) + 130;
    e.y = cellCenterY(0);
    expect(inRangeOf(0, 100, e)).toBe(false);
    expect(inRangeOf(0, 130 - e.spec.radius + 1, e)).toBe(true);
  });

  it('collects the living enemies a circle touches in skill order, leaves out what the caller skips and what is dead, and reuses the list', () => {
    const sim = arena();
    const near1 = at(sim, 200, 200);
    near1.travelled = 100;
    const near2 = at(sim, 230, 200);
    near2.travelled = 300;
    const far = at(sim, 600, 600);
    const boss = at(sim, 210, 215, 'boss_cucumber');
    boss.travelled = 10;
    const dead = at(sim, 205, 205);
    dead.dead = true;
    const out: typeof sim.enemies = [];
    const got = enemiesAround(sim, 210, 205, 60, out);
    expect(got).toBe(out);
    expect(got).not.toContain(far);
    expect(got).not.toContain(dead);
    // Skill order: the boss first, then the one that has travelled farthest.
    expect(got).toEqual([boss, near2, near1]);
    for (let i = 1; i < got.length; i++) expect(skillBefore(got[i - 1] as typeof boss, got[i] as typeof boss)).toBe(true);
    expect(enemiesAround(sim, 210, 205, 60, out, (e) => e === boss)).toEqual([near2, near1]);
    expect(enemiesAround(sim, 0, 0, 5, out)).toEqual([]);
  });

  it('finds the nearest enemy around a point, ties to the one first in skill order, and null when nothing touches', () => {
    const sim = arena();
    const a = at(sim, 300, 300);
    a.travelled = 50;
    const b = at(sim, 340, 300);
    b.travelled = 80;
    const c = at(sim, 300, 360);
    expect(nearestEnemyAround(sim, 310, 300, 150)).toBe(a);
    expect(nearestEnemyAround(sim, 310, 300, 150, (e) => e === a)).toBe(b);
    expect(nearestEnemyAround(sim, 310, 300, 150, (e) => e === a || e === b)).toBe(c);
    expect(nearestEnemyAround(sim, 310, 300, 150, () => true)).toBeNull();
    expect(nearestEnemyAround(sim, 900, 900, 150)).toBeNull();
    // Two enemies equally near: the one that has travelled farther comes first in skill order.
    const mid = (a.x + b.x) / 2;
    a.x = mid - 20;
    b.x = mid + 20;
    a.y = b.y = 300;
    c.x = c.y = 5000;
    expect(nearestEnemyAround(sim, mid, 300, 150)).toBe(b);
    b.travelled = 10;
    expect(nearestEnemyAround(sim, mid, 300, 150)).toBe(a);
    // A dead enemy is not found.
    a.dead = true;
    expect(nearestEnemyAround(sim, mid, 300, 150)).toBe(b);
  });
});

describe('the crowd search', () => {
  const pts = (list: Array<[number, number, number]>): ClusterPoint[] => list.map(([x, y, w]) => ({ x, y, w }));

  it('returns the point whose neighbourhood weighs most, itself included, and the sum through the out parameter', () => {
    const out = { sum: -1 };
    const list = pts([[0, 0, 1], [10, 0, 1], [20, 0, 1], [500, 0, 3]]);
    // Within 25 px: the first three weigh 3 around the middle one (all within 10 and 20), and the lone heavy one weighs 3 as well.
    expect(heaviestCluster(list, 25, out)).toBe(0);
    expect(out.sum).toBe(3);
    // A heavier lone point wins.
    expect(heaviestCluster(pts([[0, 0, 1], [10, 0, 1], [500, 0, 4]]), 25, out)).toBe(2);
    expect(out.sum).toBe(4);
  });

  it('breaks a tie towards the lower index (the caller feeds the points in skill order), measures by centre distance and includes the edge', () => {
    const out = { sum: 0 };
    expect(heaviestCluster(pts([[0, 0, 2], [1000, 0, 2], [2000, 0, 2]]), 100, out)).toBe(0);
    expect(out.sum).toBe(2);
    expect(heaviestCluster(pts([[0, 0, 1], [100, 0, 1]]), 100, out)).toBe(0);
    expect(out.sum).toBe(2);
    expect(heaviestCluster(pts([[0, 0, 1], [100.0001, 0, 1]]), 100, out)).toBe(0);
    expect(out.sum).toBe(1);
    // The densest middle of a line is found, not its end: within 70 px the middle point weighs 5, its neighbours 4, the ends 3.
    expect(heaviestCluster(pts([[0, 0, 1], [30, 0, 1], [60, 0, 1], [90, 0, 1], [120, 0, 1]]), 70, out)).toBe(2);
    expect(out.sum).toBe(5);
  });

  it('copes with an empty list and works without an out parameter', () => {
    const out = { sum: 9 };
    expect(heaviestCluster([], 100, out)).toBe(-1);
    expect(out.sum).toBe(0);
    expect(heaviestCluster(pts([[1, 1, 1]]), 100)).toBe(0);
  });

  it('weighs an elite and a boss as the cosmo cat does (1 / 2 / 3 by the row) and the chosen point is the heavy knot, not the most crowded one', () => {
    const [normal, elite, boss] = SP_ROWS.meteor.weights;
    const list = pts([[0, 0, normal], [30, 0, normal], [60, 0, normal], [1000, 0, boss], [1040, 0, elite]]);
    const out = { sum: 0 };
    expect(heaviestCluster(list, SP_ROWS.meteor.cluster, out)).toBe(3);
    expect(out.sum).toBe(boss + elite);
    // Three ordinary enemies together weigh the row's minWeight, no more: the knot of the boss and the elite weighs more.
    expect(normal * 3).toBe(SP_ROWS.meteor.minWeight);
  });
});
