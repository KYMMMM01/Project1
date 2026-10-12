/**
 * The gold dungeon's rules: who may enter which tier, how many entries a day holds, and what a run
 * pays. Pure functions of the stats and of the day's counters; the profile applies the results.
 */
import { GOLD_DUNGEON_WAVES, goldDungeonSpawns } from '@/game/data/goldDungeon';
import {
  DUNGEON_CHEST_GOLD,
  DUNGEON_EXTRA_ENTRIES,
  DUNGEON_FREE_ENTRIES,
  DUNGEON_KILL_GOLD,
  DUNGEON_TIERS,
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
  /** The chest fell (it is the last wave's target, so this is the victory). */
  victory: boolean;
}

let spawns = 0;

/** Enemies the script spawns: the most kills a run can have (`goldDungeonSpawns`, worked out once). */
function maxKills(): number {
  spawns ||= goldDungeonSpawns();
  return spawns;
}

/**
 * What a run pays, in one formula: (the waves cleared + KILL x the kills + CHEST for a win) x the tier's multiplier. The kills are held to what
 * the script can spawn, so a run saved under an older, longer script (a pending run) cannot pay more than a full clear of this one.
 */
export function dungeonGold(run: DungeonRun): number {
  const kills = Math.min(maxKills(), Math.max(0, Number.isFinite(run.kills) ? run.kills : 0));
  const raw = (dungeonWaveGold(run.wavesCleared) + DUNGEON_KILL_GOLD * kills + (run.victory ? DUNGEON_CHEST_GOLD : 0)) * chapterMult(run.tier);
  return Math.round(raw);
}

/** The chest's share of a win's pay at this tier: what the same run would have paid without it. */
export function dungeonChestGold(run: DungeonRun): number {
  return run.victory ? dungeonGold(run) - dungeonGold({ ...run, victory: false }) : 0;
}

/** The most a tier pays for a run: every wave cleared, every enemy killed and the chest opened. */
export function dungeonMaxGold(tier: number): number {
  return dungeonGold({ tier, wavesCleared: GOLD_DUNGEON_WAVES, kills: maxKills(), victory: true });
}

/** The chest's share of a full clear at this tier, for the card and the pre-run page. */
export function dungeonMaxChest(tier: number): number {
  return dungeonChestGold({ tier, wavesCleared: GOLD_DUNGEON_WAVES, kills: maxKills(), victory: true });
}

/** Tier n opens when chapter n is cleared at butler level 0. */
export function dungeonTierOpen(cleared: readonly number[], tier: number): boolean {
  return Number.isInteger(tier) && tier >= 1 && tier <= DUNGEON_TIERS && tier <= chaptersCleared(cleared);
}

/** The highest open tier, 0 while none is. */
export function dungeonTopTier(cleared: readonly number[]): number {
  return Math.min(DUNGEON_TIERS, chaptersCleared(cleared));
}

/**
 * Entries a day holds: the free ones and those bought on top, less the ones used. A day that holds more bought ones than the rules sell now
 * (one bought under the old rules, which sold one) still honours what was paid for.
 */
export function dungeonEntriesLeft(day: DungeonDay): number {
  return Math.max(0, DUNGEON_FREE_ENTRIES + day.bought - day.used);
}

/** Whether another entry may be bought today (never while no extra entry is sold). */
export function dungeonCanBuy(day: DungeonDay): boolean {
  return day.bought < DUNGEON_EXTRA_ENTRIES;
}
