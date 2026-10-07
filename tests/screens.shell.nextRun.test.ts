import { describe, expect, it } from 'vitest';
import { nextRunPlan, type FinishedRun } from '@/app/nextRun';
import { CHAPTERS, MAX_STAKE } from '@/game/data/roster';

const LAST = CHAPTERS.length;

/** `cleared[c - 1]` = stakes cleared in a row in chapter c; the first `n` chapters share `value`. */
function cleared(...perChapter: number[]): number[] {
  return Array.from({ length: LAST }, (_, i) => perChapter[i] ?? 0);
}

function win(chapter: number, stake: number, firstClear = true): FinishedRun {
  return { mode: 'chapter', chapter, stake, victory: true, firstClear };
}

describe('nextRunPlan', () => {
  it('leads from a first clear to the next chapter at the same level', () => {
    expect(nextRunPlan(cleared(1), win(1, 0))).toEqual({ chapter: 2, stake: 0 });
    expect(nextRunPlan(cleared(2, 1), win(2, 0, false))).toEqual({ chapter: 3, stake: 0 });
  });

  it('keeps the butler level when the next chapter may be played there', () => {
    // Chapter 2 is cleared up to level 2 already: level 2 is playable there.
    expect(nextRunPlan(cleared(4, 3), win(1, 2, false))).toEqual({ chapter: 2, stake: 2 });
    // Chapter 1 won at level 3 while chapter 2 has only level 0 cleared (cleared = 1): the highest playable level there is 1.
    expect(nextRunPlan(cleared(4, 1), win(1, 3, false))).toEqual({ chapter: 2, stake: 1 });
  });

  it('falls back to level 0 when the next chapter has just opened', () => {
    expect(nextRunPlan(cleared(1, 0), win(1, 0))).toEqual({ chapter: 2, stake: 0 });
  });

  it('never offers a locked chapter or a level above what is playable', () => {
    for (let chapter = 1; chapter < LAST; chapter++) {
      for (let stake = 0; stake <= MAX_STAKE; stake++) {
        const state = cleared(...Array.from({ length: chapter }, () => stake + 1));
        const plan = nextRunPlan(state, win(chapter, stake));
        expect(plan, `${chapter}/${stake}`).not.toBeNull();
        if (!plan) continue;
        expect(plan.chapter).toBe(chapter + 1);
        expect(plan.stake).toBeLessThanOrEqual(stake);
        expect(plan.stake).toBeLessThanOrEqual(state[plan.chapter - 1] ?? 0);
      }
    }
  });

  it('after the last chapter, offers the next butler level only when this win unlocked it', () => {
    expect(nextRunPlan(cleared(...Array(LAST).fill(1)), win(LAST, 0))).toEqual({ chapter: LAST, stake: 1 });
    expect(nextRunPlan(cleared(...Array(LAST).fill(3)), win(LAST, 2))).toEqual({ chapter: LAST, stake: 3 });
    // A repeat of a level whose successor was beaten long ago has nothing new.
    expect(nextRunPlan(cleared(...Array(LAST).fill(4)), win(LAST, 1, false))).toBeNull();
  });

  it('has nothing after the top butler level of the last chapter', () => {
    expect(nextRunPlan(cleared(...Array(LAST).fill(MAX_STAKE + 1)), win(LAST, MAX_STAKE))).toBeNull();
  });

  it('leads from the tutorial to chapter 1 and from nothing else', () => {
    expect(nextRunPlan(cleared(), { mode: 'tutorial', chapter: 1, stake: 0, victory: true, firstClear: false })).toEqual({ chapter: 1, stake: 0 });
    expect(nextRunPlan(cleared(1), { mode: 'daily', chapter: 2, stake: 0, victory: true, firstClear: true })).toBeNull();
    expect(nextRunPlan(cleared(1), { mode: 'endless', chapter: 1, stake: 0, victory: true, firstClear: false })).toBeNull();
  });

  it('has nothing after a defeat or before any run', () => {
    expect(nextRunPlan(cleared(1), { ...win(1, 0), victory: false })).toBeNull();
    expect(nextRunPlan(cleared(1), null)).toBeNull();
  });
});
