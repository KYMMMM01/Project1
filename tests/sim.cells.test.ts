import { describe, expect, it } from 'vitest';
import { SPECIAL_CELL_IDS, type BattleInit, type SpecialCellId, type UnitStats } from '@/game/api';
import { BASE_FISH_PER_SECOND, FIRST_SUN_CELLS, SUN_CELLS } from '@/game/data/balance';
import { SPECIAL_CELLS } from '@/game/data/cells';
import { CHAPTERS } from '@/game/data/roster';
import { createBattle } from '@/game/sim/create';
import { gainRelic, startWave } from '@/game/sim/flow';
import { scheduleHazard } from '@/game/sim/hazards';
import type { Sim } from '@/game/sim/sim';
import { advance, initOf, newSim, put, quietWave, record, slay } from './simHelpers';

/** Chapter 1..5 -> the kind it plays with. */
const KIND: readonly SpecialCellId[] = ['sun', 'bowl', 'bubble', 'stump', 'treat'];

function field(chapter: number, over: Partial<BattleInit> = {}): Sim {
  const sim = newSim({ chapter, ...over });
  quietWave(sim);
  return sim;
}

/** The cells off the special ones and away from the cat that stands on a special one (so no aura or neighbour rule is in play). */
function plainCell(sim: Sim): number {
  for (let c = 24; c >= 0; c--) if (!sim.sunbeams.includes(c)) return c;
  throw new Error('no plain cell');
}

const STAT_KEYS: (keyof UnitStats)[] = ['damage', 'interval', 'range', 'crit', 'critMult'];

describe('one special cell kind per chapter', () => {
  it('has the sunbeam in the living room and a kind of its own in each other chapter', () => {
    expect([...SPECIAL_CELL_IDS]).toEqual(KIND);
    expect(CHAPTERS.map((c) => c.cell)).toEqual(KIND);
    for (const [i, kind] of KIND.entries()) {
      const sim = newSim({ chapter: i + 1 });
      expect(sim.specialCell).toBe(kind);
    }
  });

  it('uses the chapter\'s kind in the daily, the endless and the gold mode too', () => {
    for (const mode of ['daily', 'endless', 'gold'] as const) {
      expect(newSim({ mode, chapter: 3 }).specialCell, mode).toBe('bubble');
      expect(newSim({ mode, chapter: 4 }).specialCell, mode).toBe('stump');
    }
    expect(newSim({ mode: 'tutorial', chapter: 1 }).specialCell).toBe('sun');
  });

  it('starts on the plus in the middle, keeps the count and moves at every act clear, for every kind', () => {
    for (let chapter = 1; chapter <= 5; chapter++) {
      const sim = newSim({ chapter });
      expect([...sim.sunbeams].sort((a, b) => a - b), `chapter ${chapter}`).toEqual([...FIRST_SUN_CELLS]);
      expect(sim.sunbeams).toHaveLength(SUN_CELLS);
      const moves = record(sim, 'sunbeams');
      quietWave(sim);
      startWave(sim, 4);
      advance(sim, 1.1);
      slay(sim);
      advance(sim, 1.3);
      expect(moves, `chapter ${chapter}`).toHaveLength(1);
      expect(new Set(moves[0]!.cells).size).toBe(SUN_CELLS);
      expect([...sim.sunbeams]).toEqual(moves[0]!.cells);
    }
  });

  it('holds 10 cells under the rule that asks for more, in any chapter', () => {
    for (let chapter = 1; chapter <= 5; chapter++) expect(newSim({ chapter, modifiers: ['sunny_day'] }).sunbeams, `chapter ${chapter}`).toHaveLength(10);
  });

  it('survives a wave-start save: the same kind and the same cells', () => {
    const init = initOf({ seed: 99, chapter: 4 });
    const sim = createBattle(init) as Sim;
    advance(sim, 3.1);
    const snap = sim.snapshot();
    expect(snap).not.toBeNull();
    const back = createBattle(init, snap!) as Sim;
    expect(back.specialCell).toBe('stump');
    expect([...back.sunbeams]).toEqual([...sim.sunbeams]);
  });
});

describe('the one bonus of each special cell', () => {
  /** The same sword cat on a special cell and on a plain one, stats side by side. */
  const pair = (chapter: number): { on: UnitStats; off: UnitStats; sim: Sim } => {
    const sim = field(chapter);
    const cell = sim.sunbeams[0] as number;
    const on = put(sim, cell, 'w_sword');
    const off = put(sim, plainCell(sim), 'w_sword');
    return { on: { ...on.stats }, off: { ...off.stats }, sim };
  };

  it('gives the sunbeam +20% attack speed and nothing else', () => {
    const { on, off } = pair(1);
    expect(off.interval / on.interval).toBeCloseTo(1.2, 9);
    for (const key of STAT_KEYS.filter((k) => k !== 'interval')) expect(on[key], key).toBe(off[key]);
  });

  it('gives the food bowl +20% damage and nothing else', () => {
    const { on, off } = pair(2);
    expect(on.damage / off.damage).toBeCloseTo(1.2, 9);
    for (const key of STAT_KEYS.filter((k) => k !== 'damage')) expect(on[key], key).toBe(off[key]);
  });

  it('gives the bubble cell +20 points of crit chance and nothing else', () => {
    const { on, off } = pair(3);
    expect(on.crit - off.crit).toBeCloseTo(0.2, 9);
    for (const key of STAT_KEYS.filter((k) => k !== 'crit')) expect(on[key], key).toBe(off[key]);
  });

  it('gives the stump +20% range and nothing else', () => {
    const { on, off } = pair(4);
    expect(on.range / off.range).toBeCloseTo(1.2, 9);
    for (const key of STAT_KEYS.filter((k) => k !== 'range')) expect(on[key], key).toBe(off[key]);
  });

  it('gives the treat cell no stat at all, but 0.15 fish a second for every cat on it', () => {
    const { on, off, sim } = pair(5);
    for (const key of STAT_KEYS) expect(on[key], key).toBe(off[key]);
    expect(sim.incomePerSecond()).toBeCloseTo(BASE_FISH_PER_SECOND + 0.15, 9);
    put(sim, sim.sunbeams[1] as number, 'w_paw');
    expect(sim.incomePerSecond()).toBeCloseTo(BASE_FISH_PER_SECOND + 0.3, 9);
  });

  it('is worth the same on paper: a fifth of whatever it improves, and 0.15 fish a second for the trickle (the bots rate them alike)', () => {
    for (const id of SPECIAL_CELL_IDS) expect(SPECIAL_CELLS[id].value, id).toBe(id === 'treat' ? 0.15 : 0.2);
  });

  it('adds 10 points of the prime-spot toy to whichever bonus the chapter has, and 3 cells', () => {
    const wanted: Record<SpecialCellId, (on: UnitStats, off: UnitStats) => number> = {
      sun: (on, off) => off.interval / on.interval - 1,
      bowl: (on, off) => on.damage / off.damage - 1,
      bubble: (on, off) => on.crit - off.crit,
      stump: (on, off) => on.range / off.range - 1,
      treat: () => 0.25,
    };
    for (let chapter = 1; chapter <= 5; chapter++) {
      const sim = field(chapter);
      gainRelic(sim, 'sunny_spot');
      expect(sim.sunbeams, `chapter ${chapter}`).toHaveLength(SUN_CELLS + 3);
      const on = put(sim, sim.sunbeams[0] as number, 'w_sword');
      const off = put(sim, plainCell(sim), 'w_sword');
      expect(wanted[KIND[chapter - 1] as SpecialCellId](on.stats, off.stats), `chapter ${chapter}`).toBeCloseTo(chapter === 5 ? 0.25 : 0.3, 9);
    }
  });
});

describe('the treat cell\'s trickle', () => {
  it('pays for each cat that stands on it and can work, not for an empty cell and not for a cat a wet cell has stopped', () => {
    const sim = field(5);
    const [a, b] = sim.sunbeams as number[];
    put(sim, a as number, 'w_paw');
    put(sim, b as number, 'w_paw');
    expect(sim.incomePerSecond()).toBeCloseTo(BASE_FISH_PER_SECOND + 0.3, 9);
    scheduleHazard(sim, 'wet', [a as number], 3);
    advance(sim, 1.2);
    expect(sim.units[a as number]!.blocked).toBe(true);
    expect(sim.incomePerSecond()).toBeCloseTo(BASE_FISH_PER_SECOND + 0.15, 9);
    sim.sell(b as number);
    expect(sim.incomePerSecond()).toBeCloseTo(BASE_FISH_PER_SECOND, 9);
  });

  it('adds up to real fish: two cats on treat cells earn about 0.8 fish a second over ten seconds', () => {
    const sim = field(5);
    put(sim, sim.sunbeams[0] as number, 'w_paw');
    put(sim, sim.sunbeams[1] as number, 'w_paw');
    const fish = record(sim, 'fish');
    advance(sim, 10);
    const income = fish.filter((e) => e.reason === 'income').reduce((a, e) => a + e.delta, 0);
    expect(Math.abs(income - 8)).toBeLessThanOrEqual(1);
  });

  it('pays nothing extra in the other chapters', () => {
    for (let chapter = 1; chapter <= 4; chapter++) {
      const sim = field(chapter);
      put(sim, sim.sunbeams[0] as number, 'w_paw');
      expect(sim.incomePerSecond(), `chapter ${chapter}`).toBe(BASE_FISH_PER_SECOND);
    }
  });
});
