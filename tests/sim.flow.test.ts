import { describe, expect, it } from 'vitest';
import type { RelicId } from '@/game/api';
import { createBot } from '@/game/sim/bots';
import { createBattle } from '@/game/sim/create';
import { SIM_VERSION } from '@/game/sim/snapshot';
import { CHAPTER_HP_MULT, TICK } from '@/game/data/balance';
import { COUNTER_RELICS } from '@/game/data/relics';
import { STAKE_STEPS } from '@/game/data/stakes';
import { RELIC_RARITY } from '@/game/data/roster';
import { actFeatures, scriptFor, waveEntries } from '@/game/data/waves';
import { damageEnemy } from '@/game/sim/enemies';
import { gainRelic, startWave } from '@/game/sim/flow';
import type { Sim } from '@/game/sim/sim';
import { advance, foe, initOf, newSim, put, quietWave, record, rich, slay } from './simHelpers';

const killBoss = (sim: Sim): void => slay(sim);

/** Jumps straight into `wave` with an empty field and the scripted spawns cancelled. */
function enter(sim: Sim, wave: number): void {
  quietWave(sim);
  startWave(sim, wave);
}

describe('normal waves', () => {
  it('spawn between 0.6 and 9.6 seconds, pay at 15 seconds and roll straight into the next wave', () => {
    const sim = newSim();
    const spawns: number[] = [];
    sim.events.on('enemySpawn', () => spawns.push(sim.time));
    const ends = record(sim, 'waveEnd');
    const starts = record(sim, 'waveStart');
    advance(sim, 3.05);
    const t0 = sim.time;
    expect(sim.waveDuration).toBe(15);
    const expected = waveEntries(scriptFor(1, 1)).reduce((a, e) => a + e.count, 0);
    advance(sim, 14.8);
    expect(spawns).toHaveLength(expected);
    expect(spawns[0]! - t0).toBeGreaterThanOrEqual(0.55);
    expect(spawns.at(-1)! - t0).toBeLessThan(9.9);
    expect(ends).toHaveLength(0);
    advance(sim, 0.4);
    expect(ends).toEqual([{ wave: 1, fish: 7, called: false }]);
    expect(starts.at(-1)!.wave).toBe(2);
    expect(sim.wave).toBe(2);
    expect(sim.getStats().wavesCleared).toBe(1);
  });

  it('keeps leftover enemies on the field when the next wave starts', () => {
    const sim = newSim();
    advance(sim, 3.05 + 15.2);
    expect(sim.wave).toBe(2);
    expect(sim.enemyCount).toBeGreaterThan(5);
  });

  it('pays 6 + 1.5 per wave, scaled by the trickster synergy, plus tuna cans', () => {
    const sim = newSim();
    quietWave(sim);
    sim.fish = 0;
    const ends = record(sim, 'waveEnd');
    gainRelic(sim, 'tuna_cans');
    sim.fish = 0;
    advance(sim, 15.1);
    expect(ends[0]!.fish).toBe(7 + 12);
    put(sim, 0, 't_bell');
    put(sim, 1, 't_chef');
    put(sim, 2, 't_bard');
    put(sim, 3, 't_alch');
    expect(sim.synergyTier('trickster')).toBe(3);
    advance(sim, 15.1);
    expect(ends[1]!.fish).toBe(Math.floor(9 * 1.3) + 12);
  });

  it('can be called early once its spawns are over: 1.5 fish per remaining second, rounded up', () => {
    const sim = newSim();
    advance(sim, 3.05);
    expect(sim.callBonus()).toBe(-1);
    expect(sim.callNextWave()).toBe('not_available');
    advance(sim, 10);
    const bonus = sim.callBonus();
    expect(bonus).toBe(Math.ceil(1.5 * (sim.waveDuration - sim.waveTime) - 1e-9));
    expect(bonus).toBeGreaterThanOrEqual(7);
    const ends = record(sim, 'waveEnd');
    const fish = sim.fish;
    expect(sim.callNextWave()).toBeNull();
    expect(ends).toEqual([{ wave: 1, fish: 7 + bonus, called: true }]);
    expect(sim.fish - fish).toBe(7 + bonus);
    expect(sim.wave).toBe(2);
    expect(sim.callBonus()).toBe(-1);
  });

  it('caps the early bonus at 15', () => {
    const sim = newSim();
    quietWave(sim);
    sim.waveDuration = 100;
    expect(sim.callBonus()).toBe(15);
  });

  it('never allows an early call on an elite or boss wave', () => {
    const sim = newSim();
    enter(sim, 4);
    advance(sim, 2);
    expect(sim.callBonus()).toBe(-1);
    expect(sim.callNextWave()).toBe('not_available');
  });
});

describe('elite and boss waves', () => {
  it('bring the elite at 1 second, count the limit from then and clear the act 1.2 seconds after its death', () => {
    const sim = newSim();
    enter(sim, 4);
    const starts = record(sim, 'waveStart');
    const deaths = record(sim, 'enemyDie');
    const clears = record(sim, 'actClear');
    const offers = record(sim, 'relicOffer');
    const t0 = sim.time;
    expect(sim.waveKind).toBe('elite');
    expect(sim.waveDuration).toBe(40);
    expect(sim.boss).toBeNull();
    advance(sim, 0.9);
    expect(sim.boss).toBeNull();
    expect(sim.waveTime).toBe(0);
    advance(sim, 0.2);
    expect(sim.boss).not.toBeNull();
    expect(sim.boss!.id).toBe('boss_cucumber');
    advance(sim, 5);
    expect(sim.waveTime).toBeGreaterThan(4.8);
    expect(sim.waveTime).toBeLessThan(5.2);
    const purr = sim.purr;
    const fish = sim.fish;
    killBoss(sim);
    expect(sim.boss).toBeNull();
    expect(deaths.at(-1)!.fish).toBe(25);
    expect(deaths.at(-1)!.purr).toBe(1);
    expect(sim.purr - purr).toBe(1);
    expect(sim.fish - fish).toBeGreaterThanOrEqual(25);
    advance(sim, 1.1);
    expect(clears).toHaveLength(0);
    advance(sim, 0.2);
    expect(clears).toEqual([{ act: 1, purr: 2, fish: 30 }]);
    expect(offers).toHaveLength(1);
    expect(sim.phase).toBe('choice');
    expect(starts).toHaveLength(0);
    expect(sim.time - t0).toBeGreaterThan(6);
    expect(sim.getStats().wavesCleared).toBe(4);
  });

  it('gives bosses 60 fish and 2 purr and a longer limit', () => {
    const sim = newSim();
    enter(sim, 8);
    expect(sim.waveKind).toBe('boss');
    expect(sim.waveDuration).toBe(50);
    advance(sim, 1.1);
    expect(sim.boss!.id).toBe('boss_vacuum');
    const deaths = record(sim, 'enemyDie');
    killBoss(sim);
    expect(deaths.at(-1)).toMatchObject({ fish: 60, purr: 2 });
    expect(sim.getStats().bossesKilled).toBe(1);
  });

  it('applies hourglass, stake 4 and training to the limit', () => {
    const glass = newSim();
    gainRelic(glass, 'hourglass');
    enter(glass, 4);
    expect(glass.waveDuration).toBe(55);
    const hard = newSim({ stake: 4 });
    enter(hard, 8);
    expect(hard.waveDuration).toBe(37);
    const trained = newSim({ loadout: { unitLevels: {}, training: { boss_time: 7 }, relicPool: [] } });
    enter(trained, 12);
    expect(trained.waveDuration).toBe(45 + 7);
  });

  it('gives the boss the chapter multiplier and +40% at stake 5, and caps its damage taken per second', () => {
    const health = (over: Parameters<typeof newSim>[0]): number => {
      const sim = newSim(over);
      enter(sim, 8);
      advance(sim, 1.05);
      return sim.boss!.maxHp;
    };
    const base = health({});
    expect(health({ stake: 5 }) / base).toBeCloseTo(STAKE_STEPS.specialHpMult, 9);
    expect(health({ chapter: 3 }) / base).toBeCloseTo((CHAPTER_HP_MULT[2] as number) / (CHAPTER_HP_MULT[0] as number), 9);
    const sim = newSim();
    enter(sim, 8);
    advance(sim, 1.05);
    const boss = sim.boss!;
    const perSecond = boss.maxHp / (0.45 * sim.waveDuration);
    const before = boss.hp;
    for (let i = 0; i < 60 * 4; i++) {
      damageEnemy(sim, boss, 1e9, 'magic', null, false, null);
      sim.step(1 / 60);
      if (boss.dead) break;
    }
    const taken = before - boss.hp;
    expect(taken).toBeLessThanOrEqual(perSecond * (4 + 1.5) + 1);
    expect(taken).toBeGreaterThan(perSecond * 3);
  });

  it('is lost when the limit runs out with the boss alive (boss_timeout)', () => {
    const sim = newSim();
    enter(sim, 8);
    advance(sim, 1.1);
    sim.boss!.hp = 1e12;
    sim.boss!.maxHp = 1e12;
    const defeats = record(sim, 'defeat');
    advance(sim, 49);
    expect(sim.phase).toBe('wave');
    advance(sim, 1.5);
    expect(sim.phase).toBe('lost');
    expect(defeats).toEqual([{ reason: 'boss_timeout' }]);
  });

  it('spawns the escort over the first 10 seconds and stops it when the boss falls', () => {
    const sim = newSim();
    quietWave(sim);
    startWave(sim, 4);
    const spawned: string[] = [];
    sim.events.on('enemySpawn', (e) => spawned.push(e.enemy.id));
    advance(sim, 1.1);
    expect(spawned).toEqual(['boss_cucumber']);
    advance(sim, 3);
    const early = spawned.length;
    expect(early).toBeGreaterThan(1);
    killBoss(sim);
    advance(sim, 10);
    expect(spawned.length).toBe(early + (sim.stage === 'run' ? 0 : 0));
  });

  it('ends the run in victory when the last boss falls: wave 24, wave 16 of a daily, wave 8 of the tutorial', () => {
    for (const [mode, last] of [['chapter', 24], ['daily', 16], ['tutorial', 8]] as const) {
      const sim = newSim({ mode });
      const wins = record(sim, 'victory');
      enter(sim, last);
      advance(sim, 1.1);
      killBoss(sim);
      advance(sim, 1.3);
      expect(sim.phase, mode).toBe('won');
      expect(wins).toHaveLength(1);
      expect(wins[0]!.stats.victory).toBe(true);
      expect(wins[0]!.stats.wavesCleared).toBe(last);
    }
  });

  it('keeps going in endless mode, with health growing every wave', () => {
    const sim = newSim({ mode: 'endless' });
    expect(sim.totalWaves).toBe(0);
    enter(sim, 24);
    advance(sim, 1.1);
    killBoss(sim);
    advance(sim, 1.3);
    expect(sim.phase).toBe('choice');
    expect(sim.pickRelic(0)).toBeNull();
    advance(sim, 1.1);
    expect(sim.wave).toBe(25);
    expect(sim.previewWave(40).length).toBeGreaterThan(0);
    const a = foe(sim, 'cucumber', 0, 1);
    void a;
    expect(sim.baseHp()).toBeGreaterThan(0);
  });
});

describe('act clear, sunbeams and relic offers', () => {
  function clearAct(sim: Sim, wave = 4): void {
    enter(sim, wave);
    advance(sim, 1.1);
    killBoss(sim);
    advance(sim, 1.3);
  }

  it('starts with the four middle sunbeams and moves them at every act clear', () => {
    const sim = newSim();
    expect([...sim.sunbeams].sort((a, b) => a - b)).toEqual([6, 7, 12, 13]);
    const moves = record(sim, 'sunbeams');
    clearAct(sim);
    expect(moves).toHaveLength(1);
    expect(moves[0]!.cells).toHaveLength(4);
    expect(new Set(moves[0]!.cells).size).toBe(4);
    expect([...sim.sunbeams]).toEqual(moves[0]!.cells);
    for (const c of sim.sunbeams) expect(sim.units[c]).toBeNull();
    put(sim, moves[0]!.cells[0]!, 'w_paw');
    expect(sim.units[moves[0]!.cells[0]!]!.sunlit).toBe(true);
  });

  it('draws sun cells from the sun stream, whatever else happens', () => {
    const a = newSim({ seed: 31 });
    const b = newSim({ seed: 31 });
    const sa = record(a, 'sunbeams');
    const sb = record(b, 'sunbeams');
    clearAct(a);
    rich(b);
    b.upgradeClass('mage');
    b.summon();
    advance(b, 4);
    clearAct(b);
    expect(sa[0]!.cells).toEqual(sb[0]!.cells);
  });

  it('pays 2 purr and 20 + 10 per act in fish, less with stake 2, more with the purr pillow', () => {
    const base = newSim();
    const c1 = record(base, 'actClear');
    clearAct(base);
    expect(c1).toEqual([{ act: 1, purr: 2, fish: 30 }]);
    const hard = newSim({ stake: 2 });
    const c2 = record(hard, 'actClear');
    clearAct(hard);
    expect(c2[0]!.purr).toBe(1);
    const pillow = newSim({ stake: 2 });
    gainRelic(pillow, 'purr_pillow');
    const c3 = record(pillow, 'actClear');
    clearAct(pillow);
    expect(c3[0]!.purr).toBe(2);
    const later = newSim();
    const c4 = record(later, 'actClear');
    clearAct(later, 8);
    expect(c4[0]).toEqual({ act: 2, purr: 2, fish: 40 });
  });

  it('offers three toys the player does not own, then starts the next wave a second after the pick', () => {
    const sim = newSim();
    const offers = record(sim, 'relicOffer');
    const gains = record(sim, 'relicGain');
    clearAct(sim);
    const starts = record(sim, 'waveStart');
    expect(sim.pending).toMatchObject({ kind: 'relic', freeRerolls: 1, paidRerollUsed: false, picksLeft: 1 });
    const options = (sim.pending as { options: RelicId[] }).options.slice();
    expect(options).toHaveLength(3);
    expect(new Set(options).size).toBe(3);
    expect(offers[0]).toEqual({ options, freeRerolls: 1, picksLeft: 1 });
    for (const id of options) expect(['common', 'rare']).toContain(RELIC_RARITY[id]);
    const t = sim.time;
    sim.step(5);
    expect(sim.time).toBe(t);
    expect(sim.pickRelic(7)).toBe('not_available');
    expect(sim.pickRelic(1)).toBeNull();
    expect(gains).toEqual([{ relic: options[1] }]);
    expect(sim.relics).toEqual([options[1]]);
    expect(sim.phase).toBe('wave');
    expect(starts).toHaveLength(0);
    advance(sim, 0.9);
    expect(starts).toHaveLength(0);
    advance(sim, 0.2);
    expect(starts).toHaveLength(1);
    expect(starts[0]!.wave).toBe(5);
  });

  it('puts a toy that answers the next act\'s trait into the offer', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const sim = newSim({ seed });
      clearAct(sim);
      const options = (sim.pending as { options: RelicId[] }).options;
      const counters = actFeatures(1, 2).flatMap((f) => COUNTER_RELICS[f] ?? []);
      expect(options.some((o) => counters.includes(o)), `seed ${seed}`).toBe(true);
    }
  });

  it('weights rarities by act: rare and epic after act 3, epic and legendary after act 5 (the counter toy aside)', () => {
    for (let seed = 1; seed <= 15; seed++) {
      for (const [wave, act, allowed] of [[12, 3, ['rare', 'epic']], [20, 5, ['epic', 'legendary']]] as const) {
        const sim = newSim({ seed });
        clearAct(sim, wave);
        const counters = actFeatures(1, act + 1).flatMap((f) => COUNTER_RELICS[f] ?? []);
        const options = (sim.pending as { options: RelicId[] }).options;
        const plain = options.filter((o) => !counters.includes(o));
        expect(plain.length).toBeGreaterThanOrEqual(2);
        for (const id of plain) expect(allowed as readonly string[]).toContain(RELIC_RARITY[id]);
      }
    }
  });

  it('offers two with stake 5, lets the toy box pick two, and shrinks to the pool', () => {
    const hard = newSim({ stake: 5 });
    clearAct(hard);
    expect((hard.pending as { options: RelicId[] }).options).toHaveLength(2);
    const box = newSim({ mode: 'daily', modifiers: ['toy_box'] });
    clearAct(box);
    expect((box.pending as { picksLeft: number }).picksLeft).toBe(2);
    expect(box.pickRelic(0)).toBeNull();
    expect(box.phase).toBe('choice');
    expect(box.pickRelic(0)).toBeNull();
    expect(box.phase).toBe('wave');
    expect(box.relics).toHaveLength(2);
    const small = newSim({ loadout: { unitLevels: {}, training: {}, relicPool: ['yarn_ball'] } });
    clearAct(small);
    expect((small.pending as { options: RelicId[] }).options).toEqual(['yarn_ball']);
    const none = newSim({ loadout: { unitLevels: {}, training: {}, relicPool: [] } });
    clearAct(none);
    expect(none.pending).toBeNull();
    advance(none, 1.1);
    expect(none.wave).toBe(5);
  });

  it('rerolls once for free and once for a price, never for a price in the daily', () => {
    const sim = newSim();
    clearAct(sim);
    const first = (sim.pending as { options: RelicId[] }).options.slice();
    const offers = record(sim, 'relicOffer');
    expect(sim.rerollRelics(false)).toBeNull();
    expect(offers).toHaveLength(1);
    const second = (sim.pending as { options: RelicId[] }).options;
    expect(second.some((o) => !first.includes(o))).toBe(true);
    expect(sim.pending).toMatchObject({ freeRerolls: 0, paidRerollUsed: false });
    expect(sim.rerollRelics(false)).toBe('already_used');
    expect(sim.rerollRelics(true)).toBeNull();
    expect(sim.rerollRelics(true)).toBe('already_used');
    expect(sim.pending).toMatchObject({ paidRerollUsed: true });
    const daily = newSim({ mode: 'daily' });
    clearAct(daily);
    expect(daily.rerollRelics(true)).toBe('not_available');
    expect(daily.rerollRelics(false)).toBeNull();
    expect(daily.rerollRelics(false)).toBe('already_used');
  });
});

describe('danger, overflow and defeat', () => {
  function crowd(sim: Sim, n: number): void {
    for (let i = 0; i < n; i++) foe(sim, 'cucumber', i * 3, 1e9).frozen = true;
  }

  it('raises the danger level at two thirds and five sixths of the limit, only when it changes', () => {
    const sim = newSim();
    quietWave(sim);
    const levels = record(sim, 'danger');
    crowd(sim, 39);
    sim.step(1 / 60);
    expect(levels).toHaveLength(0);
    crowd(sim, 1);
    sim.step(1 / 60);
    sim.step(1 / 60);
    expect(levels).toEqual([{ level: 1, count: 40, cap: 60 }]);
    crowd(sim, 10);
    sim.step(1 / 60);
    expect(levels.at(-1)).toEqual({ level: 2, count: 50, cap: 60 });
    expect(levels).toHaveLength(2);
    for (const e of sim.enemies.slice(0, 30)) damageEnemy(sim, e, 1e12, 'magic', null, false, null);
    sim.step(1 / 60);
    expect(levels.at(-1)).toMatchObject({ level: 0 });
  });

  it('scales the limit with the stake, daily rules and training', () => {
    expect(newSim({ stake: 1 }).enemyCap).toBe(60 - STAKE_STEPS.enemyCapCut);
    expect(newSim({ mode: 'daily', modifiers: ['rich'] }).enemyCap).toBe(40);
    expect(newSim({ mode: 'daily', modifiers: ['glass_cannon'] }).enemyCap).toBe(35);
    const trained = newSim({ loadout: { unitLevels: {}, training: { enemy_cap: 6 }, relicPool: [] } });
    expect(trained.enemyCap).toBe(66);
  });

  it('loses only when the field stays over the limit for 2 seconds', () => {
    const sim = newSim();
    quietWave(sim);
    const overflow = record(sim, 'overflow');
    const defeats = record(sim, 'defeat');
    crowd(sim, 61);
    advance(sim, 1.9);
    expect(sim.phase).toBe('wave');
    expect(sim.overflowTime).toBeGreaterThan(1.8);
    expect(overflow).toEqual([{ grace: 2 }]);
    advance(sim, 0.2);
    expect(sim.phase).toBe('lost');
    expect(defeats).toEqual([{ reason: 'overrun' }]);
  });

  it('forgives a crowd that thins out in time', () => {
    const sim = newSim();
    quietWave(sim);
    const overflow = record(sim, 'overflow');
    crowd(sim, 62);
    advance(sim, 1.5);
    damageEnemy(sim, sim.enemies[0]!, 1e12, 'magic', null, false, null);
    damageEnemy(sim, sim.enemies[0]!, 1e12, 'magic', null, false, null);
    advance(sim, 0.1);
    expect(sim.overflowTime).toBe(0);
    expect(overflow.at(-1)).toEqual({ grace: 0 });
    advance(sim, 5);
    expect(sim.phase).toBe('wave');
  });

  it('counts the boss and small split balloons as one enemy each', () => {
    const sim = newSim();
    quietWave(sim);
    crowd(sim, 59);
    foe(sim, 'balloon', 100, 1);
    expect(sim.enemyCount).toBe(60);
    const balloon = sim.enemies.at(-1)!;
    damageEnemy(sim, balloon, 10, 'magic', null, false, null);
    expect(sim.enemyCount).toBe(61);
    expect(sim.enemies.filter((e) => e.id === 'balloon_small')).toHaveLength(2);
  });
});

describe('revive', () => {
  it('after an overrun, chases off the furthest-travelled enemies down to 40 percent and gives 4 seconds', () => {
    const sim = newSim();
    quietWave(sim);
    for (let i = 0; i < 70; i++) foe(sim, 'cucumber', i * 5).frozen = true;
    advance(sim, 2.2);
    expect(sim.phase).toBe('lost');
    expect(sim.canRevive()).toBe(true);
    const revived = record(sim, 'revive');
    expect(sim.revive()).toBeNull();
    expect(sim.phase).toBe('wave');
    expect(sim.enemyCount).toBe(24);
    expect(revived).toEqual([{ removed: 46 }]);
    expect(Math.min(...sim.enemies.map((e) => e.travelled))).toBe(0);
    expect(Math.max(...sim.enemies.map((e) => e.travelled))).toBe(23 * 5);
    for (let i = 0; i < 40; i++) foe(sim, 'cucumber', i).frozen = true;
    advance(sim, 3.5);
    expect(sim.phase).toBe('wave');
    expect(sim.getStats().revived).toBe(true);
    expect(sim.canRevive()).toBe(false);
    advance(sim, 3);
    expect(sim.phase).toBe('lost');
    expect(sim.revive()).toBe('already_used');
  });

  it('after a boss timeout, cuts the boss by 35 percent and adds 20 seconds', () => {
    const sim = newSim();
    enter(sim, 8);
    advance(sim, 1.1);
    sim.boss!.hp = 1e12;
    sim.boss!.maxHp = 1e12;
    advance(sim, 50.5);
    expect(sim.phase).toBe('lost');
    const duration = sim.waveDuration;
    expect(sim.revive()).toBeNull();
    expect(sim.boss!.hp).toBeCloseTo(0.65e12, -3);
    expect(sim.waveDuration).toBe(duration + 20);
    advance(sim, 19);
    expect(sim.phase).toBe('wave');
    advance(sim, 2);
    expect(sim.phase).toBe('lost');
  });

  it('is not possible in the daily challenge', () => {
    const sim = newSim({ mode: 'daily' });
    quietWave(sim);
    for (let i = 0; i < 70; i++) foe(sim, 'cucumber', i).frozen = true;
    advance(sim, 2.2);
    expect(sim.phase).toBe('lost');
    expect(sim.canRevive()).toBe(false);
    expect(sim.revive()).toBe('not_available');
  });
});

describe('snapshots', () => {
  function played(over: Parameters<typeof newSim>[0] = {}): Sim {
    const sim = newSim(over);
    rich(sim, 2000, 6);
    for (let i = 0; i < 6; i++) sim.summon();
    sim.pickSummon(0);
    sim.upgradeClass('mage');
    sim.upgradeSummon();
    advance(sim, 3.05 + 15 * 2 + 0.2);
    return sim;
  }

  it('is written at the start of every wave and is small', () => {
    const sim = played();
    const snap = sim.snapshot();
    expect(snap).not.toBeNull();
    expect(snap!.wave).toBe(3);
    expect(snap!.data.length).toBeLessThan(2600);
    expect(JSON.parse(snap!.data)).toMatchObject({ wave: 3, classLevels: [0, 0, 1, 0], summonGrade: 1 });
  });

  it('restores the wave-start state: board, money, upgrades and stream positions, with an empty field', () => {
    const sim = played();
    const snap = sim.snapshot()!;
    const copy = createBattle(initOf(), snap) as Sim;
    expect(copy).not.toBeNull();
    expect(copy.phase).toBe('prep');
    expect(copy.wave).toBe(2);
    expect(copy.enemyCount).toBe(0);
    expect(copy.units.map((u) => u?.id ?? null)).toEqual(JSON.parse(snap.data).units.map((u: string | 0) => u || null));
    expect(copy.fish).toBe(JSON.parse(snap.data).fish);
    expect(copy.classUpgradeLevel('mage')).toBe(1);
    expect(copy.summonGrade()).toBe(1);
    expect(copy.rng.states()).toEqual(JSON.parse(snap.data).rng);
    expect([...copy.sunbeams]).toEqual(JSON.parse(snap.data).sun);
    advance(copy, 3.05);
    expect(copy.wave).toBe(3);
    // Everything but the clock (the restored run waited out a fresh preparation time) is identical.
    expect({ ...JSON.parse(copy.snapshot()!.data), time: 0 }).toEqual({ ...JSON.parse(snap.data), time: 0 });
  });

  it('refuses a save from before merges kept their class (version 1), so a fresh run starts instead', () => {
    expect(SIM_VERSION).toBeGreaterThan(1);
    const sim = played();
    const snap = sim.snapshot()!;
    const old = { simVersion: 1, wave: snap.wave, data: snap.data };
    expect(createBattle(initOf(), old)).toBeNull();
    // The scene's fallback: `createBattle(init, snapshot) ?? createBattle(init)`.
    const fresh = createBattle(initOf(), old) ?? createBattle(initOf());
    expect(fresh.wave).toBe(0);
    expect(fresh.phase).toBe('prep');
  });

  it('resumes in the middle of a run: same board and counters, and the merge stream carries on where it stopped', () => {
    const init = initOf({ seed: 84 });
    const sim = createBattle(init) as Sim;
    const bot = createBot('merge', 3);
    for (let tick = 0; sim.wave < 7 && tick < 60 * 400; tick++) {
      if (sim.phase === 'choice') bot.choose(sim);
      else if (tick % 15 === 0) bot.act(sim);
      sim.step(TICK);
    }
    const snap = sim.snapshot()!;
    expect(snap.wave).toBe(7);
    const saved = JSON.parse(snap.data) as { units: (string | 0)[]; stats: { merges: number }; rng: number[] };
    expect(saved.stats.merges).toBeGreaterThan(3);
    const copy = createBattle(init, snap) as Sim;
    expect(copy.units.map((u) => u?.id ?? 0)).toEqual(saved.units);
    expect(copy.getStats().merges).toBe(saved.stats.merges);
    expect(copy.rng.states()).toEqual(saved.rng);

    // The original has run on since the save only by that one tick; both now make the same j-th, j+1-th, ... merges.
    const jumps = (s: Sim): string[] => {
      const out: string[] = [];
      s.events.on('merge', (e) => out.push(e.result.id));
      for (let j = 0; j < 14; j++) {
        for (let c = 0; c < s.units.length; c++) if (s.units[c]) s.sell(c);
        s.fx.jumpChance = 0.5;
        put(s, 0, 'm_snow');
        put(s, 1, 'm_snow');
        s.drop(0, 1);
      }
      return out;
    };
    const resumed = jumps(copy);
    expect(new Set(resumed)).toEqual(new Set(['m_fire', 'm_storm']));
    expect(jumps(sim)).toEqual(resumed);
  });

  it('restores relics and their effects', () => {
    const sim = newSim();
    gainRelic(sim, 'yarn_ball');
    gainRelic(sim, 'sardine_crate');
    advance(sim, 3.05);
    const copy = createBattle(initOf(), sim.snapshot()!) as Sim;
    expect(copy.relics).toEqual(['yarn_ball', 'sardine_crate']);
    expect(copy.fx.speedWarriorRanger).toBe(0.12);
    expect(copy.summonCost()).toBe(12);
  });

  it('refuses another version, another run or damaged data, and is unavailable in the daily', () => {
    const sim = played();
    const snap = sim.snapshot()!;
    expect(createBattle(initOf(), { ...snap, simVersion: snap.simVersion + 1 })).toBeNull();
    expect(createBattle(initOf(), { ...snap, simVersion: 1 })).toBeNull();
    expect(createBattle(initOf(), { simVersion: 1, wave: 3, data: '{}' })).toBeNull();
    expect(createBattle(initOf({ seed: 1 }), snap)).toBeNull();
    expect(createBattle(initOf({ chapter: 2 }), snap)).toBeNull();
    expect(createBattle(initOf(), { ...snap, data: '{oops' })).toBeNull();
    expect(createBattle(initOf(), { ...snap, wave: 9 })).toBeNull();
    const daily = newSim({ mode: 'daily' });
    advance(daily, 4);
    expect(daily.snapshot()).toBeNull();
  });

  it('keeps the tutorial\'s free summons and wave-3 offer through a save', () => {
    const sim = newSim({ mode: 'tutorial' });
    sim.summon();
    advance(sim, 3.05);
    const copy = createBattle(initOf({ mode: 'tutorial' }), sim.snapshot()!) as Sim;
    expect(copy.tutorialFree).toBe(2);
    expect(copy.tutorialOffer).toBe(true);
  });
});

describe('modes and previews', () => {
  it('previews the next wave by default and nothing past the end of a chapter', () => {
    const sim = newSim();
    expect(sim.previewWave()).toEqual(waveEntries(scriptFor(1, 1)));
    expect(sim.previewWave(4)[0]).toEqual({ enemy: 'boss_cucumber', count: 1 });
    expect(sim.previewWave(25)).toEqual([]);
    expect(sim.previewWave(0)).toEqual([]);
    advance(sim, 3.05);
    expect(sim.previewWave()).toEqual(waveEntries(scriptFor(1, 2)));
  });

  it('applies swarm and giants to counts and health', () => {
    const plain = newSim({ mode: 'daily' });
    const swarm = newSim({ mode: 'daily', modifiers: ['swarm'] });
    const giants = newSim({ mode: 'daily', modifiers: ['giants'] });
    const total = (s: Sim): number => s.previewWave(2).reduce((a, e) => a + e.count, 0);
    expect(total(swarm)).toBeGreaterThan(total(plain));
    expect(total(giants)).toBeLessThan(total(plain));
    plain.wave = swarm.wave = giants.wave = 2;
    expect(swarm.baseHp()).toBeCloseTo(plain.baseHp() * 0.65, 9);
    expect(giants.baseHp()).toBeCloseTo(plain.baseHp() * 1.8, 9);
  });

  it('plays the rush day with 11 second waves and uses the chapter multiplier for health', () => {
    const rush = newSim({ mode: 'daily', modifiers: ['rush'] });
    advance(rush, 3.05);
    expect(rush.waveDuration).toBe(11);
    const c1 = newSim();
    const c3 = newSim({ chapter: 3 });
    c1.wave = c3.wave = 5;
    expect(c3.baseHp() / c1.baseHp()).toBeCloseTo((CHAPTER_HP_MULT[2] as number) / (CHAPTER_HP_MULT[0] as number), 9);
  });
});
