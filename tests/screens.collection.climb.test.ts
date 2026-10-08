import { describe, expect, it } from 'vitest';
import { CHEST_RARITIES } from '@/meta/types';
import { CLIMBS, climbSeed, climbSteps, pickClimb, TOP_RANK } from '../src/screens/shop/climb';
import { mergePile } from '../src/screens/shop/revealPlan';
import type { ChestResult } from '@/meta/types';

describe('the climb table', () => {
  it('has a row for every rank, whose patterns end on that rank, never fall and never pass it', () => {
    expect(TOP_RANK).toBe(CHEST_RARITIES.length - 1);
    CHEST_RARITIES.forEach((best, rank) => {
      const rows = CLIMBS[best];
      expect(rows.length).toBeGreaterThanOrEqual(2);
      expect(rows.reduce((n, p) => n + p.odds, 0)).toBe(100);
      for (const p of rows) {
        expect(p.beats[p.beats.length - 1]).toBe(rank);
        let at = 0;
        for (const r of p.beats) {
          expect(r).toBeGreaterThanOrEqual(at);
          expect(r).toBeLessThanOrEqual(rank);
          at = r;
        }
      }
    });
  });

  it('gives a lowest-rank chest no promotion at all', () => {
    for (const p of CLIMBS.common) expect(climbSteps(p).every((s) => s === 0)).toBe(true);
  });

  it('counts the ranks each beat climbs, from the quiet colour', () => {
    expect(climbSteps({ id: 'x', odds: 1, beats: [0, 1, 2, 3] })).toEqual([0, 1, 1, 1]);
    expect(climbSteps({ id: 'x', odds: 1, beats: [0, 2, 2, 3] })).toEqual([0, 2, 0, 1]);
    expect(climbSteps({ id: 'x', odds: 1, beats: [1, 1] })).toEqual([1, 0]);
  });
});

describe('picking a pattern', () => {
  it('is a pure function of the seed: the same one every time, whatever was picked before', () => {
    for (const best of CHEST_RARITIES) {
      for (const seed of [0, 1, 57, 99, 100, 4294967295, 3532528173]) {
        const first = pickClimb(best, seed).id;
        pickClimb(best, seed + 1);
        expect(pickClimb(best, seed).id).toBe(first);
      }
    }
  });

  it('follows the odds of the table over every seed', () => {
    for (const best of CHEST_RARITIES) {
      const counts = new Map<string, number>();
      for (let seed = 0; seed < 10000; seed++) counts.set(pickClimb(best, seed).id, (counts.get(pickClimb(best, seed).id) ?? 0) + 1);
      for (const p of CLIMBS[best]) expect(counts.get(p.id)).toBe(p.odds * 100);
    }
  });

  it('is spread over the stored results of real openings, near the odds, and the same after a restart', () => {
    const counts = new Map<string, number>();
    const n = 4000;
    for (let id = 1; id <= n; id++) {
      // Real ids count up one by one and seeds are anything: the pick must not follow the id's parity or a short cycle.
      const seed = Math.imul(id, 2654435761) >>> 0;
      const a = pickClimb('legendary', climbSeed([{ id, seed }]));
      const b = pickClimb('legendary', climbSeed([{ id, seed }]));
      expect(b.id).toBe(a.id);
      counts.set(a.id, (counts.get(a.id) ?? 0) + 1);
    }
    for (const p of CLIMBS.legendary) {
      const share = ((counts.get(p.id) ?? 0) / n) * 100;
      expect(Math.abs(share - p.odds)).toBeLessThan(3);
    }
  });
});

describe('the seed of an opening', () => {
  it('never changes for the same stored results (a replay after a restart stages the same climb), so these numbers are fixed', () => {
    expect(climbSeed([{ id: 1, seed: 1 }])).toBe(3532528173);
    expect(climbSeed([{ id: 7, seed: 123456 }])).toBe(4006314145);
    expect(climbSeed([{ id: 9000, seed: 4 }, { id: 9001, seed: 4 }])).toBe(2127849454);
  });

  it('tells one result from another and one order of a pile from another', () => {
    const seen = new Set<number>();
    for (let id = 1; id <= 500; id++) seen.add(climbSeed([{ id, seed: id }]));
    expect(seen.size).toBe(500);
    expect(climbSeed([{ id: 1, seed: 2 }])).not.toBe(climbSeed([{ id: 2, seed: 1 }]));
    expect(climbSeed([{ id: 1, seed: 1 }, { id: 2, seed: 2 }])).not.toBe(climbSeed([{ id: 2, seed: 2 }, { id: 1, seed: 1 }]));
  });

  it('is on the pile that merges the stored results, made from all of them', () => {
    const r = (id: number, seed: number): ChestResult =>
      ({ id, kind: 'gold', seed, oddsVersion: 1, upgraded: 0, overflowGold: 0, pity: { unit: null, cards: 0 }, cards: [{ rarity: 'common', unit: null }] }) as ChestResult;
    const pile = mergePile([r(5, 11), r(6, 12), r(7, 13)]);
    expect(pile.seed).toBe(climbSeed([{ id: 5, seed: 11 }, { id: 6, seed: 12 }, { id: 7, seed: 13 }]));
    expect(mergePile([r(5, 11)]).seed).not.toBe(pile.seed);
  });
});
