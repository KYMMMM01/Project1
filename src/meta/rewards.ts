/**
 * What a finished run pays, who may play what, and what a sweep pays. Pure functions of RunStats and
 * of the progress array; the profile applies the results.
 */
import type { RunStats } from '@/game/api';
import { Rng } from '@/core/rng';
import { MAX_STAKE } from '@/game/data/roster';
import {
  CHAPTER_COUNT,
  CHAPTER_MULT,
  CHAPTER_WAVES,
  CONSOLATION_CARDS,
  CONSOLATION_WAVES,
  FIRST_CLEAR_GEMS_BASE,
  FIRST_CLEAR_GEMS_STEP,
  RUN_GOLD_BASE,
  RUN_GOLD_PER_WAVE,
  STAKE_STEP,
  SWEEP_PAYOUT,
  VICTORY_MULT,
  XP_BASE,
  XP_PER_WAVE,
} from './data/economy';
import { DAILY_FIRST_CLEAR, FIRST_CLEAR_CHEST } from './data/schedule';
import { mergeBundles } from './bundle';
import { UNITS_BY_RARITY } from './units';
import type { BaseUnitId, Bundle } from './types';

export function chapterMult(chapter: number): number {
  return CHAPTER_MULT[Math.min(CHAPTER_MULT.length, Math.max(1, chapter)) - 1] ?? 1;
}

/** Gold = (40 + 14 x waves cleared) x chapter multiplier x (1 + 0.15 x stake) x (victory ? 1.25 : 1). */
export function runGold(wavesCleared: number, chapter: number, stake: number, victory: boolean): number {
  const raw = (RUN_GOLD_BASE + RUN_GOLD_PER_WAVE * Math.max(0, wavesCleared)) * chapterMult(chapter) * (1 + STAKE_STEP * stake);
  return Math.round(raw * (victory ? VICTORY_MULT : 1));
}

/** Account XP and pass XP of a run. */
export function runXp(wavesCleared: number): number {
  return XP_BASE + XP_PER_WAVE * Math.max(0, wavesCleared);
}

/** First clear of (chapter, stake): gems by stake and the chest of that stake. */
export function firstClearBundle(stake: number): Bundle {
  return mergeBundles({ gems: FIRST_CLEAR_GEMS_BASE + FIRST_CLEAR_GEMS_STEP * stake }, FIRST_CLEAR_CHEST[stake] ?? {});
}

/** Whether a stake of a chapter can be played, given `cleared` (stakes cleared in a row per chapter). */
export function canPlayStake(cleared: readonly number[], chapter: number, stake: number): boolean {
  if (chapter < 1 || chapter > CHAPTER_COUNT || stake < 0 || stake > MAX_STAKE) return false;
  if (stake > (cleared[chapter - 1] ?? 0)) return false;
  return chapter === 1 || (cleared[chapter - 2] ?? 0) >= 1;
}

export function isFirstClear(cleared: readonly number[], chapter: number, stake: number): boolean {
  return (cleared[chapter - 1] ?? 0) === stake && stake <= MAX_STAKE;
}

/** How many chapters are cleared at stake 0, counted from the first. */
export function chaptersCleared(cleared: readonly number[]): number {
  let n = 0;
  while (n < CHAPTER_COUNT && (cleared[n] ?? 0) >= 1) n++;
  return n;
}

export interface RunPayout {
  gold: number;
  xp: number;
  /** Chests, gems and cards on top of gold and XP (not doubled by the result-screen offer). */
  bundle: Bundle;
  firstClear: boolean;
  /** The daily challenge's one silver chest per day. */
  dailyFirstClear: boolean;
}

export interface RunContext {
  cleared: readonly number[];
  dailyAlreadyCleared: boolean;
}

/**
 * Everything a run pays except what depends on records (piggy bank, best waves, cup): gold, XP,
 * the victory chest, the first-clear reward, the daily-challenge chest and the consolation cards.
 * The consolation cards are picked from the run's seed so replaying the same stats pays the same.
 */
export function computeRunPayout(stats: RunStats, ctx: RunContext): RunPayout {
  const gold = runGold(stats.wavesCleared, stats.chapter, stats.stake, stats.victory);
  const xp = runXp(stats.wavesCleared);
  let bundle: Bundle = {};
  let firstClear = false;
  let dailyFirstClear = false;

  if (stats.victory && (stats.mode === 'chapter' || stats.mode === 'tutorial')) bundle = { chests: { wooden: 1 } };
  if (stats.mode === 'chapter' && stats.victory && isFirstClear(ctx.cleared, stats.chapter, stats.stake)) {
    firstClear = true;
    bundle = mergeBundles(bundle, firstClearBundle(stats.stake));
    if (stats.stake === 0) bundle = mergeBundles(bundle, { cosmetics: ['rug_ch' + stats.chapter] });
  }
  if (stats.mode === 'daily' && stats.victory && !ctx.dailyAlreadyCleared) {
    dailyFirstClear = true;
    bundle = mergeBundles(bundle, DAILY_FIRST_CLEAR);
  }
  if (!stats.victory && stats.mode === 'chapter' && stats.wavesCleared >= CONSOLATION_WAVES) {
    bundle = mergeBundles(bundle, { cards: consolationCards(stats.seed) });
  }
  return { gold, xp, bundle, firstClear, dailyFirstClear };
}

/** Three common/rare cards for a defeat that got far enough. */
export function consolationCards(seed: number): Partial<Record<BaseUnitId, number>> {
  const rng = new Rng(seed ^ 0x5bd1e995);
  const out: Partial<Record<BaseUnitId, number>> = {};
  for (let i = 0; i < CONSOLATION_CARDS; i++) {
    const unit = rng.pick(UNITS_BY_RARITY[rng.chance(0.6) ? 'common' : 'rare']);
    out[unit] = (out[unit] ?? 0) + 1;
  }
  return out;
}

/** A sweep pays 60% of a full win of that chapter and stake. */
export function sweepPayout(chapter: number, stake: number): { gold: number; xp: number } {
  return {
    gold: Math.floor(runGold(CHAPTER_WAVES, chapter, stake, true) * SWEEP_PAYOUT),
    xp: Math.floor(runXp(CHAPTER_WAVES) * SWEEP_PAYOUT),
  };
}
