import { describe, expect, it } from 'vitest';
import { CLASS_IDS, type BattleApi } from '@/game/api';
import { AWAKEN_COST, TICK } from '@/game/data/balance';
import { unitClass, unitRarityIndex } from '@/game/data/roster';
import { createBot, type BotPolicy } from '@/game/sim/bots';
import { createBattle } from '@/game/sim/create';
import { initOf } from './simHelpers';

interface Played {
  battle: BattleApi;
  merges: number;
  /** Merges whose result left the class of the cats that made it. */
  classChanges: number;
  molts: number;
  /** The classes the molted cats ended up in. */
  moltClasses: Set<string>;
}

/** Plays `waves` waves of a battle with a bot, the way the balance runner does (a decision every quarter second). */
function play(policy: BotPolicy, seed: number, waves: number): Played {
  const battle = createBattle(initOf({ seed }));
  const bot = createBot(policy, seed + 7);
  const out: Played = { battle, merges: 0, classChanges: 0, molts: 0, moltClasses: new Set() };
  battle.events.on('merge', (e) => {
    out.merges++;
    if (unitClass(e.result.id) !== unitClass(e.consumed[0].id) || unitClass(e.consumed[0].id) !== unitClass(e.consumed[1].id)) out.classChanges++;
  });
  battle.events.on('molt', (e) => {
    out.molts++;
    out.moltClasses.add(unitClass(e.result.id));
  });
  for (let tick = 0; tick < 60 * 600 && battle.wave <= waves && battle.phase !== 'won' && battle.phase !== 'lost'; tick++) {
    if (battle.phase === 'choice') bot.choose(battle);
    else if (tick % 15 === 0) bot.act(battle);
    battle.step(TICK);
  }
  return out;
}

/** The most kinds of one class on the board: the synergy tier a class is working towards. */
function bestLine(b: BattleApi): number {
  return Math.max(...CLASS_IDS.map((c) => b.classDistinct(c)));
}

describe('balance bots under the fixed class lines', () => {
  const SEEDS = Array.from({ length: 24 }, (_, i) => 100 + i * 13);

  it('merge only inside a class, whoever merges', () => {
    for (const policy of ['merge', 'synergy'] as const) {
      let merges = 0;
      for (const seed of SEEDS.slice(0, 8)) {
        const r = play(policy, seed, 6);
        merges += r.merges;
        expect(r.classChanges).toBe(0);
      }
      expect(merges).toBeGreaterThan(20);
    }
  });

  it('keeps the random bot away from merging: it only summons', () => {
    const r = play('random', SEEDS[0] as number, 6);
    expect(r.merges).toBe(0);
  });

  it('lets the synergy bot build a class line on purpose: two counting kinds (synergy step 1) of one class by wave 9 in most runs (60%), more often than the merge bot', () => {
    const lines = (policy: BotPolicy): number[] => SEEDS.map((seed) => bestLine(play(policy, seed, 9).battle));
    const synergy = lines('synergy');
    const merge = lines('merge');
    const reached = (v: number[]): number => v.filter((n) => n >= 2).length;
    expect(reached(synergy)).toBeGreaterThanOrEqual(Math.ceil(SEEDS.length * 0.6));
    expect(reached(synergy)).toBeGreaterThan(reached(merge));
    expect(Math.max(...synergy)).toBeGreaterThanOrEqual(3);
  });

  it('keeps the purr of one awakening (10) when it molts a cat below the legendary rung, whatever the rank-based price', () => {
    let molted = 0;
    let awakened = 0;
    for (const seed of SEEDS) {
      const battle = createBattle(initOf({ seed }));
      const bot = createBot('synergy', seed + 7);
      battle.events.on('molt', (e) => {
        molted++;
        // The event comes after the purr was paid: below the legendary rung the awakening's purr must still be there.
        if (unitRarityIndex(e.result.id) < 3) expect(battle.purr, `seed ${seed}`).toBeGreaterThanOrEqual(AWAKEN_COST);
      });
      battle.events.on('awaken', () => {
        awakened++;
      });
      for (let tick = 0; tick < 60 * 400 && battle.wave <= 18 && battle.phase !== 'won' && battle.phase !== 'lost'; tick++) {
        if (battle.phase === 'choice') bot.choose(battle);
        else if (tick % 15 === 0) bot.act(battle);
        battle.step(TICK);
      }
    }
    expect(molted).toBeGreaterThan(0);
    // The cheaper awakening is reached: most of the runs hold a guardian by wave 18.
    expect(awakened).toBeGreaterThanOrEqual(Math.ceil(SEEDS.length * 0.5));
  });

  it('lets the synergy bot molt only into the one line it builds, and never below zero purr', () => {
    let molts = 0;
    for (const seed of SEEDS) {
      const r = play('synergy', seed, 14);
      molts += r.molts;
      expect(r.moltClasses.size).toBeLessThanOrEqual(1);
      expect(r.battle.purr).toBeGreaterThanOrEqual(0);
      expect(r.molts).toBeLessThanOrEqual(6);
    }
    expect(molts).toBeGreaterThan(0);
  });
});
