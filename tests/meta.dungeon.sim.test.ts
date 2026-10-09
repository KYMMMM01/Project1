/** The gold dungeon's battle side: its script, the simulation hooks it needs, and that nothing else moved. */
import { describe, expect, it } from 'vitest';
import { NORMAL_WAVE_TIME } from '@/game/data/balance';
import { enemySpec, isWaveTarget } from '@/game/data/enemies';
import { GOLD_DUNGEON_WAVES, goldDungeonScript, goldDungeonSpawns } from '@/game/data/goldDungeon';
import { scriptFor, waveEntries } from '@/game/data/waves';
import { createBattle } from '@/game/sim/create';
import { playRun } from '@/game/sim/runner';
import type { Sim } from '@/game/sim/sim';
import { advance, initOf, newSim, record } from './simHelpers';

/** A gold run whose waves spawn nothing, so the wave clock and the acts can be watched on their own. */
function emptyRun(chapter = 2): Sim {
  const sim = newSim({ mode: 'gold', chapter });
  sim.events.on('waveStart', () => {
    sim.spawnIds.length = 0;
    sim.spawnTimes.length = 0;
    sim.spawnIdx = 0;
  });
  return sim;
}

describe('the dungeon script', () => {
  it('is eight normal waves with no elite or boss anywhere, each richer than the one before', () => {
    expect(GOLD_DUNGEON_WAVES).toBe(8);
    let before = 0;
    for (let w = 1; w <= GOLD_DUNGEON_WAVES; w++) {
      const s = goldDungeonScript(w);
      expect(s).toMatchObject({ wave: w, kind: 'normal', boss: null });
      expect(s.act).toBe(Math.ceil(w / 4));
      expect(s.budget).toBeGreaterThan(before);
      before = s.budget;
      for (const g of s.groups) {
        expect(isWaveTarget(g.enemy)).toBe(false);
        expect(enemySpec(g.enemy).traits).not.toContain('elite');
        expect(enemySpec(g.enemy).traits).not.toContain('boss');
      }
      // At most one armoured or one warded kind in a wave, so a board of any class has a counter in reach. "Armoured" and "warded" are the
      // traits (the roomba, the tangerine): since 2026-10-10 every ordinary enemy has 5 to 10% armour, which is not a kind of its own.
      const kinds = s.groups.map((g) => enemySpec(g.enemy)).filter((e) => e.traits.includes('armored') || e.traits.includes('warded'));
      expect(kinds.length).toBeLessThanOrEqual(1);
    }
  });

  it('clamps a wave outside the run to its first or last', () => {
    expect(goldDungeonScript(0).wave).toBe(1);
    expect(goldDungeonScript(99).wave).toBe(GOLD_DUNGEON_WAVES);
  });

  it('spawns as many enemies as the payout table assumes (the splitters\' pieces included)', () => {
    let total = 0;
    for (let w = 1; w <= GOLD_DUNGEON_WAVES; w++) {
      for (const e of waveEntries(goldDungeonScript(w))) total += e.count * (1 + (enemySpec(e.enemy).split?.count ?? 0));
    }
    expect(goldDungeonSpawns()).toBe(total);
    expect(total).toBeGreaterThan(300);
  });
});

describe('the gold mode in the simulation', () => {
  it('plays its own script for eight waves, and every wave is a normal one', () => {
    const sim = newSim({ mode: 'gold', chapter: 3 });
    expect(sim.totalWaves).toBe(GOLD_DUNGEON_WAVES);
    expect(sim.previewWave(1)).toEqual(waveEntries(goldDungeonScript(1)));
    expect(sim.previewWave(8)).toEqual(waveEntries(goldDungeonScript(8)));
    expect(sim.previewWave(9)).toEqual([]);
    for (let w = 1; w <= GOLD_DUNGEON_WAVES; w++) expect(sim.scriptOf(w).kind).toBe('normal');
    // The chapter's own wave 4 is an elite; the dungeon's is not.
    expect(scriptFor(3, 4).kind).toBe('elite');
    expect(sim.waveHealth(4)).toBeGreaterThan(0);
  });

  it('leaves every other mode on the chapter script', () => {
    for (const mode of ['chapter', 'daily', 'endless'] as const) {
      const sim = newSim({ mode, chapter: 2 });
      expect(sim.scriptOf(4)).toEqual(scriptFor(2, 4));
      expect(sim.scriptOf(8).kind).toBe('boss');
    }
  });

  it('takes the tier as the chapter: its health multiplier and nothing else of the chapter\'s rules', () => {
    const one = newSim({ mode: 'gold', chapter: 1 });
    const five = newSim({ mode: 'gold', chapter: 5 });
    expect(five.baseHp()).toBeGreaterThan(one.baseHp());
    expect(one.stake).toBe(0);
  });

  it('ends a wave on the 15 s wave clock, with no boss timer', () => {
    const sim = emptyRun();
    const starts = record(sim, 'waveStart');
    advance(sim, 3.05 + 15 * 3 + 0.5);
    expect(starts.map((s) => s.wave)).toEqual([1, 2, 3, 4]);
    expect(starts.every((s) => s.kind === 'normal' && s.duration === NORMAL_WAVE_TIME)).toBe(true);
    expect(sim.boss).toBeNull();
  });

  it('closes the first act on the clock with the act reward and a toy offer, and the second act with the victory', () => {
    const sim = emptyRun();
    const acts = record(sim, 'actClear');
    const offers = record(sim, 'relicOffer');
    const ends = record(sim, 'waveEnd');
    const wins = record(sim, 'victory');
    advance(sim, 3.05 + 15 * 4 + 1.2 + 0.1);
    expect(sim.phase).toBe('choice');
    expect(sim.pending?.kind).toBe('relic');
    expect(acts.map((a) => a.act)).toEqual([1]);
    expect(offers).toHaveLength(1);
    expect(sim.pickRelic(0)).toBeNull();
    expect(sim.phase).toBe('wave');
    advance(sim, 1.0 + 15 * 4 + 1.2 + 0.1);
    expect(sim.phase).toBe('won');
    expect(wins).toHaveLength(1);
    expect(acts).toHaveLength(1);
    expect(ends.map((e) => e.wave)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const s = sim.getStats();
    expect(s).toMatchObject({ mode: 'gold', victory: true, wavesCleared: 8, totalWaves: 8, bossesKilled: 0 });
    // Eight waves of 15 s plus the starts and the two clear delays: about two minutes.
    expect(sim.time).toBeGreaterThan(120);
    expect(sim.time).toBeLessThan(135);
  });

  it('writes a wave-start save and picks the run up at the right wave of its own script', () => {
    const init = initOf({ mode: 'gold', chapter: 2, seed: 4242 });
    const sim = createBattle(init) as Sim;
    sim.events.on('waveStart', () => {
      sim.spawnIds.length = 0;
      sim.spawnTimes.length = 0;
      sim.spawnIdx = 0;
    });
    advance(sim, 3.05 + 15 * 4 + 1.2 + 0.1);
    sim.pickRelic(0);
    advance(sim, 1.2);
    expect(sim.wave).toBe(5);
    const snap = sim.snapshot();
    expect(snap?.wave).toBe(5);
    const copy = createBattle(init, snap!) as Sim;
    expect(copy).not.toBeNull();
    expect(copy.totalWaves).toBe(GOLD_DUNGEON_WAVES);
    expect(copy.phase).toBe('prep');
    expect(copy.wave).toBe(4);
    expect(copy.waveKind).toBe('normal');
    expect(copy.previewWave()).toEqual(waveEntries(goldDungeonScript(5)));
    // A save of another mode never restores into this one.
    expect(createBattle(initOf({ mode: 'chapter', chapter: 2, seed: 4242 }), snap!)).toBeNull();
  });
});

describe('a bot in the dungeon', () => {
  it('plays the run through to its end by the dungeon rules: no boss, no boss timeout, no more kills than the script spawns', () => {
    for (const seed of [11, 12, 13]) {
      const r = playRun(initOf({ mode: 'gold', chapter: 2, seed }, 3), 'synergy', { botSeed: seed });
      expect(r.stats).toMatchObject({ mode: 'gold', chapter: 2, totalWaves: GOLD_DUNGEON_WAVES, bossesKilled: 0 });
      expect(r.stats.kills).toBeLessThanOrEqual(goldDungeonSpawns());
      expect(r.stats.wavesCleared).toBeLessThanOrEqual(GOLD_DUNGEON_WAVES);
      expect(r.lossReason).not.toBe('boss_timeout');
      expect(r.time).toBeLessThan(GOLD_DUNGEON_WAVES * NORMAL_WAVE_TIME + 20);
      if (r.victory) expect(r.stats.wavesCleared).toBe(GOLD_DUNGEON_WAVES);
    }
  });
});
