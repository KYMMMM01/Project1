/** What a won result screen offers as "next": a pure decision from the profile after the run was paid out. */
import { CHAPTERS, MAX_STAKE } from '@/game/data/roster';
import { canPlayStake } from '@/meta/rewards';
import type { RunReward } from '@/meta/types';

/** The run that was just finished, as the profile recorded it (`profile.data.lastRun`). */
export type FinishedRun = Pick<RunReward, 'mode' | 'chapter' | 'stake' | 'victory' | 'firstClear'>;

export interface NextPlan {
  chapter: number;
  stake: number;
}

/** The highest butler level of a chapter the player may start, or -1 when the chapter is still locked. */
function highestPlayable(cleared: readonly number[], chapter: number): number {
  for (let stake = MAX_STAKE; stake >= 0; stake--) if (canPlayStake(cleared, chapter, stake)) return stake;
  return -1;
}

/**
 * Where a victory leads on. `cleared` is `profile.data.cleared` after the payout, so the unlocks this run
 * earned are already in it. Nothing for a defeat, a daily or an endless run; the tutorial leads to chapter 1.
 * A chapter run leads to the next chapter at the same butler level when the player may play it there, else
 * at the highest level they may play; the last chapter leads to its next butler level when this win unlocked it.
 */
export function nextRunPlan(cleared: readonly number[], run: FinishedRun | null): NextPlan | null {
  if (!run || !run.victory) return null;
  if (run.mode === 'tutorial') return { chapter: 1, stake: 0 };
  if (run.mode !== 'chapter') return null;
  if (run.chapter < CHAPTERS.length) {
    const chapter = run.chapter + 1;
    if (canPlayStake(cleared, chapter, run.stake)) return { chapter, stake: run.stake };
    const stake = highestPlayable(cleared, chapter);
    return stake >= 0 ? { chapter, stake } : null;
  }
  const stake = run.stake + 1;
  return run.firstClear && stake <= MAX_STAKE && canPlayStake(cleared, run.chapter, stake) ? { chapter: run.chapter, stake } : null;
}
