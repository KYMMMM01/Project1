import { describe, expect, it } from 'vitest';
import { CLASS_IDS, UNIT_IDS, type ClassId, type Fail, type UnitId } from '@/game/api';
import { CELL_COUNT } from '@/game/geometry';
import {
  AWAKEN_COST, CLASS_UPGRADE_COSTS, MOLT_LIMIT, SELL_FISH, SELL_PURR, SUMMON_BASE, SUMMON_CAP, SUMMON_GRADE_COSTS, SUMMON_STEP, TICK,
} from '@/game/data/balance';
import { UNIT_GRID, mergeResultOf, unitClass, unitRarityIndex } from '@/game/data/roster';
import { unitSpec } from '@/game/data/units';
import { gainRelic } from '@/game/sim/flow';
import { advance, newSim, put, quietWave, record, rich } from './simHelpers';

/** Position of the merge stream in `Streams.states()` (summon, pick, merge, toy, sun, wave, combat). */
const MERGE_STREAM = 2;

function freeCell(sim: ReturnType<typeof newSim>): number {
  return sim.units.findIndex((u) => u === null);
}

/** Summons and immediately sells so the board stays empty; returns the cost paid. */
function summonAndClear(sim: ReturnType<typeof newSim>): number {
  const before = sim.fish;
  expect(sim.summon()).toBeNull();
  if (sim.pending) sim.pickSummon(0);
  const paid = before - sim.fish;
  for (let c = 0; c < CELL_COUNT; c++) if (sim.units[c]) sim.sell(c);
  return paid;
}

describe('time and phases', () => {
  it('spends at most ten ticks per step call and drops the rest', () => {
    const sim = newSim();
    sim.step(5);
    expect(sim.time).toBeCloseTo(10 * TICK, 9);
  });

  it('accumulates small steps and never runs while a choice is pending', () => {
    const sim = newSim();
    for (let i = 0; i < 6; i++) sim.step(TICK / 3);
    expect(sim.time).toBeCloseTo(2 * TICK, 9);
    rich(sim);
    sim.paidSummons = 5;
    expect(sim.summon()).toBeNull();
    expect(sim.phase).toBe('choice');
    const t = sim.time;
    sim.step(1);
    expect(sim.time).toBe(t);
    expect(sim.pickSummon(0)).toBeNull();
    expect(sim.phase).toBe('prep');
  });

  it('prepares for 3 seconds, then starts wave 1', () => {
    const sim = newSim();
    const starts = record(sim, 'waveStart');
    advance(sim, 2.9);
    expect(sim.phase).toBe('prep');
    expect(sim.wave).toBe(0);
    advance(sim, 0.2);
    expect(sim.phase).toBe('wave');
    expect(starts).toEqual([{ wave: 1, act: 1, kind: 'normal', duration: 15 }]);
  });

  it('waits in prep until the first summon in the tutorial', () => {
    const sim = newSim({ mode: 'tutorial' });
    advance(sim, 10);
    expect(sim.phase).toBe('prep');
    expect(sim.summon()).toBeNull();
    advance(sim, 3.1);
    expect(sim.phase).toBe('wave');
    expect(sim.waveDuration).toBe(12);
    expect(sim.totalWaves).toBe(8);
  });

  it('stops for good after the run is lost and abandon() reports a defeat', () => {
    const sim = newSim();
    quietWave(sim);
    sim.abandon();
    expect(sim.phase).toBe('lost');
    const t = sim.time;
    sim.step(1);
    expect(sim.time).toBe(t);
    expect(sim.getStats().victory).toBe(false);
    expect(sim.canRevive()).toBe(false);
    expect(sim.revive()).toBe('not_available');
  });
});

describe('summoning', () => {
  it('costs 12 + 6n up to the cap, counting only paid summons', () => {
    const sim = newSim();
    rich(sim);
    const costs: number[] = [];
    for (let n = 0; n < 24; n++) {
      expect(sim.summonCost()).toBe(Math.min(SUMMON_CAP, SUMMON_BASE + SUMMON_STEP * n));
      costs.push(summonAndClear(sim));
    }
    expect(costs[0]).toBe(SUMMON_BASE);
    expect(costs[1]).toBe(SUMMON_BASE + SUMMON_STEP);
    expect(costs.at(-1)).toBe(SUMMON_CAP);
    expect(costs.findIndex((c) => c === SUMMON_CAP)).toBe(Math.ceil((SUMMON_CAP - SUMMON_BASE) / SUMMON_STEP));
  });

  it('applies the cardboard box, sardine crate, stake 3 and lucky day to the price', () => {
    const box = newSim();
    gainRelic(box, 'cardboard_box');
    box.paidSummons = 30;
    expect(box.summonCost()).toBe(Math.ceil(SUMMON_CAP * 0.9));
    const crate = newSim();
    gainRelic(crate, 'sardine_crate');
    crate.paidSummons = 30;
    expect(crate.summonCost()).toBe(SUMMON_CAP - 15);
    const stake = newSim({ stake: 3 });
    expect(stake.summonCost()).toBe(Math.ceil(SUMMON_BASE * 1.1));
    stake.paidSummons = 30;
    expect(stake.summonCost()).toBe(Math.ceil(SUMMON_CAP * 1.1));
    const lucky = newSim({ mode: 'daily', modifiers: ['lucky_day'] });
    expect(lucky.summonCost()).toBe(Math.ceil(SUMMON_BASE * 1.5));
  });

  it('refuses without charging when the board is full or the fish are short', () => {
    const sim = newSim();
    sim.fish = 5;
    expect(sim.summon()).toBe('not_enough_fish');
    expect(sim.fish).toBe(5);
    rich(sim);
    for (let c = 0; c < CELL_COUNT; c++) put(sim, c, 'w_paw');
    const fish = sim.fish;
    expect(sim.summon()).toBe('board_full');
    expect(sim.fish).toBe(fish);
  });

  it('gives a pick-one-of-three on every 6th paid summon, never common, all different', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const sim = newSim({ seed });
      rich(sim);
      for (let i = 0; i < 5; i++) summonAndClear(sim);
      expect(sim.summonOfferProgress()).toEqual({ count: 5, every: 6 });
      const offers = record(sim, 'summonOffer');
      const summonState = sim.rng.summon.state;
      const fish = sim.fish;
      expect(sim.summon()).toBeNull();
      expect(sim.phase).toBe('choice');
      expect(offers).toHaveLength(1);
      const options = (sim.pending as { options: UnitId[] }).options;
      expect(options).toHaveLength(3);
      expect(new Set(options).size).toBeGreaterThanOrEqual(2);
      for (const id of options) expect(unitRarityIndex(id)).toBeGreaterThanOrEqual(1);
      expect(fish - sim.fish).toBe(SUMMON_BASE + SUMMON_STEP * 5);
      expect(sim.rng.summon.state).toBe(summonState);
      const dry = sim.epicDry;
      expect(sim.pickSummon(9)).toBe('not_available');
      expect(sim.pickSummon(1)).toBeNull();
      expect(sim.epicDry).toBe(unitRarityIndex(options[1]!) >= 2 ? 0 : dry + 1);
      expect(sim.units.filter(Boolean)).toHaveLength(1);
      expect(sim.summonOfferProgress().count).toBe(0);
    }
  });

  it('keeps the three-pick out of the tutorial and makes the first three summons free and scripted', () => {
    const sim = newSim({ mode: 'tutorial' });
    expect(sim.summonOfferProgress()).toEqual({ count: 0, every: 0 });
    const fish = sim.fish;
    const placed = record(sim, 'summon');
    for (let i = 0; i < 3; i++) expect(sim.summon()).toBeNull();
    expect(placed.map((p) => p.unit.id)).toEqual(['w_paw', 'w_paw', 'r_archer']);
    expect(placed.every((p) => p.source === 'script')).toBe(true);
    expect(sim.fish).toBe(fish);
    expect(sim.summonCost()).toBe(12);
    expect(sim.paidSummons).toBe(0);
    for (let i = 0; i < 6; i++) {
      expect(sim.summon()).toBeNull();
      expect(sim.phase).not.toBe('choice');
      for (let c = 0; c < CELL_COUNT; c++) if (sim.units[c]) sim.sell(c);
    }
  });

  it('offers three epic cats once at the start of wave 3 of the tutorial', () => {
    const sim = newSim({ mode: 'tutorial' });
    const offers = record(sim, 'summonOffer');
    sim.summon();
    advance(sim, 3.1);
    advance(sim, 12 * 2 + 0.3);
    expect(sim.wave).toBe(3);
    expect(sim.phase).toBe('choice');
    const options = (sim.pending as { options: UnitId[] }).options;
    expect(options.every((id) => unitRarityIndex(id) === 2)).toBe(true);
    expect(sim.paidSummons).toBe(0);
    expect(sim.pickSummon(0)).toBeNull();
    advance(sim, 12 * 6);
    expect(offers).toHaveLength(1);
  });

  it('turns a first common into a rare with the pre-run snack, and only the first one', () => {
    let upgraded = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const plain = newSim({ seed });
      const snack = newSim({ seed, firstSummonRarePlus: true });
      plain.summon();
      snack.summon();
      const a = plain.units.find(Boolean)!;
      const b = snack.units.find(Boolean)!;
      expect(unitRarityIndex(b.id)).toBeGreaterThanOrEqual(1);
      if (unitRarityIndex(a.id) === 0) {
        upgraded++;
        expect(unitRarityIndex(b.id)).toBe(1);
      }
    }
    expect(upgraded).toBeGreaterThan(10);
    const sim = newSim({ seed: 3, firstSummonRarePlus: true });
    sim.summon();
    expect(sim.paidSummons).toBe(1);
  });

  it('twin bells sometimes bring a second copy of the same cat', () => {
    const sim = newSim();
    gainRelic(sim, 'twin_bells');
    sim.fx.twinChance = 1;
    const placed = record(sim, 'summon');
    expect(sim.summon()).toBeNull();
    expect(placed.map((p) => p.source)).toEqual(['button', 'twin']);
    expect(placed[0]!.unit.id).toBe(placed[1]!.unit.id);
    expect(sim.units.filter(Boolean)).toHaveLength(2);
  });

  it('reports the next summon\'s true odds, including grade and pity', () => {
    const sim = newSim();
    const row = (): Record<string, number> => Object.fromEntries(sim.summonOdds().map((r) => [r.key, r.p]));
    expect(sim.summonOdds().map((r) => r.key)).toEqual(['common', 'rare', 'epic', 'legendary']);
    expect(row()).toEqual({ common: 0.7, rare: 0.25, epic: 0.05, legendary: 0 });
    sim.epicDry = 11;
    expect(sim.pity().epicBonus).toBe(0);
    sim.epicDry = 12;
    expect(sim.pity()).toEqual({ epicDry: 12, epicDryLimit: 12, epicBonus: 0.03 });
    expect(row().epic).toBeCloseTo(0.08, 12);
    expect(row().common).toBeCloseTo(0.67, 12);
    sim.epicDry = 14;
    expect(row().epic).toBeCloseTo(0.05 + 0.09, 12);
    sim.epicDry = 100;
    expect(sim.pity().epicBonus).toBeCloseTo(0.35, 12);
    expect(row().epic).toBeCloseTo(0.4, 12);
    expect(row().common).toBeCloseTo(0.35, 12);
    expect(Object.values(row()).reduce((a, v) => a + v, 0)).toBeCloseTo(1, 12);
  });

  it('takes the pity bonus from rare when common runs out, and adds lucky day first', () => {
    const sim = newSim({ mode: 'daily', modifiers: ['lucky_day'] });
    const row = (): Record<string, number> => Object.fromEntries(sim.summonOdds().map((r) => [r.key, r.p]));
    expect(row().epic).toBeCloseTo(0.15, 12);
    expect(row().common).toBeCloseTo(0.6, 12);
    sim.epicDry = 100;
    sim.grade = 5;
    const r = row();
    expect(r.epic).toBeCloseTo(0.17 + 0.1 + 0.35, 12);
    expect(r.common).toBeCloseTo(0, 12);
    expect(r.rare).toBeCloseTo(0.35, 12);
    expect(r.legendary).toBeCloseTo(0.03, 12);
    expect(Object.values(r).reduce((a, v) => a + v, 0)).toBeCloseTo(1, 12);
  });

  it('counts epicDry only for paid summons and resets on epic or better', () => {
    const sim = newSim({ seed: 9 });
    rich(sim);
    const seen: number[] = [];
    for (let i = 0; i < 40; i++) {
      const before = sim.epicDry;
      const placed = record(sim, 'summon');
      if (sim.summonOfferProgress().count === 5) {
        summonAndClear(sim);
        continue;
      }
      sim.summon();
      const unit = placed[0]!.unit;
      seen.push(unitRarityIndex(unit.id));
      expect(sim.epicDry).toBe(unitRarityIndex(unit.id) >= 2 ? 0 : before + 1);
      for (let c = 0; c < CELL_COUNT; c++) if (sim.units[c]) sim.sell(c);
    }
    expect(seen.some((r) => r >= 2)).toBe(true);
  });

  it('raises the summon grade with the listed costs and then stops', () => {
    const sim = newSim();
    rich(sim);
    const upgrades = record(sim, 'upgrade');
    for (let g = 0; g < SUMMON_GRADE_COSTS.length; g++) {
      expect(sim.summonGradeCost()).toBe(SUMMON_GRADE_COSTS[g]);
      const fish = sim.fish;
      expect(sim.upgradeSummon()).toBeNull();
      expect(fish - sim.fish).toBe(SUMMON_GRADE_COSTS[g]);
      expect(sim.summonGrade()).toBe(g + 1);
    }
    expect(sim.summonGradeCost()).toBe(-1);
    expect(sim.upgradeSummon()).toBe('max_level');
    expect(upgrades.at(-1)).toEqual({ kind: 'summon', classId: null, level: 5 });
    const poor = newSim();
    poor.fish = 59;
    expect(poor.upgradeSummon()).toBe('not_enough_fish');
  });
});

describe('board commands', () => {
  it('classifies drops as move, swap, merge or none', () => {
    const sim = newSim();
    put(sim, 0, 'w_paw');
    put(sim, 1, 'w_paw');
    put(sim, 2, 'w_sword');
    put(sim, 3, 'w_samurai');
    put(sim, 4, 'w_samurai');
    put(sim, 5, 'w_tiger');
    put(sim, 6, 'w_tiger');
    expect(sim.dropAction(0, 0)).toBe('none');
    expect(sim.dropAction(0, 19)).toBe('move');
    expect(sim.dropAction(0, 1)).toBe('merge');
    expect(sim.dropAction(0, 2)).toBe('swap');
    expect(sim.dropAction(3, 4)).toBe('swap');
    expect(sim.dropAction(5, 6)).toBe('swap');
    expect(sim.dropAction(7, 8)).toBe('none');
    expect(sim.dropAction(-1, 3)).toBe('none');
    expect(sim.dropAction(0, CELL_COUNT)).toBe('none');
  });

  it('moves and swaps without touching the attack gauge', () => {
    const sim = newSim();
    const a = put(sim, 0, 'w_paw', 0.7);
    const b = put(sim, 1, 'r_sling', 0.2);
    const moves = record(sim, 'move');
    const swaps = record(sim, 'swap');
    expect(sim.drop(0, 10)).toBeNull();
    expect(sim.units[10]).toBe(a);
    expect(sim.units[0]).toBeNull();
    expect(a.cell).toBe(10);
    expect(moves).toEqual([{ unit: a, from: 0, to: 10 }]);
    expect(sim.drop(10, 1)).toBeNull();
    expect(sim.units[1]).toBe(a);
    expect(sim.units[10]).toBe(b);
    expect(swaps).toHaveLength(1);
    expect(a.charge).toBe(0.7);
    expect(b.charge).toBe(0.2);
  });

  it('merges two equal cats into the next rarity at the target cell with a half gauge', () => {
    const sim = newSim();
    const a = put(sim, 3, 'w_paw');
    const b = put(sim, 8, 'w_paw');
    const merges = record(sim, 'merge');
    expect(sim.drop(3, 8)).toBeNull();
    expect(sim.units[3]).toBeNull();
    const result = sim.units[8]!;
    expect(result.id).toBe('w_sword');
    expect(result.charge).toBe(0.5);
    expect(merges).toEqual([{ consumed: [a, b], result, cell: 8, fromCell: 3, jumped: false }]);
    expect(sim.getStats().merges).toBe(1);
  });

  it('lists every class as a fixed line: a merge makes the next rarity of the same class', () => {
    const lines: Record<string, UnitId[]> = {
      warrior: ['w_paw', 'w_sword', 'w_viking', 'w_samurai', 'w_tiger'],
      ranger: ['r_sling', 'r_archer', 'r_ninja', 'r_gunner', 'r_star'],
      mage: ['m_snow', 'm_fire', 'm_storm', 'm_frost', 'm_cosmo'],
      trickster: ['t_chef', 't_bell', 't_bard', 't_alch', 't_lucky'],
    };
    for (const [classId, line] of Object.entries(lines)) {
      expect(UNIT_GRID[classId as ClassId]).toEqual(line);
      line.forEach((id, r) => {
        expect(mergeResultOf(id)).toBe(r <= 2 ? line[r + 1] : null);
      });
    }
  });

  it('merges every common, rare and epic of every class into mergeResultOf, whatever the seed', () => {
    for (const id of UNIT_IDS) {
      const expected = mergeResultOf(id);
      if (expected === null) continue;
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        const sim = newSim({ seed });
        put(sim, 4, id);
        put(sim, 9, id);
        expect(sim.dropAction(4, 9)).toBe('merge');
        expect(sim.drop(4, 9)).toBeNull();
        expect(sim.units[9]!.id).toBe(expected);
        expect(sim.units.filter(Boolean)).toHaveLength(1);
      }
    }
  });

  it('draws one number from the merge stream per merge and touches no other stream', () => {
    const sim = newSim({ seed: 21 });
    const merged = (): number[] => {
      const before = sim.rng.states();
      put(sim, 0, 'w_paw');
      put(sim, 1, 'w_paw');
      sim.drop(0, 1);
      sim.sell(1);
      const after = sim.rng.states();
      return after.flatMap((v, i) => (v !== before[i] ? [i] : []));
    };
    expect(merged()).toEqual([MERGE_STREAM]);
    expect(merged()).toEqual([MERGE_STREAM]);
    expect(sim.getStats().merges).toBe(2);
  });

  it('never merges legendary or mythic cats and never leaves the legendary tier by merging', () => {
    for (const classId of CLASS_IDS) {
      for (const r of [3, 4]) {
        const sim = newSim();
        const id = UNIT_GRID[classId][r] as UnitId;
        put(sim, 0, id);
        put(sim, 1, id);
        expect(mergeResultOf(id)).toBeNull();
        expect(sim.dropAction(0, 1)).toBe('swap');
        expect(sim.drop(0, 1)).toBeNull();
        expect(sim.units[0]!.id).toBe(id);
        expect(sim.units[1]!.id).toBe(id);
        expect(sim.getStats().merges).toBe(0);
      }
    }
    for (let seed = 1; seed < 30; seed++) {
      const s = newSim({ seed });
      s.fx.jumpChance = 1;
      put(s, 0, 'r_ninja');
      put(s, 1, 'r_ninja');
      s.drop(0, 1);
      expect(s.units[1]!.id).toBe('r_gunner');
    }
  });

  it('keeps the banned class out of summons, picks and molts, and merging never brings it in', () => {
    const sim = newSim({ mode: 'daily', modifiers: ['no_rangers'], seed: 9 });
    rich(sim, 1e9, 50);
    const seen = new Set<UnitId>();
    sim.events.on('summon', (e) => seen.add(e.unit.id));
    sim.events.on('merge', (e) => seen.add(e.result.id));
    sim.events.on('molt', (e) => seen.add(e.result.id));
    for (let round = 0; round < 60; round++) {
      for (let i = 0; i < 4; i++) {
        sim.summon();
        if (sim.pending) sim.pickSummon(round % 3);
      }
      for (let c = 0; c < CELL_COUNT; c++) {
        const u = sim.units[c];
        if (u && c % 3 === 0) expect(sim.molt(c, 'ranger')).toBe('not_available');
      }
      for (let a = 0; a < CELL_COUNT; a++) {
        for (let b = a + 1; b < CELL_COUNT; b++) if (sim.dropAction(a, b) === 'merge') sim.drop(a, b);
      }
      for (let c = 0; c < CELL_COUNT; c++) if (sim.units[c] && c % 2 === 0) sim.sell(c);
    }
    expect(seen.size).toBeGreaterThan(8);
    expect([...seen].filter((id) => unitClass(id) === 'ranger')).toEqual([]);
  });

  it('sells for the listed fish and purr', () => {
    const ids: UnitId[] = ['w_paw', 'w_sword', 'w_viking', 'w_samurai', 'w_tiger'];
    ids.forEach((id, r) => {
      const sim = newSim();
      const u = put(sim, 4, id);
      expect(sim.sellValue(4)).toEqual({ fish: SELL_FISH[r], purr: SELL_PURR[r] });
      const sold = record(sim, 'sell');
      const fish = sim.fish;
      const purr = sim.purr;
      expect(sim.sell(4)).toBeNull();
      expect(sim.fish - fish).toBe(SELL_FISH[r]);
      expect(sim.purr - purr).toBe(SELL_PURR[r]);
      expect(sold).toEqual([{ unit: u, cell: 4, fish: SELL_FISH[r], purr: SELL_PURR[r] }]);
      expect(sim.units[4]).toBeNull();
    });
    expect(SELL_PURR).toEqual([0, 0, 1, 1, 3]);
  });

  it('molts to another class of the same rarity for 1 purr, up to six times', () => {
    const sim = newSim();
    sim.purr = 10;
    put(sim, 0, 'w_viking');
    const molts = record(sim, 'molt');
    expect(sim.molt(0, 'warrior')).toBe('nothing_to_do');
    expect(sim.molt(0, 'mage')).toBeNull();
    expect(sim.units[0]!.id).toBe('m_storm');
    expect(sim.units[0]!.charge).toBe(0.5);
    expect(sim.purr).toBe(9);
    expect(molts).toHaveLength(1);
    expect(sim.moltsLeft()).toBe(MOLT_LIMIT - 1);
    for (let i = 0; i < MOLT_LIMIT - 1; i++) expect(sim.molt(0, i % 2 ? 'mage' : 'ranger')).toBeNull();
    expect(sim.molt(0, 'warrior')).toBe('molt_limit');
    expect(sim.moltsLeft()).toBe(0);
    expect(sim.moltCost()).toBe(1);
  });

  it('refuses to molt a guardian, an empty cell, or without purr', () => {
    const sim = newSim();
    sim.purr = 0;
    put(sim, 0, 'w_paw');
    put(sim, 1, 'w_tiger');
    expect(sim.molt(0, 'mage')).toBe('not_enough_purr');
    sim.purr = 3;
    expect(sim.molt(1, 'mage')).toBe('not_available');
    expect(sim.molt(2, 'mage')).toBe('empty_cell');
    expect(sim.molt(99, 'mage')).toBe('invalid_cell');
  });

  it('checks awakening in the documented order', () => {
    const sim = newSim();
    sim.purr = 0;
    expect(sim.canAwaken(0)).toBe('empty_cell');
    expect(sim.awaken(0)).toBe('empty_cell');
    put(sim, 0, 'w_viking');
    expect(sim.canAwaken(0)).toBe('not_legendary');
    // A legendary alone, even with a kitten beside it (the kitten rank does not count), has no synergy to awaken with.
    put(sim, 5, 'm_frost');
    put(sim, 6, 'm_snow');
    expect(sim.synergyTier('mage')).toBe(0);
    expect(sim.canAwaken(5)).toBe('synergy_too_low');
    // Two kinds are enough (v1.4: step 1 of the class, it was step 2).
    put(sim, 1, 'w_samurai');
    expect(sim.synergyTier('warrior')).toBe(1);
    expect(sim.canAwaken(1)).toBe('not_enough_purr');
    sim.purr = AWAKEN_COST;
    expect(sim.canAwaken(1)).toBeNull();
    const awakened = record(sim, 'awaken');
    expect(sim.awaken(1)).toBeNull();
    expect(sim.units[1]!.id).toBe('w_tiger');
    expect(sim.purr).toBe(0);
    expect(awakened).toHaveLength(1);
    expect(sim.awakenCost()).toBe(AWAKEN_COST);
    expect(sim.getStats().awakenings).toBe(1);
    expect(sim.getStats().bestRarity).toBe('mythic');
    expect(sim.canAwaken(99)).toBe('invalid_cell');
  });

  it('allows several guardians of the same kind', () => {
    const sim = newSim();
    sim.purr = 2 * AWAKEN_COST;
    for (const [i, id] of (['w_paw', 'w_sword', 'w_viking', 'w_samurai', 'w_samurai'] as UnitId[]).entries()) put(sim, i, id);
    expect(sim.awaken(3)).toBeNull();
    expect(sim.awaken(4)).toBeNull();
    expect(sim.units.filter((u) => u?.id === 'w_tiger')).toHaveLength(2);
  });

  it('upgrades a class for 60 / 100 / 160 / 240 / 340 fish, five times', () => {
    const sim = newSim();
    rich(sim);
    const upgrades = record(sim, 'upgrade');
    CLASS_UPGRADE_COSTS.forEach((cost, i) => {
      expect(sim.classUpgradeCost('mage')).toBe(cost);
      expect(sim.classUpgradeLevel('mage')).toBe(i);
      const fish = sim.fish;
      expect(sim.upgradeClass('mage')).toBeNull();
      expect(fish - sim.fish).toBe(cost);
    });
    expect(sim.classUpgradeCost('mage')).toBe(-1);
    expect(sim.upgradeClass('mage')).toBe('max_level');
    expect(upgrades).toHaveLength(5);
    expect(upgrades[0]).toEqual({ kind: 'class', classId: 'mage', level: 1 });
    sim.fish = 10;
    expect(sim.upgradeClass('warrior')).toBe('not_enough_fish');
  });

  it('boosts the class\'s damage by 15 percent per upgrade level', () => {
    const sim = newSim();
    rich(sim);
    const u = put(sim, 7, 'm_snow');
    const base = u.stats.damage;
    sim.upgradeClass('mage');
    sim.upgradeClass('mage');
    expect(u.stats.damage).toBeCloseTo(base * 1.3, 9);
    sim.upgradeClass('warrior');
    expect(u.stats.damage).toBeCloseTo(base * 1.3, 9);
  });
});

describe('synergy by distinct unit types', () => {
  it('counts different types, not heads', () => {
    const sim = newSim();
    const tiers = record(sim, 'synergy');
    put(sim, 0, 'w_paw');
    put(sim, 1, 'w_paw');
    put(sim, 2, 'w_paw');
    // The first rank (the kitten) does not count toward the kinds of a class.
    expect(sim.classDistinct('warrior')).toBe(0);
    expect(sim.synergyTier('warrior')).toBe(0);
    put(sim, 3, 'w_sword');
    expect(sim.classDistinct('warrior')).toBe(1);
    expect(sim.synergyTier('warrior')).toBe(0);
    put(sim, 4, 'w_viking');
    expect(sim.synergyTier('warrior')).toBe(1);
    put(sim, 5, 'w_samurai');
    expect(sim.synergyTier('warrior')).toBe(2);
    // The third step needs the guardian: all four of the other ranks.
    put(sim, 6, 'w_tiger');
    expect(sim.classDistinct('warrior')).toBe(4);
    expect(sim.synergyTier('warrior')).toBe(3);
    expect(tiers.map((t) => [t.classId, t.previous, t.tier, t.distinct])).toEqual([
      ['warrior', 0, 1, 2], ['warrior', 1, 2, 3], ['warrior', 2, 3, 4],
    ]);
    // The ladder still shows every rank that stands on the board, the kitten included.
    expect(sim.classOwned('warrior')).toEqual([true, true, true, true, true]);
    expect(sim.classOwned('mage')).toEqual([false, false, false, false, false]);
    sim.sell(6);
    expect(sim.synergyTier('warrior')).toBe(2);
    sim.sell(5);
    expect(sim.synergyTier('warrior')).toBe(1);
  });

  it('applies each class damage bonus only to its own cats (warrior damage step 1)', () => {
    const sim = newSim();
    const mage = put(sim, 12, 'm_snow');
    const sling = put(sim, 13, 'r_sling');
    const lone = put(sim, 0, 'w_paw');
    const base = lone.stats.damage;
    const slingBase = sling.stats.damage;
    put(sim, 1, 'w_sword');
    put(sim, 2, 'w_viking');
    expect(sim.synergyTier('warrior')).toBe(1);
    expect(lone.stats.damage).toBeCloseTo(base * 1.12, 9);
    expect(mage.stats.damage).toBeCloseTo(unitSpec('m_snow').base.damage, 9);
    expect(sling.stats.damage).toBeCloseTo(slingBase, 9);
  });

  it('gives every cat the rangers\' crit chance and crit damage, and the tricksters\' attack speed to everyone', () => {
    const sim = newSim();
    const sling = put(sim, 12, 'r_sling');
    const paw = put(sim, 0, 'w_paw');
    const mage = put(sim, 1, 'm_snow');
    const baseInterval = paw.stats.interval;
    const baseCrit = sling.stats.crit;
    put(sim, 13, 'r_archer');
    put(sim, 14, 'r_ninja');
    put(sim, 16, 'r_gunner');
    expect(sim.synergyTier('ranger')).toBe(2);
    for (const u of [sling, paw, mage]) {
      expect(u.stats.crit, u.id).toBeCloseTo(unitSpec(u.id).base.crit + 0.1, 9);
      expect(u.stats.critMult, u.id).toBeCloseTo(unitSpec(u.id).base.critMult + 0.05, 9);
    }
    expect(baseCrit).toBeCloseTo(unitSpec('r_sling').base.crit, 9);
    put(sim, 17, 't_bell');
    put(sim, 18, 't_bard');
    expect(sim.synergyTier('trickster')).toBe(1);
    expect(paw.stats.interval).toBeCloseTo(baseInterval / 1.05, 9);
  });
});

describe('command failure reasons', () => {
  const sim = newSim();

  it('reports choice_pending for everything except the choice commands', () => {
    const s = newSim();
    rich(s);
    s.paidSummons = 5;
    s.summon();
    put(s, 10, 'w_paw');
    const results: Fail[] = [];
    for (const r of [s.summon(), s.drop(10, 11), s.sell(10), s.molt(10, 'mage'), s.awaken(10), s.upgradeClass('mage'), s.upgradeSummon(), s.setLaser(1, 1), s.callNextWave()]) {
      if (r) results.push(r);
    }
    expect(results).toEqual(Array(9).fill('choice_pending'));
    expect(s.pickRelic(0)).toBe('not_available');
    expect(s.rerollRelics(false)).toBe('not_available');
  });

  it('reports not_in_battle once the run is over', () => {
    const s = newSim();
    s.abandon();
    const results = [s.summon(), s.drop(0, 1), s.sell(0), s.molt(0, 'mage'), s.awaken(0), s.upgradeClass('mage'), s.upgradeSummon(), s.setLaser(1, 1), s.callNextWave(), s.pickSummon(0), s.pickRelic(0)];
    expect(results).toEqual(Array(11).fill('not_in_battle'));
  });

  it('reports cell errors', () => {
    expect(sim.drop(-1, 0)).toBe('invalid_cell');
    expect(sim.drop(0, CELL_COUNT)).toBe('invalid_cell');
    expect(sim.drop(0, 1)).toBe('empty_cell');
    expect(sim.sell(CELL_COUNT)).toBe('invalid_cell');
    expect(sim.sell(freeCell(sim))).toBe('empty_cell');
    const s = newSim();
    put(s, 3, 'w_paw');
    expect(s.drop(3, 3)).toBe('nothing_to_do');
  });

  it('reports a laser on cooldown and a call that is not available', () => {
    const s = newSim();
    expect(s.callNextWave()).toBe('not_available');
    expect(s.callBonus()).toBe(-1);
    expect(s.setLaser(100, 100)).toBeNull();
    s.laser.active = false;
    s.laser.cooldown = 3;
    expect(s.setLaser(100, 100)).toBe('on_cooldown');
  });

  it('reports not_available for rerolls and picks without an offer, and already_used for a second revive', () => {
    const s = newSim();
    expect(s.pickSummon(0)).toBe('not_available');
    expect(s.pickRelic(0)).toBe('not_available');
    expect(s.rerollRelics(true)).toBe('not_available');
    expect(s.revive()).toBe('not_available');
    expect(s.canRevive()).toBe(false);
  });
});
