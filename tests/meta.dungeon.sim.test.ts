/** The gold dungeon's battle side: its script, the simulation hooks it needs, and that nothing else moved. */
import { describe, expect, it } from 'vitest';
import { ENEMY_IDS } from '@/game/api';
import { CHAPTER_COUNT, CLEAR_DELAY, NORMAL_WAVE_TIME, hpIndex } from '@/game/data/balance';
import { BOSS_SPECS, enemySpec, isWaveTarget } from '@/game/data/enemies';
import { GOLD_DUNGEON_BOSS_HP, GOLD_DUNGEON_BOSS_LIMIT, GOLD_DUNGEON_WAVES, goldDungeonScript, goldDungeonSpawns } from '@/game/data/goldDungeon';
import { chapterWaves, scriptFor, waveEntries } from '@/game/data/waves';
import { createBattle } from '@/game/sim/create';
import { damageEnemy } from '@/game/sim/enemies';
import { playRun } from '@/game/sim/runner';
import type { Sim } from '@/game/sim/sim';
import { advance, initOf, newSim, record, slay } from './simHelpers';

/** A gold run whose waves spawn nothing, so the wave clock, the stages and the chest can be watched on their own. */
function emptyRun(chapter = 2): Sim {
  const sim = newSim({ mode: 'gold', chapter });
  sim.events.on('waveStart', () => {
    sim.spawnIds.length = 0;
    sim.spawnTimes.length = 0;
    sim.spawnIdx = 0;
  });
  return sim;
}

/** An empty gold run played up to the moment the chest has walked in (wave 8, one second after it began). */
function chestRun(chapter = 1): Sim {
  const sim = emptyRun(chapter);
  advance(sim, 3.05 + 15 * 4 + CLEAR_DELAY + 0.1);
  sim.pickRelic(0);
  advance(sim, 1.0 + 15 * 3 + 1.05);
  return sim;
}

describe('the dungeon script', () => {
  it('is seven waves of coins and a last wave that the chest ends, each coin wave richer than the one before', () => {
    expect(GOLD_DUNGEON_WAVES).toBe(8);
    let before = 0;
    for (let w = 1; w <= GOLD_DUNGEON_WAVES; w++) {
      const s = goldDungeonScript(w);
      expect(s.wave).toBe(w);
      expect(s.act).toBe(Math.ceil(w / 4));
      expect(s.budget).toBeGreaterThan(0);
      // The only ordinary enemy in the whole script is the coin.
      expect(s.groups.map((g) => g.enemy)).toEqual(['coin']);
      if (w < GOLD_DUNGEON_WAVES) {
        expect(s).toMatchObject({ kind: 'normal', boss: null });
        expect(s.budget).toBeGreaterThan(before);
        before = s.budget;
      } else {
        expect(s).toMatchObject({ kind: 'boss', boss: 'boss_treasure' });
      }
    }
    // The chest is the only boss, it is a wave target like any other (so the wave ends when it falls), and it comes on the last wave only.
    expect(isWaveTarget('boss_treasure')).toBe(true);
    expect(isWaveTarget('coin')).toBe(false);
    expect(waveEntries(goldDungeonScript(GOLD_DUNGEON_WAVES))[0]).toEqual({ enemy: 'boss_treasure', count: 1 });
  });

  it('clamps a wave outside the run to its first or last', () => {
    expect(goldDungeonScript(0).wave).toBe(1);
    expect(goldDungeonScript(99).wave).toBe(GOLD_DUNGEON_WAVES);
    expect(goldDungeonScript(99).boss).toBe('boss_treasure');
  });

  it('spawns as many enemies as the payout table assumes (the chest and the coins it spills included), about a third of the old 399', () => {
    let total = 0;
    for (let w = 1; w <= GOLD_DUNGEON_WAVES; w++) {
      for (const e of waveEntries(goldDungeonScript(w))) total += e.count * (1 + (enemySpec(e.enemy).split?.count ?? 0));
    }
    const spill = BOSS_SPECS.spill;
    expect(goldDungeonSpawns()).toBe(total + spill.at.length * spill.count);
    expect(goldDungeonSpawns()).toBeGreaterThanOrEqual(120);
    expect(goldDungeonSpawns()).toBeLessThanOrEqual(140);
    expect(goldDungeonSpawns()).toBe(131);
  });

  it('keeps the coin and the chest out of every chapter, the daily challenge and endless mode', () => {
    for (let chapter = 1; chapter <= CHAPTER_COUNT; chapter++) {
      for (const s of chapterWaves(chapter)) {
        expect(s.boss === 'coin' || s.boss === 'boss_treasure', `chapter ${chapter} wave ${s.wave}`).toBe(false);
        expect(s.groups.some((g) => g.enemy === 'coin' || g.enemy === 'boss_treasure'), `chapter ${chapter} wave ${s.wave}`).toBe(false);
      }
    }
    for (const mode of ['chapter', 'daily', 'endless', 'tutorial'] as const) {
      const sim = newSim({ mode, chapter: 3 });
      for (let wave = 1; wave <= 60; wave++) {
        const ids = [sim.scriptOf(wave).boss, ...sim.scriptOf(wave).groups.map((g) => g.enemy)];
        expect(ids.includes('coin') || ids.includes('boss_treasure'), `${mode} wave ${wave}`).toBe(false);
      }
    }
    // The only enemy that spills them is the chest itself.
    expect(ENEMY_IDS.filter((id) => enemySpec(id).ability === 'spill')).toEqual(['boss_treasure']);
    expect(BOSS_SPECS.spill.spawn).toBe('coin');
  });
});

describe('the gold mode in the simulation', () => {
  it('plays its own script for eight waves: seven coin waves, then the chest\'s', () => {
    const sim = newSim({ mode: 'gold', chapter: 3 });
    expect(sim.totalWaves).toBe(GOLD_DUNGEON_WAVES);
    expect(sim.previewWave(1)).toEqual(waveEntries(goldDungeonScript(1)));
    expect(sim.previewWave(8)).toEqual(waveEntries(goldDungeonScript(8)));
    expect(sim.previewWave(9)).toEqual([]);
    for (let w = 1; w < GOLD_DUNGEON_WAVES; w++) expect(sim.scriptOf(w).kind).toBe('normal');
    expect(sim.scriptOf(GOLD_DUNGEON_WAVES).kind).toBe('boss');
    // The chapter's own wave 4 is an elite; the dungeon's is a plain coin wave.
    expect(scriptFor(3, 4).kind).toBe('elite');
    expect(sim.scriptOf(4).kind).toBe('normal');
    expect(sim.waveHealth(4)).toBeGreaterThan(0);
    // The last wave's health is the chest's own (the tier's multiple on top) and its coins, not a chapter boss's table.
    const coins = waveEntries(goldDungeonScript(8)).filter((e) => e.enemy === 'coin').reduce((a, e) => a + e.count, 0);
    expect(sim.waveHealth(8)).toBeCloseTo(GOLD_DUNGEON_BOSS_HP * sim.hpChapterMult + coins * enemySpec('coin').hpMult * hpIndex(8) * sim.hpMult, 6);
  });

  it('leaves every other mode on the chapter script', () => {
    for (const mode of ['chapter', 'daily', 'endless'] as const) {
      const sim = newSim({ mode, chapter: 2 });
      expect(sim.scriptOf(4)).toEqual(scriptFor(2, 4));
      expect(sim.scriptOf(8).kind).toBe('boss');
      expect(sim.scriptOf(8).boss).toBe('boss_blender');
    }
  });

  it('takes the tier as the chapter: its health multiplier and nothing else of the chapter\'s rules', () => {
    const one = newSim({ mode: 'gold', chapter: 1 });
    const five = newSim({ mode: 'gold', chapter: 5 });
    expect(five.baseHp()).toBeGreaterThan(one.baseHp());
    expect(one.stake).toBe(0);
  });

  it('ends a coin wave on the 15 s wave clock', () => {
    const sim = emptyRun();
    const starts = record(sim, 'waveStart');
    advance(sim, 3.05 + 15 * 3 + 0.5);
    expect(starts.map((s) => s.wave)).toEqual([1, 2, 3, 4]);
    expect(starts.every((s) => s.kind === 'normal' && s.duration === NORMAL_WAVE_TIME)).toBe(true);
    expect(sim.boss).toBeNull();
  });

  it('lets the player call a coin wave early, except the one that closes the first stage (its clock brings the stage reward and the toy pick)', () => {
    const sim = emptyRun();
    const acts = record(sim, 'actClear');
    const offers = record(sim, 'relicOffer');
    const starts = record(sim, 'waveStart');
    advance(sim, 3.05 + 0.5);
    // Waves 1 to 3: nothing left to spawn, so calling the next one is open and pays a bonus.
    for (let w = 1; w <= 3; w++) {
      expect(sim.wave).toBe(w);
      expect(sim.callBonus()).toBeGreaterThanOrEqual(0);
      expect(sim.callNextWave()).toBeNull();
      advance(sim, 0.5);
    }
    // Wave 4 ends the stage: it cannot be called, and the call is refused rather than skipping the reward.
    expect(sim.wave).toBe(4);
    expect(sim.callBonus()).toBe(-1);
    expect(sim.callNextWave()).toBe('not_available');
    expect(sim.wave).toBe(4);
    expect(acts).toHaveLength(0);
    // Left to its clock, it gives the stage reward and the pick, as before.
    advance(sim, 15 + CLEAR_DELAY + 0.1);
    expect(acts.map((a) => a.act)).toEqual([1]);
    expect(offers).toHaveLength(1);
    expect(sim.phase).toBe('choice');
    expect(sim.pickRelic(0)).toBeNull();
    // Wave 5 to 7 are open again; the chest's wave 8 never was.
    advance(sim, 1.0 + 0.5);
    expect(sim.wave).toBe(5);
    expect(sim.callBonus()).toBeGreaterThanOrEqual(0);
    expect(starts.map((s) => s.wave)).toEqual([1, 2, 3, 4, 5]);
  });

  it('closes the first stage on the clock with the reward and a toy offer, and the second with the chest: it ends the wave and wins the run', () => {
    const sim = emptyRun();
    const acts = record(sim, 'actClear');
    const offers = record(sim, 'relicOffer');
    const ends = record(sim, 'waveEnd');
    const wins = record(sim, 'victory');
    const starts = record(sim, 'waveStart');
    advance(sim, 3.05 + 15 * 4 + CLEAR_DELAY + 0.1);
    expect(sim.phase).toBe('choice');
    expect(sim.pending?.kind).toBe('relic');
    expect(acts.map((a) => a.act)).toEqual([1]);
    expect(offers).toHaveLength(1);
    expect(sim.pickRelic(0)).toBeNull();
    expect(sim.phase).toBe('wave');
    // Waves 5 to 7 end on the clock too; wave 8 is the chest's and does NOT end on its clock.
    advance(sim, 1.0 + 15 * 3 + 1.05);
    expect(starts.map((s) => s.wave)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(starts[7]).toMatchObject({ kind: 'boss', duration: GOLD_DUNGEON_BOSS_LIMIT });
    expect(sim.waveKind).toBe('boss');
    expect(sim.boss?.id).toBe('boss_treasure');
    expect(ends.map((e) => e.wave)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    advance(sim, 20);
    expect(sim.phase).toBe('wave');
    expect(sim.boss).not.toBeNull();
    slay(sim);
    expect(ends.map((e) => e.wave)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    advance(sim, CLEAR_DELAY + 0.1);
    expect(sim.phase).toBe('won');
    expect(wins).toHaveLength(1);
    expect(acts).toHaveLength(1);
    expect(sim.getStats()).toMatchObject({ mode: 'gold', victory: true, wavesCleared: 8, totalWaves: 8, bossesKilled: 1 });
  });

  it('brings the chest in one second into the last wave, with the dungeon\'s health and limit, the coins of its escort coming with it', () => {
    for (const chapter of [1, 5]) {
      const sim = newSim({ mode: 'gold', chapter });
      sim.events.on('waveStart', (e) => {
        if (e.wave < GOLD_DUNGEON_WAVES) {
          sim.spawnIds.length = 0;
          sim.spawnTimes.length = 0;
          sim.spawnIdx = 0;
        }
      });
      advance(sim, 3.05 + 15 * 4 + CLEAR_DELAY + 0.1);
      sim.pickRelic(0);
      advance(sim, 1.0 + 15 * 3 + 1.05);
      const chest = sim.boss;
      expect(chest?.id).toBe('boss_treasure');
      expect(chest?.maxHp).toBeCloseTo(GOLD_DUNGEON_BOSS_HP * sim.hpChapterMult, 6);
      expect(sim.waveDuration).toBe(GOLD_DUNGEON_BOSS_LIMIT);
      expect(chest?.capRate).toBeCloseTo(((GOLD_DUNGEON_BOSS_HP * sim.hpChapterMult) / (0.45 * GOLD_DUNGEON_BOSS_LIMIT)), 6);
      // The escort is coins and only coins, and it comes within the escort window.
      advance(sim, 10);
      const ids = sim.enemies.filter((e) => !e.target).map((e) => e.id);
      expect(ids.length).toBeGreaterThan(0);
      expect(ids.every((id) => id === 'coin')).toBe(true);
    }
  });

  it('lets the chest spill three coins each time its health falls to three quarters, a half and a quarter, and never rage', () => {
    const sim = chestRun();
    const chest = sim.boss!;
    const abilities = record(sim, 'bossAbility');
    const spawns = record(sim, 'enemySpawn');
    const rages = record(sim, 'enrage');
    const coins = (): number => spawns.filter((s) => s.enemy.id === 'coin').length;
    expect(chest.spec.calm).toBe(true);
    advance(sim, 0.5);
    expect(abilities).toHaveLength(0);
    chest.hp = chest.maxHp * 0.76;
    advance(sim, 0.1);
    expect(abilities).toHaveLength(0);
    chest.hp = chest.maxHp * 0.74;
    advance(sim, 0.1);
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({ ability: 'spill', duration: 0 });
    expect(coins()).toBe(3);
    // The same quarter does not spill twice, and the next share is a spill of its own.
    advance(sim, 1);
    expect(coins()).toBe(3);
    chest.hp = chest.maxHp * 0.49;
    advance(sim, 0.1);
    expect(coins()).toBe(6);
    chest.hp = chest.maxHp * 0.24;
    advance(sim, 0.1);
    expect(coins()).toBe(9);
    expect(abilities).toHaveLength(3);
    chest.hp = chest.maxHp * 0.05;
    advance(sim, 1);
    expect(coins()).toBe(9);
    // Half health or less: a chapter boss rages there, the chest does not (no event, no flag, no faster cooldown or walk). The rage check
    // lives in damageEnemy and nowhere else, so the chest has to take real hits; setting hp alone above would never reach it.
    chest.capTokens = Infinity;
    expect(damageEnemy(sim, chest, chest.maxHp * 0.01, 'magic', null, false, null)).toBe(false);
    expect(chest.hp).toBeGreaterThan(0);
    expect(chest.hp).toBeLessThan(chest.maxHp * 0.5);
    expect(rages).toHaveLength(0);
    expect(chest.enraged).toBe(false);
  });

  it('takes one big hit from full health without raging either (the control for a chapter boss is in sim.enemies.test.ts)', () => {
    const sim = chestRun();
    const chest = sim.boss!;
    const rages = record(sim, 'enrage');
    chest.capTokens = Infinity;
    expect(damageEnemy(sim, chest, chest.maxHp * 0.6, 'magic', null, false, null)).toBe(false);
    expect(chest.hp).toBeLessThan(chest.maxHp * 0.5);
    expect(chest.enraged).toBe(false);
    expect(rages).toHaveLength(0);
  });

  it('jumps over shares at once when a hit takes the chest down by more than one (every spill still comes, once)', () => {
    const sim = chestRun();
    const chest = sim.boss!;
    const spawns = record(sim, 'enemySpawn');
    chest.hp = chest.maxHp * 0.2;
    advance(sim, 0.1);
    expect(spawns.filter((s) => s.enemy.id === 'coin')).toHaveLength(9);
    advance(sim, 1);
    expect(spawns.filter((s) => s.enemy.id === 'coin')).toHaveLength(9);
  });

  it('walks the chest slowly and keeps a chapter boss unchanged', () => {
    expect(enemySpec('boss_treasure').speed).toBeLessThan(enemySpec('boss_vacuum').speed);
    expect(enemySpec('boss_treasure').speed).toBeLessThan(enemySpec('cucumber').speed);
    expect(enemySpec('coin').speed).toBeGreaterThan(enemySpec('cucumber').speed);
    expect(enemySpec('coin').speed).toBeLessThan(enemySpec('drop').speed);
    expect(enemySpec('coin').hpMult).toBeLessThan(enemySpec('cucumber').hpMult);
  });

  it('writes a wave-start save and picks the run up at the right wave of its own script', () => {
    const init = initOf({ mode: 'gold', chapter: 2, seed: 4242 });
    const sim = createBattle(init) as Sim;
    sim.events.on('waveStart', () => {
      sim.spawnIds.length = 0;
      sim.spawnTimes.length = 0;
      sim.spawnIdx = 0;
    });
    advance(sim, 3.05 + 15 * 4 + CLEAR_DELAY + 0.1);
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

  it('resumes a run saved under the old eight-wave script with the new one, from the wave it was saved at, and the chest still ends it', () => {
    // A save made by the old script (all normal waves, up to 399 kills) holds only the board, the currencies and the counters of the wave start:
    // nothing of the script. It is picked up at its wave of the new script; a save at the old last wave lands on the chest's wave.
    const init = initOf({ mode: 'gold', chapter: 1, seed: 77 });
    const sim = createBattle(init) as Sim;
    sim.events.on('waveStart', () => {
      if (sim.wave < GOLD_DUNGEON_WAVES) {
        sim.spawnIds.length = 0;
        sim.spawnTimes.length = 0;
        sim.spawnIdx = 0;
      }
    });
    advance(sim, 3.05 + 15 * 4 + CLEAR_DELAY + 0.1);
    sim.pickRelic(0);
    advance(sim, 1.0 + 15 * 2 + 0.1);
    expect(sim.wave).toBe(7);
    const snap = sim.snapshot()!;
    const old = JSON.parse(snap.data) as { stats: { kills: number } };
    old.stats.kills = 380;
    const resumed = createBattle(init, { ...snap, data: JSON.stringify(old) }) as Sim;
    expect(resumed.getStats().kills).toBe(380);
    expect(resumed.wave).toBe(snap.wave - 1);
    expect(resumed.previewWave()).toEqual(waveEntries(goldDungeonScript(snap.wave)));
    // The last wave of the old script is the chest's wave of the new one.
    const lastSnap = { ...snap, wave: GOLD_DUNGEON_WAVES, data: JSON.stringify({ ...old, wave: GOLD_DUNGEON_WAVES }) };
    const last = createBattle(init, lastSnap) as Sim;
    expect(last.wave).toBe(GOLD_DUNGEON_WAVES - 1);
    expect(last.previewWave()[0]).toEqual({ enemy: 'boss_treasure', count: 1 });
  });
});

describe('a bot in the dungeon', () => {
  it('plays the run through to its end by the dungeon rules: the chest ends a won run, and no more kills than the script spawns', () => {
    for (const seed of [11, 12, 13]) {
      const r = playRun(initOf({ mode: 'gold', chapter: 2, seed }, 3), 'synergy', { botSeed: seed });
      expect(r.stats).toMatchObject({ mode: 'gold', chapter: 2, totalWaves: GOLD_DUNGEON_WAVES });
      expect(r.stats.kills).toBeLessThanOrEqual(goldDungeonSpawns());
      expect(r.stats.wavesCleared).toBeLessThanOrEqual(GOLD_DUNGEON_WAVES);
      // Seven coin waves of 15 s, the preparation, the two clear delays and the chest's whole limit at the very most.
      expect(r.time).toBeLessThan(3 + (GOLD_DUNGEON_WAVES - 1) * NORMAL_WAVE_TIME + 2 * CLEAR_DELAY + 5 + GOLD_DUNGEON_BOSS_LIMIT);
      if (r.victory) {
        expect(r.stats.wavesCleared).toBe(GOLD_DUNGEON_WAVES);
        expect(r.stats.bossesKilled).toBe(1);
        expect(r.lossReason).toBeNull();
      } else {
        expect(['overrun', 'boss_timeout']).toContain(r.lossReason);
      }
    }
  });

  it('wins the first and the last tier at their recommended unit level in all but a rare run, with the synergy bot (the dungeon is a pay day, not a test)', () => {
    // Not a balance gate (the report is: tests/simreport.dungeon.sim.ts): a guard that the dungeon stays beatable.
    for (const [chapter, level] of [[1, 1], [5, 6]] as const) {
      let wins = 0;
      const seeds = Array.from({ length: 12 }, (_, i) => 100 + i * 31);
      for (const seed of seeds) wins += playRun(initOf({ mode: 'gold', chapter, seed }, level), 'synergy', { botSeed: seed }).victory ? 1 : 0;
      expect(wins, `tier ${chapter}`).toBeGreaterThanOrEqual(11);
    }
  });
});
