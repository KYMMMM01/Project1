import { describe, expect, it } from 'vitest';
import {
  PROMO_WINDOW_MS,
  badgeCount,
  bestStake,
  cardsVisible,
  chapterUnlocked,
  clampSelection,
  cupProgress,
  frontier,
  promoVisible,
  selectionAfterRun,
  stakePlayable,
  sweepable,
} from '@/screens/battle/model';

const FRESH = [0, 0, 0, 0, 0];

describe('battle tab selection rules', () => {
  it('opens chapters in order', () => {
    expect(chapterUnlocked(FRESH, 1)).toBe(true);
    expect(chapterUnlocked(FRESH, 2)).toBe(false);
    expect(chapterUnlocked([1, 0, 0, 0, 0], 2)).toBe(true);
    expect(chapterUnlocked([1, 0, 0, 0, 0], 3)).toBe(false);
    expect(chapterUnlocked([6, 6, 6, 6, 6], 6)).toBe(false);
    expect(chapterUnlocked([6, 6, 6, 6, 6], 0)).toBe(false);
  });

  it('allows a butler level one step beyond the last one cleared', () => {
    expect(stakePlayable(FRESH, 1, 0)).toBe(true);
    expect(stakePlayable(FRESH, 1, 1)).toBe(false);
    expect(stakePlayable([2, 0, 0, 0, 0], 1, 2)).toBe(true);
    expect(stakePlayable([2, 0, 0, 0, 0], 1, 3)).toBe(false);
    expect(stakePlayable([0, 0, 0, 0, 0], 2, 0)).toBe(false);
  });

  it('reports the best level cleared, -1 when none', () => {
    expect(bestStake(FRESH, 1)).toBe(-1);
    expect(bestStake([1, 0, 0, 0, 0], 1)).toBe(0);
    expect(bestStake([6, 0, 0, 0, 0], 1)).toBe(5);
  });

  it('sweeps only cleared levels', () => {
    expect(sweepable([1, 0, 0, 0, 0], 1, 0)).toBe(true);
    expect(sweepable([1, 0, 0, 0, 0], 1, 1)).toBe(false);
    expect(sweepable(FRESH, 1, 0)).toBe(false);
    expect(sweepable([2, 0, 0, 0, 0], 2, 0)).toBe(false);
  });

  it('starts on the first thing not yet beaten', () => {
    expect(frontier(FRESH)).toEqual({ chapter: 1, stake: 0 });
    expect(frontier([3, 0, 0, 0, 0])).toEqual({ chapter: 2, stake: 0 });
    expect(frontier([6, 6, 2, 0, 0])).toEqual({ chapter: 4, stake: 0 });
    expect(frontier([6, 6, 6, 6, 6])).toEqual({ chapter: 5, stake: 5 });
    expect(frontier([6, 6, 6, 6, 3])).toEqual({ chapter: 5, stake: 3 });
  });

  it('clamps a selection to a chapter in range and a level the player may start', () => {
    expect(clampSelection(FRESH, { chapter: 9, stake: 9 })).toEqual({ chapter: 5, stake: 0 });
    expect(clampSelection(FRESH, { chapter: 0, stake: -3 })).toEqual({ chapter: 1, stake: 0 });
    expect(clampSelection([3, 0, 0, 0, 0], { chapter: 1, stake: 5 })).toEqual({ chapter: 1, stake: 3 });
    // a locked chapter can be looked at, at its base level
    expect(clampSelection(FRESH, { chapter: 3, stake: 2 })).toEqual({ chapter: 3, stake: 0 });
  });

  it('moves on to the next chapter after a first clear, otherwise to the next level to beat', () => {
    const cur = { chapter: 1, stake: 0 };
    expect(selectionAfterRun([1, 0, 0, 0, 0], { mode: 'chapter', chapter: 1, stake: 0, firstClear: true }, cur)).toEqual({ chapter: 2, stake: 0 });
    expect(selectionAfterRun([3, 0, 0, 0, 0], { mode: 'chapter', chapter: 1, stake: 2, firstClear: true }, { chapter: 1, stake: 2 })).toEqual({ chapter: 1, stake: 3 });
    expect(selectionAfterRun([2, 0, 0, 0, 0], { mode: 'chapter', chapter: 1, stake: 2, firstClear: false }, { chapter: 1, stake: 2 })).toEqual({ chapter: 1, stake: 2 });
    expect(selectionAfterRun([6, 6, 6, 6, 6], { mode: 'chapter', chapter: 5, stake: 5, firstClear: true }, { chapter: 5, stake: 5 })).toEqual({ chapter: 5, stake: 5 });
    expect(selectionAfterRun([1, 0, 0, 0, 0], { mode: 'daily', chapter: 4, stake: 0, firstClear: false }, { chapter: 1, stake: 0 })).toEqual({ chapter: 1, stake: 0 });
  });
});

describe('battle tab cards', () => {
  it('shows the cards once the tutorial is done', () => {
    expect(cardsVisible(0)).toBe(false);
    expect(cardsVisible(1)).toBe(true);
  });

  it('keeps the first-purchase card for 72 hours from its first appearance', () => {
    const t0 = 1_700_000_000_000;
    expect(promoVisible(0, t0)).toBe(false);
    expect(promoVisible(t0, t0)).toBe(true);
    expect(promoVisible(t0, t0 + PROMO_WINDOW_MS - 1)).toBe(true);
    expect(promoVisible(t0, t0 + PROMO_WINDOW_MS)).toBe(false);
    expect(promoVisible(t0, t0 - 1)).toBe(false);
  });

  it('counts what waits to be collected for the tab badge', () => {
    expect(badgeCount({ patrol: false, chest: false, calendar: false, cup: 0, endless: 0 })).toBe(0);
    expect(badgeCount({ patrol: true, chest: true, calendar: true, cup: 2, endless: 1 })).toBe(6);
  });

  it('measures progress toward the next weekly cup prize', () => {
    const tiers = [{ need: 40 }, { need: 85 }, { need: 125 }];
    expect(cupProgress(0, tiers)).toEqual({ next: 40, fraction: 0 });
    expect(cupProgress(20, tiers)).toEqual({ next: 40, fraction: 0.5 });
    expect(cupProgress(40, tiers)).toEqual({ next: 85, fraction: 0 });
    expect(cupProgress(62.5, tiers).fraction).toBeCloseTo(0.5, 5);
    expect(cupProgress(200, tiers)).toEqual({ next: null, fraction: 1 });
    expect(cupProgress(5, [])).toEqual({ next: null, fraction: 1 });
  });
});
