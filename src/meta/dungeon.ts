/**
 * The gold dungeon's rules: who may enter which tier, how many entries a day holds, and what a run
 * pays. Pure functions of the stats and of the day's counters; the profile applies the results.
 */
import { GOLD_DUNGEON_WAVES, goldDungeonSpawns } from '@/game/data/goldDungeon';
import {
  DUNGEON_EXTRA_ENTRIES,
  DUNGEON_FIRST_CLEAR_GOLD,
  DUNGEON_FREE_ENTRIES,
  DUNGEON_KILL_GOLD,
  DUNGEON_TIERS,
  DUNGEON_VICTORY_MULT,
  DUNGEON_WAVE_BASE,
  DUNGEON_WAVE_STEP,
} from './data/dungeon';
import { chapterMult, chaptersCleared } from './rewards';
import type { DungeonDay } from './types';

/** Gold of the waves cleared: the first pays WAVE_BASE + WAVE_STEP, each one after it WAVE_STEP more. */
export function dungeonWaveGold(wavesCleared: number): number {
  const w = Math.min(GOLD_DUNGEON_WAVES, Math.max(0, Math.floor(wavesCleared)));
  return DUNGEON_WAVE_BASE * w + (DUNGEON_WAVE_STEP * w * (w + 1)) / 2;
}

export interface DungeonRun {
  tier: number;
  wavesCleared: number;
  kills: number;
  victory: boolean;
}

/** What a run pays before the first-clear bonus. */
export function dungeonGold(run: DungeonRun): number {
  const raw = (dungeonWaveGold(run.wavesCleared) + DUNGEON_KILL_GOLD * Math.max(0, run.kills)) * chapterMult(run.tier);
  return Math.round(raw * (run.victory ? DUNGEON_VICTORY_MULT : 1));
}

/** The bonus of the first victory of a day. */
export function dungeonFirstClearGold(tier: number): number {
  return Math.round(DUNGEON_FIRST_CLEAR_GOLD * chapterMult(tier));
}

let spawns = 0;

/** The most a tier pays for a run: every wave cleared and every enemy killed (without the bonus). */
export function dungeonMaxGold(tier: number): number {
  spawns ||= goldDungeonSpawns();
  return dungeonGold({ tier, wavesCleared: GOLD_DUNGEON_WAVES, kills: spawns, victory: true });
}

/** Tier n opens when chapter n is cleared at butler level 0. */
export function dungeonTierOpen(cleared: readonly number[], tier: number): boolean {
  return Number.isInteger(tier) && tier >= 1 && tier <= DUNGEON_TIERS && tier <= chaptersCleared(cleared);
}

/** The highest open tier, 0 while none is. */
export function dungeonTopTier(cleared: readonly number[]): number {
  return Math.min(DUNGEON_TIERS, chaptersCleared(cleared));
}

/** Entries a day holds: the free ones and the one that can be bought. */
export function dungeonEntriesLeft(day: DungeonDay): number {
  return Math.max(0, DUNGEON_FREE_ENTRIES + day.bought - day.used);
}

export function dungeonCanBuy(day: DungeonDay): boolean {
  return day.bought < DUNGEON_EXTRA_ENTRIES;
}
