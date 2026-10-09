/** What a run request will actually play, resolved the same way the meta layer's `prepareRun` does. Pure. */
import type { BattleMode, DailyModifierId } from '@/game';
import { CHAPTERS, MAX_STAKE } from '@/game/data/roster';
import { chaptersCleared } from '@/meta/rewards';
import type { StartRunRequest } from '../contract';

export interface RunPlanInput {
  /** `profile.data.cleared`. */
  cleared: readonly number[];
  /** Today's daily setup (`profile.dailyView().setup`). */
  daily: { chapter: number; modifiers: readonly DailyModifierId[] };
}

export interface RunPlan {
  mode: BattleMode;
  chapter: number;
  stake: number;
  modifiers: readonly DailyModifierId[];
  /** The tutorial, the daily challenge and the gold dungeon have no pre-run snack. */
  snackAllowed: boolean;
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.round(v)));
}

export function planRun(request: StartRunRequest, input: RunPlanInput): RunPlan {
  const last = CHAPTERS.length;
  switch (request.mode) {
    case 'tutorial':
      return { mode: 'tutorial', chapter: 1, stake: 0, modifiers: [], snackAllowed: false };
    case 'daily':
      return { mode: 'daily', chapter: input.daily.chapter, stake: 0, modifiers: input.daily.modifiers, snackAllowed: false };
    case 'endless': {
      const top = chaptersCleared(input.cleared);
      return { mode: 'endless', chapter: clampInt(request.chapter ?? top, 1, Math.max(1, Math.min(top, last))), stake: 0, modifiers: [], snackAllowed: true };
    }
    case 'gold':
      return { mode: 'gold', chapter: clampInt(request.chapter ?? 1, 1, last), stake: 0, modifiers: [], snackAllowed: false };
    case 'chapter':
      return {
        mode: 'chapter',
        chapter: clampInt(request.chapter ?? 1, 1, last),
        stake: clampInt(request.stake ?? 0, 0, MAX_STAKE),
        modifiers: [],
        snackAllowed: true,
      };
  }
}
