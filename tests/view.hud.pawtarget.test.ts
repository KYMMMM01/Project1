import { describe, expect, it } from 'vitest';
import type { UnitId } from '@/game';
import { firstCat, kingCell, shadeCat, sunLanding, twinPair, weakestCat } from '@/view/hud/pawTarget';

/** A board of 10 cells from `{ cell: id }`. */
const board = (cats: Record<number, UnitId>): Array<{ id: UnitId } | null> => Array.from({ length: 10 }, (_, c) => (cats[c] ? { id: cats[c] as UnitId } : null));

describe('the weakest cat (molt and sell)', () => {
  it('is the lowest rank, the first of them, and never the king while another cat stands', () => {
    expect(weakestCat(board({ 0: 'w_samurai', 3: 'w_sword', 5: 'r_sling', 7: 'm_snow' }))).toBe(5);
    expect(weakestCat(board({ 0: 'w_samurai', 4: 'w_sword' }))).toBe(4);
    expect(weakestCat(board({ 2: 'w_samurai' }))).toBe(2);
    expect(weakestCat(board({}))).toBe(-1);
  });

  it('stays on the cat it chose while that cat is still among the weakest, whatever arrives in an earlier cell', () => {
    const first = board({ 3: 'w_sword', 5: 'r_sling' });
    const at = weakestCat(first);
    expect(at).toBe(5);
    // a kitten arrives in cell 1: the old choice (first lowest) jumped to it, and the paw with it
    const next = board({ 1: 'm_snow', 3: 'w_sword', 5: 'r_sling' });
    expect(weakestCat(next)).toBe(1);
    expect(weakestCat(next, at)).toBe(5);
    // but a cat that is no longer the weakest, or is gone, is let go
    expect(weakestCat(board({ 1: 'm_snow', 3: 'w_sword' }), 3)).toBe(1);
    expect(weakestCat(board({ 1: 'm_snow' }), 5)).toBe(1);
  });
});

describe('the cat of a lesson about the button that follows', () => {
  it('is the first one on the board', () => {
    expect(firstCat(board({ 4: 'w_paw', 2: 'r_sling' }))).toBe(2);
    expect(firstCat(board({}))).toBe(-1);
  });
});

describe('the king that can awaken', () => {
  const ready = (cells: number[]) => (c: number): boolean => cells.includes(c);

  it('is a legendary the game says can awaken now, not just any legendary', () => {
    const b = board({ 0: 'w_samurai', 2: 'r_gunner', 5: 'w_sword' });
    expect(kingCell(b, ready([2]))).toBe(2);
    expect(kingCell(b, ready([0, 2]))).toBe(0);
    expect(kingCell(b, ready([5]))).toBe(-1);
    expect(kingCell(b, ready([]))).toBe(-1);
  });

  it('keeps the king it chose (or the one the player selected) while it can still awaken', () => {
    const b = board({ 0: 'w_samurai', 2: 'r_gunner' });
    expect(kingCell(b, ready([0, 2]), 2)).toBe(2);
    expect(kingCell(b, ready([0]), 2)).toBe(0);
  });
});

describe('the pair the paw drags', () => {
  it('is the first pair of twins that can merge', () => {
    expect(twinPair(board({ 1: 'w_paw', 4: 'w_paw', 6: 'r_sling', 8: 'r_sling' }))).toEqual([1, 4]);
    expect(twinPair(board({ 1: 'w_paw', 4: 'r_sling' }))).toBeNull();
    // two kings are twins but never merge
    expect(twinPair(board({ 1: 'w_samurai', 4: 'w_samurai' }))).toBeNull();
  });

  it('stays with its pair while both still hold twins, however many pairs there are (it used to hop to the earliest pair)', () => {
    const had = twinPair(board({ 4: 'w_paw', 6: 'w_paw' })) as [number, number];
    expect(had).toEqual([4, 6]);
    const later = board({ 1: 'r_sling', 4: 'w_paw', 6: 'w_paw', 8: 'r_sling' });
    expect(twinPair(later)).toEqual([1, 8]);
    expect(twinPair(later, had)).toEqual([4, 6]);
    // when one of them is gone (the player moved it), the first pair is the answer
    expect(twinPair(board({ 1: 'r_sling', 4: 'w_paw', 8: 'r_sling' }), had)).toEqual([1, 8]);
    expect(twinPair(board({ 4: 'w_paw', 6: 'w_sword' }), had)).toBeNull();
  });
});

describe('the cat carried into the sun', () => {
  const lit = (cells: number[]) => (c: number): boolean => cells.includes(c);

  it('is a cat in the shade, kept while it stays there', () => {
    const b = board({ 0: 'w_paw', 3: 'r_sling', 6: 'm_snow' });
    expect(shadeCat(b, lit([0]))).toBe(3);
    expect(shadeCat(b, lit([0, 3, 6]))).toBe(-1);
    expect(shadeCat(b, lit([0]), 6)).toBe(6);
    expect(shadeCat(b, lit([0, 6]), 6)).toBe(3);
  });

  it('lands on an empty special cell first, otherwise on one with another cat (a swap), never on its own', () => {
    const b = board({ 0: 'w_paw', 2: 'r_sling', 4: 'm_snow' });
    expect(sunLanding(b, [2, 4, 6], 0)).toBe(6);
    expect(sunLanding(b, [2, 4], 0)).toBe(2);
    expect(sunLanding(b, [0, 2], 0)).toBe(2);
    expect(sunLanding(b, [0], 0)).toBe(-1);
  });

  it('keeps the cell it chose while that cell is still empty, or still taken with nothing empty to prefer', () => {
    const b = board({ 0: 'w_paw', 2: 'r_sling' });
    // two empty cells: the first is chosen; a later pick that remembers it does not change its mind when the earlier one is not better
    expect(sunLanding(b, [5, 6], 0)).toBe(5);
    expect(sunLanding(b, [5, 6], 0, 6)).toBe(6);
    // a taken cell is kept only while no cell has come free
    expect(sunLanding(b, [2, 3], 0, 2)).toBe(3);
    expect(sunLanding(board({ 0: 'w_paw', 2: 'r_sling', 3: 'm_snow' }), [2, 3], 0, 3)).toBe(3);
    expect(sunLanding(b, [2, 3], 0, 0)).toBe(3);
  });
});
