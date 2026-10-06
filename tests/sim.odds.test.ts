import { describe, expect, it } from 'vitest';
import { CLASS_IDS } from '@/game/api';
import { Rng } from '@/core/rng';
import { SUMMON_ODDS } from '@/game/data/balance';
import { CELL_COUNT } from '@/game/geometry';
import { unitClass, unitRarityIndex } from '@/game/data/roster';
import { computeOdds, pityBonus, rollRarity } from '@/game/sim/odds';
import { chiSquare } from './simStats';
import { newSim, put } from './simHelpers';

const SAMPLES = 100_000;
const ALPHA = 0.001;

describe('chi-square helper', () => {
  it('recognises a fair and an unfair die', () => {
    expect(chiSquare([100, 100, 100, 100], [0.25, 0.25, 0.25, 0.25]).p).toBeGreaterThan(0.9);
    expect(chiSquare([140, 100, 80, 80], [0.25, 0.25, 0.25, 0.25]).p).toBeLessThan(0.001);
    expect(chiSquare([50, 50, 0], [0.5, 0.5, 0]).df).toBe(1);
  });

  it('matches known critical values', () => {
    // 95th percentile of chi-square with 3 degrees of freedom is 7.815.
    const observed = [100, 100, 100, 100];
    expect(chiSquare(observed, [0.25, 0.25, 0.25, 0.25]).statistic).toBe(0);
    const c = chiSquare([112, 88, 100, 100], [0.25, 0.25, 0.25, 0.25]);
    expect(c.statistic).toBeCloseTo(2.88, 6);
    expect(c.p).toBeCloseTo(0.41, 2);
  });
});

describe('summon odds', () => {
  it('sum to exactly one in every state', () => {
    const out = [0, 0, 0, 0];
    for (let grade = 0; grade < SUMMON_ODDS.length; grade++) {
      for (const dry of [0, 5, 11, 12, 13, 16, 22, 23, 24, 40]) {
        for (const boost of [0, 0.1]) {
          computeOdds(out, grade, dry, boost);
          expect(out.reduce((a, v) => a + v, 0)).toBeCloseTo(1, 12);
          for (const p of out) expect(p).toBeGreaterThanOrEqual(-1e-12);
        }
      }
    }
  });

  it('adds 3 points per summon past the eleventh, up to 35', () => {
    expect(pityBonus(11)).toBe(0);
    expect(pityBonus(12)).toBeCloseTo(0.03, 12);
    expect(pityBonus(13)).toBeCloseTo(0.06, 12);
    expect(pityBonus(22)).toBeCloseTo(0.33, 12);
    expect(pityBonus(23)).toBe(0.35);
    expect(pityBonus(500)).toBe(0.35);
  });

  it('is sampled faithfully by the roll function in every grade and pity state (pure, 100,000 samples each)', () => {
    const rng = new Rng(7);
    const probs = [0, 0, 0, 0];
    for (let grade = 0; grade < SUMMON_ODDS.length; grade++) {
      for (const dry of [0, 8, 12, 14, 18, 25]) {
        computeOdds(probs, grade, dry, 0);
        const seen = [0, 0, 0, 0];
        for (let i = 0; i < SAMPLES; i++) seen[rollRarity(rng.next(), probs)]!++;
        const chi = chiSquare(seen, probs);
        expect(chi.p, `grade ${grade} dry ${dry}`).toBeGreaterThan(ALPHA);
      }
    }
  });
});

describe('the battle\'s own summons follow summonOdds()', () => {
  function sample(seed: number, grade: number, count: number): Map<number, { seen: number[]; probs: number[][] }> {
    const sim = newSim({ seed });
    sim.fish = 1e9;
    sim.grade = grade;
    const byState = new Map<number, { seen: number[]; probs: number[][] }>();
    let rarity = -1;
    sim.events.on('summon', (e) => {
      if (e.source === 'button') rarity = unitRarityIndex(e.unit.id);
    });
    for (let i = 0; i < count; i++) {
      const offer = sim.summonOfferProgress().count === 5;
      const dry = sim.epicDry;
      const odds = sim.summonOdds().map((o) => o.p);
      rarity = -1;
      expect(sim.summon()).toBeNull();
      if (sim.pending) sim.pickSummon(0);
      if (!offer) {
        let slot = byState.get(dry);
        if (!slot) {
          slot = { seen: [0, 0, 0, 0], probs: [] };
          byState.set(dry, slot);
        }
        slot.seen[rarity]!++;
        slot.probs.push(odds);
      }
      for (let c = 0; c < CELL_COUNT; c++) if (sim.units[c]) sim.sell(c);
    }
    return byState;
  }

  it('matches the table in every pity state of grade 0 (100,000 summons)', { timeout: 120_000 }, () => {
    const states = sample(11, 0, SAMPLES);
    let tested = 0;
    for (const [dry, slot] of states) {
      const n = slot.seen.reduce((a, v) => a + v, 0);
      if (n < 300) continue;
      // All summons in one state share the odds, so the first row is the expected distribution.
      const probs = slot.probs[0] as number[];
      for (const p of slot.probs) expect(p).toEqual(probs);
      const chi = chiSquare(slot.seen, probs);
      expect(chi.p, `epicDry ${dry} (${n} summons)`).toBeGreaterThan(ALPHA);
      tested++;
    }
    expect(tested).toBeGreaterThanOrEqual(12);
    const pity = states.get(14)!;
    expect(pity.probs[0]![2]).toBeCloseTo(0.05 + 0.09, 12);
  });

  it('matches the table at every summon grade (30,000 summons each)', { timeout: 120_000 }, () => {
    for (let grade = 1; grade <= 5; grade++) {
      const states = sample(100 + grade, grade, 30_000);
      for (const [dry, slot] of states) {
        const n = slot.seen.reduce((a, v) => a + v, 0);
        if (n < 400) continue;
        const chi = chiSquare(slot.seen, slot.probs[0] as number[]);
        expect(chi.p, `grade ${grade} epicDry ${dry} (${n})`).toBeGreaterThan(ALPHA);
      }
    }
  });

  it('draws the class uniformly, and never a banned one', () => {
    for (const banned of [false, true]) {
      const sim = newSim(banned ? { mode: 'daily', modifiers: ['no_rangers'], seed: 5 } : { seed: 5 });
      sim.fish = 1e9;
      const seen = [0, 0, 0, 0];
      const cells = new Array<number>(CELL_COUNT).fill(0);
      for (let i = 0; i < 40_000; i++) {
        const offer = sim.summonOfferProgress().count === 5;
        sim.summon();
        if (sim.pending) sim.pickSummon(0);
        if (!offer) {
          const cell = sim.units.findIndex(Boolean);
          cells[cell]!++;
          seen[CLASS_IDS.indexOf(unitClass(sim.units[cell]!.id))]!++;
        }
        for (let c = 0; c < CELL_COUNT; c++) if (sim.units[c]) sim.sell(c);
      }
      const probs = banned ? [1 / 3, 0, 1 / 3, 1 / 3] : [0.25, 0.25, 0.25, 0.25];
      expect(chiSquare(seen, probs).p).toBeGreaterThan(ALPHA);
      expect(chiSquare(cells, new Array<number>(CELL_COUNT).fill(1 / CELL_COUNT)).p).toBeGreaterThan(ALPHA);
    }
  });

  it('rolls the snack stick jump at its chance and never changes the class of a merge', () => {
    const sim = newSim({ seed: 17 });
    sim.fx.jumpChance = 0.12;
    const seen = [0, 0];
    let otherClass = 0;
    sim.events.on('merge', (e) => {
      seen[e.jumped ? 1 : 0]!++;
      if (unitClass(e.result.id) !== 'warrior') otherClass++;
    });
    for (let i = 0; i < 20_000; i++) {
      put(sim, 0, 'w_paw');
      put(sim, 1, 'w_paw');
      sim.drop(0, 1);
      sim.sell(1);
    }
    expect(seen[0]! + seen[1]!).toBe(20_000);
    expect(otherClass).toBe(0);
    expect(chiSquare(seen, [0.88, 0.12]).p).toBeGreaterThan(ALPHA);
  });
});
