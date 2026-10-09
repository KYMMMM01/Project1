/**
 * Recurring content: missions, the 28-day calendar, the season pass, the weekly cup, endless tiers,
 * the daily challenge setup and the feature unlock rules. Data only.
 */
import type { DailyModifierId } from '@/game/api';
import { MODIFIER_IDS } from '@/game/data/modifiers';
import type { Bundle } from '../types';

// ───────────────────────────── missions ─────────────────────────────

export type MissionMetric = 'runs' | 'merges' | 'bosses' | 'relics' | 'wins' | 'dailyChests';

export interface MissionDef {
  id: string;
  metric: MissionMetric;
  target: number;
  /** Daily missions add points toward the day's chest. */
  points: number;
  reward: Bundle;
}

export const DAILY_MISSIONS: readonly MissionDef[] = [
  { id: 'd_runs', metric: 'runs', target: 3, points: 30, reward: { gold: 150 } },
  { id: 'd_merges', metric: 'merges', target: 20, points: 20, reward: { gold: 150 } },
  { id: 'd_bosses', metric: 'bosses', target: 4, points: 20, reward: { gold: 150 } },
  { id: 'd_relics', metric: 'relics', target: 5, points: 15, reward: { gold: 150 } },
  { id: 'd_wins', metric: 'wins', target: 1, points: 15, reward: { gold: 150 } },
];
/** 100 points: silver chest + 20 gems. */
export const DAILY_CHEST_REWARD: Bundle = { chests: { silver: 1 }, gems: 20 };

export const WEEKLY_MISSIONS: readonly MissionDef[] = [
  { id: 'w_runs', metric: 'runs', target: 21, points: 0, reward: { gold: 400 } },
  { id: 'w_merges', metric: 'merges', target: 300, points: 0, reward: { gold: 400 } },
  { id: 'w_bosses', metric: 'bosses', target: 35, points: 0, reward: { gold: 400 } },
  { id: 'w_wins', metric: 'wins', target: 15, points: 0, reward: { gold: 400 } },
  { id: 'w_chests', metric: 'dailyChests', target: 5, points: 0, reward: { gold: 400 } },
];
export const WEEKLY_CHEST_REWARD: Bundle = { chests: { gold: 1 } };

// ───────────────────────────── 28-day calendar ─────────────────────────────

export const CALENDAR_DAYS = 28;

/** Day n (1-based) = CALENDAR[n - 1]. Days 7/14/21 are gold chests, day 28 a rug skin. */
export const CALENDAR: readonly Bundle[] = [
  { gold: 300 },
  { gems: 10 },
  { chests: { wooden: 1 } },
  { gold: 480 },
  { tickets: 2 },
  { gems: 10 },
  { chests: { gold: 1 } },
  { gold: 600 },
  { wild: { rare: 3 } },
  { gems: 15 },
  { chests: { wooden: 1 } },
  { gold: 720 },
  { tickets: 3 },
  { chests: { gold: 1 } },
  { gold: 900 },
  { gems: 15 },
  { chests: { wooden: 2 } },
  { wild: { epic: 2 } },
  { gems: 15 },
  { gold: 1200 },
  { chests: { gold: 1 } },
  { gems: 15 },
  { chests: { wooden: 1 } },
  { wild: { epic: 3 } },
  { gold: 1500 },
  { gems: 20 },
  { chests: { wooden: 2 } },
  { gems: 30, cosmetics: ['rug_calendar'] },
];

// ───────────────────────────── season pass ─────────────────────────────

export const PASS_TIERS = 30;
export const PASS_XP_PER_TIER = 100;
export const SEASON_DAYS = 30;
/** Season 0 starts on this local date; later seasons follow back to back. */
export const SEASON_EPOCH = '2026-10-01';

/** Free row: 150 gems in total (every 5th tier), gold and wooden chests between. */
export function passFreeReward(tier: number): Bundle {
  if (tier % 5 === 0) return { gems: 25 };
  return tier % 4 === 0 ? { chests: { wooden: 1 } } : { gold: 400 };
}

/** Premium row: 1,200 gems, 6 silver and 3 gold chests, the season rug at the end. */
export function passPremiumReward(tier: number): Bundle {
  const b: Bundle = { gems: 40 };
  if (tier % 4 === 0 && tier <= 24) b.chests = { silver: 1 };
  if (tier % 10 === 0) b.chests = { ...b.chests, gold: 1 };
  if (tier === PASS_TIERS) b.cosmetics = ['rug_season'];
  return b;
}

// ───────────────────────────── daily treat ─────────────────────────────

/** "오늘의 간식": three slots, one rewarded ad each. */
export const TREAT_REWARDS: readonly Bundle[] = [{ gems: 8 }, { wild: { rare: 1 } }, { gold: 300 }];

// ───────────────────────────── weekly cup / endless ─────────────────────────────

export interface CupTier {
  /** Sum of the week's best daily-challenge waves needed. */
  min: number;
  reward: Bundle;
}

/** The best week scores 7 x DAILY_WAVES = 112; the tiers sit at 29% / 61% / 89% of it. */
export const CUP_TIERS: readonly CupTier[] = [
  { min: 32, reward: { chests: { wooden: 1 } } },
  { min: 68, reward: { chests: { silver: 1 } } },
  { min: 100, reward: { chests: { gold: 1 }, gems: 50 } },
];

export interface EndlessTier {
  wave: number;
  reward: Bundle;
}

export const ENDLESS_TIERS: readonly EndlessTier[] = [
  { wave: 40, reward: { chests: { gold: 1 } } },
  { wave: 60, reward: { chests: { gold: 1 }, gems: 30 } },
  { wave: 80, reward: { chests: { gold: 1 }, gems: 60 } },
];

// ───────────────────────────── daily challenge ─────────────────────────────

/** The battle's own length: the cup tiers and the daily card must never promise more waves than the sim plays. */
export { DAILY_WAVES } from '@/game/data/balance';
export const DAILY_UNIT_LEVEL = 5;
/** Bump when the simulation or the modifier list changes: yesterday's code must not mean a new game. */
export const DAILY_RULESET = 1;
export const DAILY_CHAPTER_POOL: readonly number[] = [1, 2, 3];
/** The rule variants the battle knows (its own list, so the two never drift). */
export const DAILY_MODIFIERS: readonly DailyModifierId[] = MODIFIER_IDS;
export const DAILY_FIRST_CLEAR: Bundle = { chests: { silver: 1 } };

/** Chest of the first clear of a stake (index = stake): a gold chest at stake 0 (GDD 7.4), then lighter ones. */
export const FIRST_CLEAR_CHEST: readonly Bundle[] = [
  { chests: { gold: 1 } },
  { chests: { wooden: 2 } },
  { chests: { wooden: 2 } },
  { chests: { wooden: 3 } },
  { chests: { wooden: 3 } },
  { chests: { silver: 1 } },
];

// ───────────────────────────── feature unlocks ─────────────────────────────

export const FEATURES = [
  'speed2x', 'cats', 'patrol', 'missions', 'shop', 'treat', 'piggy', 'cosmetics',
  'pass', 'daily', 'sweep', 'cup', 'endless', 'speed3x', 'dungeon',
] as const;
export type FeatureId = (typeof FEATURES)[number];

export interface FeatureRule {
  /** Completed runs (the tutorial counts). */
  runs?: number;
  accountLevel?: number;
  /** Chapter number whose stake 0 must be cleared. */
  chapter?: number;
  butler?: boolean;
}

export const FEATURE_RULES: Readonly<Record<FeatureId, FeatureRule>> = {
  speed2x: { runs: 1 },
  cats: { runs: 1 },
  patrol: { runs: 1 },
  missions: { runs: 3 },
  shop: { runs: 3 },
  treat: { runs: 3 },
  piggy: { runs: 3 },
  cosmetics: { runs: 3 },
  pass: { runs: 1 },
  daily: { chapter: 1 },
  sweep: { chapter: 1 },
  cup: { chapter: 1 },
  endless: { chapter: 2 },
  speed3x: { butler: true },
  dungeon: { chapter: 1 },
};
