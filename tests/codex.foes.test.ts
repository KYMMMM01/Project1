import { describe, expect, it } from 'vitest';
import { ENEMY_IDS, type EnemyId } from '@/game/api';
import {
  BOSS_CAP_BURST, BOSS_HP, BOSS_LIMITS, BOSS_MIN_KILL, CHAPTER_COUNT, CHAPTER_HP_MULT, ELITE_CC_FACTOR, ELITE_HP, ELITE_LIMITS, ENRAGE_COOLDOWN_MULT, ENRAGE_HP_FRACTION,
  HP_INDEX, PULL_BOSS_FACTOR, PULL_ELITE_FACTOR, SLOW_CAP, SLOW_CAP_BOSS,
} from '@/game/data/balance';
import { ENEMY_SPECS } from '@/game/data/enemies';
import { MAX_STAKE } from '@/game/data/roster';
import { stakeRules } from '@/game/data/stakes';
import { GOLD_DUNGEON_BOSS_HP, GOLD_DUNGEON_BOSS_LIMIT, GOLD_DUNGEON_WAVES, goldDungeonScript } from '@/game/data/goldDungeon';
import { chapterWaves, scriptFor } from '@/game/data/waves';
import { startWave } from '@/game/sim/flow';
import { applyStatus } from '@/game/sim/enemies';
import {
  FOE_IDS, abilitiesOf, appearances, armourBreakers, capRule, classesDealing, dungeonOnly, dungeonWaves, enrageRule, foeRank, foeStats, healthSpan, levelOf, rageApplies,
  resistanceOf, slotsIn, splitParent, targetRows, tipsOf, type Level,
} from '@/codex/foes';
import { advance, foe, newSim, quietWave } from './simHelpers';

const LEVELS: Level[] = [];
for (let chapter = 1; chapter <= CHAPTER_COUNT; chapter++) for (let stake = 0; stake <= MAX_STAKE; stake++) LEVELS.push({ chapter, stake });
const TARGETS = FOE_IDS.filter((id) => foeRank(id) !== 'normal');
/** The elites and bosses of the chapters: the dungeon's chest has its own tests below (its health, limit and waves are not the chapters' tables). */
const CHAPTER_TARGETS = TARGETS.filter((id) => !dungeonOnly(id));

describe('codex foes: which enemy is what', () => {
  it('lists every enemy once, ordinary ones first, then the elites, then the bosses', () => {
    expect([...FOE_IDS]).toEqual([...ENEMY_IDS]);
    const ranks = FOE_IDS.map(foeRank);
    expect(ranks.lastIndexOf('normal')).toBeLessThan(ranks.indexOf('elite'));
    expect(ranks.lastIndexOf('elite')).toBeLessThan(ranks.indexOf('boss'));
    // Three elites (the first chapter boss is one), the five chapter bosses and the dungeon's chest.
    expect(TARGETS).toHaveLength(3 + 5 + 1);
    expect(FOE_IDS.filter((id) => foeRank(id) === 'normal')).toContain('coin');
  });

  it('finds an enemy in the waves the scripts put it in, and a mini balloon where the balloon is', () => {
    for (const id of FOE_IDS) {
      for (let chapter = 1; chapter <= CHAPTER_COUNT; chapter++) {
        const expected = chapterWaves(chapter)
          .filter((s) => s.boss === id || s.groups.some((g) => g.enemy === (splitParent(id) ?? id)))
          .map((s) => s.wave);
        expect(slotsIn(id, chapter).map((s) => s.wave), `${id} chapter ${chapter}`).toEqual(expected);
      }
    }
    expect(splitParent('balloon_small')).toBe('balloon');
    expect(splitParent('cucumber')).toBeNull();
    expect(appearances('balloon_small')).toEqual(appearances('balloon'));
  });

  it('reads speed, armour, ward and the kill reward from the enemy data', () => {
    for (const id of FOE_IDS) {
      const s = foeStats(id);
      expect(s.speed).toBe(ENEMY_SPECS[id].speed);
      expect(s.armorPct).toBe(Math.round(ENEMY_SPECS[id].armor * 100));
      expect(s.wardPct).toBe(Math.round(ENEMY_SPECS[id].ward * 100));
      expect(s.slowResistPct).toBe(Math.round(ENEMY_SPECS[id].slowResist * 100));
      expect(s.hpMult).toBe(ENEMY_SPECS[id].hpMult);
    }
    expect(foeStats('cucumber').fish).toBe(ENEMY_SPECS.cucumber.bounty);
  });
});

describe('codex foes: health at a chapter and butler level', () => {
  it('counts an ordinary enemy as its multiple of the chapter-scaled cucumber of the wave', () => {
    for (const id of FOE_IDS.filter((e) => foeRank(e) === 'normal')) {
      for (let chapter = 1; chapter <= CHAPTER_COUNT; chapter++) {
        const span = healthSpan(id, { chapter, stake: 0 });
        const slots = slotsIn(id, chapter);
        if (slots.length === 0) {
          // The dungeon's coin walks no chapter wave but has a health in every tier: it is checked on its own below.
          if (!dungeonOnly(id)) expect(span, `${id} ${chapter}`).toBeNull();
          continue;
        }
        const at = (wave: number): number => (HP_INDEX[wave] as number) * (CHAPTER_HP_MULT[chapter - 1] as number) * ENEMY_SPECS[id].hpMult;
        expect(span?.first.hp).toBeCloseTo(at((slots[0] as { wave: number }).wave), 6);
        expect(span?.last.hp).toBeCloseTo(at((slots[slots.length - 1] as { wave: number }).wave), 6);
      }
    }
  });

  it('is the health the simulation spawns', () => {
    for (const id of ['cucumber', 'roomba', 'tangerine', 'clock'] as EnemyId[]) {
      for (const chapter of [1, 3, 5]) {
        const span = healthSpan(id, { chapter, stake: 0 });
        if (!span) continue;
        for (const point of [span.first, span.last]) {
          const sim = newSim({ chapter });
          quietWave(sim);
          startWave(sim, point.wave);
          sim.spawnIds.length = 0;
          sim.spawnTimes.length = 0;
          const e = foe(sim, id, 0, sim.baseHp() * ENEMY_SPECS[id].hpMult);
          expect(e.maxHp, `${id} chapter ${chapter} wave ${point.wave}`).toBeCloseTo(point.hp, 6);
        }
      }
    }
  });

  it('gives an elite or boss the table health of its wave, the chapter multiple and the stake multiple', () => {
    for (const id of CHAPTER_TARGETS) {
      for (const level of LEVELS) {
        const rows = targetRows(id, level);
        expect(rows.length, `${id} ${level.chapter}/${level.stake}`).toBeGreaterThan(0);
        const kind = foeRank(id);
        for (const row of rows) {
          const table = kind === 'boss' ? BOSS_HP : ELITE_HP;
          const limits = kind === 'boss' ? BOSS_LIMITS : ELITE_LIMITS;
          const k = Math.floor((row.wave - 1) / 8);
          expect(row.kind).toBe(kind);
          expect(row.hp).toBeCloseTo((table[k] as number) * (CHAPTER_HP_MULT[level.chapter - 1] as number) * stakeRules(level.stake).specialHpMult, 6);
          expect(row.limitBase).toBe(limits[k]);
          expect(row.limit).toBe((limits[k] as number) - stakeRules(level.stake).bossTimeCut);
          expect(row.cut).toBe(stakeRules(level.stake).bossTimeCut);
        }
      }
    }
  });

  it('lists the waves the script gives the enemy, or the three waves of its kind when the chapter has none', () => {
    for (const id of CHAPTER_TARGETS) {
      for (let chapter = 1; chapter <= CHAPTER_COUNT; chapter++) {
        const rows = targetRows(id, { chapter, stake: 0 });
        const real = chapterWaves(chapter).filter((s) => s.boss === id).map((s) => s.wave);
        if (real.length > 0) {
          expect(rows.map((r) => r.wave)).toEqual(real);
          expect(rows.every((r) => !r.imagined)).toBe(true);
        } else {
          expect(rows).toHaveLength(3);
          expect(rows.every((r) => r.imagined)).toBe(true);
        }
      }
    }
    expect(targetRows('cucumber', { chapter: 1, stake: 0 })).toEqual([]);
  });

  it('is the health, the time limit and the damage allowance the simulation spawns the wave with', () => {
    for (const id of CHAPTER_TARGETS) {
      for (const level of [{ chapter: 1, stake: 0 }, { chapter: 2, stake: 4 }, { chapter: 5, stake: 5 }]) {
        for (const row of targetRows(id, level).filter((r) => !r.imagined)) {
          expect(scriptFor(level.chapter, row.wave).boss).toBe(id);
          const sim = newSim({ chapter: level.chapter, stake: level.stake });
          quietWave(sim);
          startWave(sim, row.wave);
          sim.spawnIds.length = 0;
          sim.spawnTimes.length = 0;
          advance(sim, 1.05);
          const boss = sim.boss;
          expect(boss?.id, `${id} wave ${row.wave}`).toBe(id);
          expect(boss?.maxHp).toBeCloseTo(row.hp, 6);
          expect(sim.waveDuration).toBe(row.limit);
          expect(boss?.capRate).toBeCloseTo(row.cap.perSecond, 6);
        }
      }
    }
  });
});

describe('codex foes: the gold dungeon\'s coin and treasure chest (2026-10-12)', () => {
  it('knows they live in the dungeon and nowhere else, and which waves of its script they walk', () => {
    expect(FOE_IDS.filter(dungeonOnly)).toEqual(['coin', 'boss_treasure']);
    expect(dungeonWaves('coin')).toEqual(Array.from({ length: GOLD_DUNGEON_WAVES }, (_, i) => i + 1));
    expect(dungeonWaves('boss_treasure')).toEqual([GOLD_DUNGEON_WAVES]);
    expect(dungeonWaves('cucumber')).toEqual([]);
    for (const id of ['coin', 'boss_treasure'] as const) {
      expect(appearances(id), id).toEqual([]);
      for (let chapter = 1; chapter <= CHAPTER_COUNT; chapter++) expect(slotsIn(id, chapter), `${id} ${chapter}`).toEqual([]);
    }
  });

  it('gives the coin the health of its dungeon waves in the chosen tier, whatever the butler level', () => {
    for (let chapter = 1; chapter <= CHAPTER_COUNT; chapter++) {
      for (const stake of [0, 3, 5]) {
        const span = healthSpan('coin', levelOf('coin', { chapter, stake }));
        const at = (wave: number): number => (HP_INDEX[wave] as number) * (CHAPTER_HP_MULT[chapter - 1] as number) * ENEMY_SPECS.coin.hpMult;
        expect(span?.first.wave).toBe(1);
        expect(span?.last.wave).toBe(GOLD_DUNGEON_WAVES);
        expect(span?.first.hp).toBeCloseTo(at(1), 6);
        expect(span?.last.hp).toBeCloseTo(at(GOLD_DUNGEON_WAVES), 6);
      }
    }
    expect(levelOf('coin', { chapter: 2, stake: 4 })).toEqual({ chapter: 2, stake: 0 });
    expect(levelOf('boss_vacuum', { chapter: 2, stake: 4 })).toEqual({ chapter: 2, stake: 4 });
  });

  it('gives the chest one row: the dungeon\'s own health (the tier\'s multiple on top) and limit, no butler cut, and the simulation spawns it so', () => {
    for (let chapter = 1; chapter <= CHAPTER_COUNT; chapter++) {
      const rows = targetRows('boss_treasure', { chapter, stake: 0 });
      expect(rows).toHaveLength(1);
      const row = rows[0]!;
      expect(row).toMatchObject({ wave: GOLD_DUNGEON_WAVES, kind: 'boss', imagined: false, limit: GOLD_DUNGEON_BOSS_LIMIT, limitBase: GOLD_DUNGEON_BOSS_LIMIT, cut: 0 });
      expect(row.hp).toBeCloseTo(GOLD_DUNGEON_BOSS_HP * (CHAPTER_HP_MULT[chapter - 1] as number), 6);
      expect(goldDungeonScript(row.wave).boss).toBe('boss_treasure');
      const sim = newSim({ mode: 'gold', chapter });
      quietWave(sim);
      startWave(sim, row.wave);
      sim.spawnIds.length = 0;
      sim.spawnTimes.length = 0;
      advance(sim, 1.05);
      expect(sim.boss?.id).toBe('boss_treasure');
      expect(sim.boss?.maxHp).toBeCloseTo(row.hp, 6);
      expect(sim.waveDuration).toBe(row.limit);
      expect(sim.boss?.capRate).toBeCloseTo(row.cap.perSecond, 6);
    }
    // The butler level of the page does not reach it.
    expect(targetRows('boss_treasure', { chapter: 3, stake: 5 })[0]?.limit).toBe(GOLD_DUNGEON_BOSS_LIMIT);
  });

  it('describes the chest\'s one ability from its data, and gives the coin none', () => {
    const [spill] = abilitiesOf('boss_treasure');
    expect(spill).toMatchObject({ kind: 'spill', vars: { count: 3, n: 3 }, names: { coin: 'coin' } });
    expect(abilitiesOf('coin')).toEqual([]);
    expect(rageApplies('boss_treasure')).toBe(false);
  });
});

describe('codex foes: the damage allowance', () => {
  it('needs the fixed share of the limit and lets a fixed number of seconds be spent at once', () => {
    const rule = capRule(1000, 50);
    expect(rule.minSeconds).toBeCloseTo(BOSS_MIN_KILL * 50, 9);
    expect(rule.perSecond).toBeCloseTo(1000 / (BOSS_MIN_KILL * 50), 9);
    expect(rule.percent).toBeCloseTo(100 / (BOSS_MIN_KILL * 50), 9);
    expect(rule.burstSeconds).toBe(BOSS_CAP_BURST);
    expect(rule.burst).toBeCloseTo(rule.perSecond * BOSS_CAP_BURST, 9);
  });
});

describe('codex foes: control resistance', () => {
  it('says what the simulation does to a slow, a stun and a freeze, at every butler level', () => {
    // The page's numbers follow the butler level (elites and bosses resist control more with each level), so the run is played at each one.
    for (let stake = 0; stake <= MAX_STAKE; stake++) {
      const level: Level = { chapter: 1, stake };
      const sim = newSim({ stake });
      quietWave(sim);
      for (const id of FOE_IDS) {
        const res = resistanceOf(id, level);
        const e = foe(sim, id, 0);
        applyStatus(sim, e, 'slow', 0.99, 5, null);
        // The cap first, then the enemy's own resistance takes its share off what lands (30% of the 50% cap leaves 35%).
        expect(e.slow, `${id} slow, level ${stake}`).toBeCloseTo((res.slowCapPct / 100) * (1 - foeStats(id).slowResistPct / 100), 9);
        // Level 0 shows the base caps; an elite or a boss shows the level's own cap, a normal enemy the same cap at every level.
        const cap = foeRank(id) === 'normal' ? SLOW_CAP : stakeRules(stake).specialSlowCap;
        expect(res.slowCapPct, `${id} cap, level ${stake}`).toBe(Math.round(cap * 100));
        if (stake === 0) expect(res.slowCapPct).toBe(Math.round((foeRank(id) === 'normal' ? SLOW_CAP : SLOW_CAP_BOSS) * 100));
        applyStatus(sim, e, 'stun', 0, 2, null);
        applyStatus(sim, e, 'freeze', 0, 2, null);
        if (res.stun === 'none') {
          expect(e.stunned || e.frozen, id).toBe(false);
        } else {
          expect(e.stunned && e.frozen, id).toBe(true);
          const share = res.stun === 'half' ? stakeRules(stake).eliteCcFactor : 1;
          expect(e.stunUntil - sim.time, `${id} stun, level ${stake}`).toBeCloseTo(2 * share, 9);
          expect(e.freezeUntil - sim.time, `${id} freeze, level ${stake}`).toBeCloseTo(2 * share, 9);
          expect(res.stunPct, `${id} stun share, level ${stake}`).toBe(Math.round(share * 100));
          if (stake === 0 && res.stun === 'half') expect(res.stunPct).toBe(Math.round(ELITE_CC_FACTOR * 100));
        }
      }
    }
    // The pull-back is the same at every level.
    for (let stake = 0; stake <= MAX_STAKE; stake++) {
      const level: Level = { chapter: 1, stake };
      expect(resistanceOf('boss_vacuum', level).pullPct).toBe(Math.round(PULL_BOSS_FACTOR * 100));
      expect(resistanceOf('spray', level).pullPct).toBe(Math.round(PULL_ELITE_FACTOR * 100));
      expect(resistanceOf('cucumber', level).pullPct).toBe(100);
    }
  });

  it('follows the butler level: 25 to 15% of slow and 50 to 30% of an elite\'s stun, a normal enemy and a boss\'s stun immunity unchanged', () => {
    const at = (id: EnemyId, stake: number) => resistanceOf(id, { chapter: 3, stake });
    expect([0, 1, 2, 3, 4, 5].map((s) => at('spray', s).slowCapPct)).toEqual([25, 23, 21, 19, 17, 15]);
    expect([0, 1, 2, 3, 4, 5].map((s) => at('boss_needle', s).slowCapPct)).toEqual([25, 23, 21, 19, 17, 15]);
    expect([0, 1, 2, 3, 4, 5].map((s) => at('firecracker', s).stunPct)).toEqual([50, 46, 42, 38, 34, 30]);
    for (let s = 0; s <= 5; s++) {
      // The first chapter's wave-8 "boss" is an elite by trait (it can be stunned); the five real bosses never can.
      expect(at('boss_cucumber', s).stun).toBe('half');
      expect(at('boss_vacuum', s).stun).toBe('none');
      expect(at('cucumber', s)).toEqual({ slowCapPct: 50, stun: 'full', stunPct: 100, pullPct: 100 });
    }
    // A level outside the table is read as the nearest one, as the selector and the simulation do.
    expect(at('spray', 9)).toEqual(at('spray', 5));
    expect(at('spray', -2)).toEqual(at('spray', 0));
  });
});

describe('codex foes: abilities and tips', () => {
  it('has a boss ability for every boss and an elite one for every elite', () => {
    for (const id of ['boss_cucumber', 'boss_vacuum', 'boss_blender', 'boss_bath', 'boss_cloud', 'boss_needle', 'boss_treasure', 'spray', 'firecracker'] as const) {
      expect(abilitiesOf(id).length, id).toBeGreaterThan(0);
    }
    expect(abilitiesOf('cucumber')).toEqual([]);
    expect(abilitiesOf('boss_vacuum')[0]?.vars.every).toBeGreaterThan(0);
  });

  it('follows from the numbers: armour at a quarter or more asks for armour breakers or magic, ward for physical attacks', () => {
    const level = { chapter: 1, stake: 0 };
    expect(tipsOf('boss_vacuum', level).map((t) => t.kind)).toContain('armor');
    expect(tipsOf('boss_vacuum', level).map((t) => t.kind)).not.toContain('ward');
    expect(tipsOf('boss_cloud', level).map((t) => t.kind)).toContain('ward');
    expect(tipsOf('boss_cloud', level).map((t) => t.kind)).not.toContain('armor');
    for (const id of TARGETS) {
      const kinds = tipsOf(id, level).map((t) => t.kind);
      const spec = ENEMY_SPECS[id];
      expect(kinds.includes('armor'), `${id} armour`).toBe(spec.armor >= 0.25);
      expect(kinds.includes('ward'), `${id} ward`).toBe(spec.ward >= 0.25);
      expect(kinds.includes('open'), `${id} open`).toBe(spec.armor < 0.25 && spec.ward < 0.25);
      expect(kinds, id).toContain('time');
    }
    expect(tipsOf('cucumber', level)).toEqual([]);
  });

  it('names the cats that break armour and the classes of each damage type from the unit data', () => {
    expect(armourBreakers()).toContain('w_viking');
    expect(armourBreakers()).toContain('w_tiger');
    expect(armourBreakers()).not.toContain('w_paw');
    expect(classesDealing('physical')).toEqual(['warrior', 'ranger']);
    expect(classesDealing('magic')).toEqual(['mage', 'trickster']);
  });
});

describe('codex foes: the rage at half health', () => {
  it('is told only of enemies whose abilities come round on a cooldown', () => {
    expect(rageApplies('boss_vacuum')).toBe(true);
    expect(rageApplies('boss_bath')).toBe(true);
    expect(rageApplies('spray')).toBe(true);
    expect(rageApplies('firecracker')).toBe(false);
    expect(rageApplies('boss_cucumber')).toBe(false);
    expect(rageApplies('dryer')).toBe(false);
    expect(rageApplies('cucumber')).toBe(false);
  });

  it('quotes the share of health and the shorter cooldown of the data', () => {
    const rule = enrageRule();
    expect(rule.hpPct).toBe(Math.round(ENRAGE_HP_FRACTION * 100));
    expect(rule.shorterPct).toBe(Math.round((1 - ENRAGE_COOLDOWN_MULT) * 100));
  });
});
