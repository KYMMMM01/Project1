/**
 * Shared types of the meta layer: ids, the reward bundle, command results and the persisted profile
 * schema (version 1). Rules live in the sibling modules; this file holds almost no logic.
 */
import type { AdCounters } from '@/platform/adPolicy';
import type { IapLedger } from '@/platform/iapService';
import type { BattleInit, BattleMode, BattleSnapshot } from '@/game/api';

// ───────────────────────────── ids ─────────────────────────────

/** The 16 units that have a collection level. Mythics follow their class legendary. */
export const BASE_UNITS = [
  'w_paw', 'w_sword', 'w_viking', 'w_samurai',
  'r_sling', 'r_archer', 'r_ninja', 'r_gunner',
  'm_snow', 'm_fire', 'm_storm', 'm_frost',
  't_bell', 't_chef', 't_bard', 't_alch',
] as const;
export type BaseUnitId = (typeof BASE_UNITS)[number];

/** Rarities a chest card can have (mythics only come from awakening). */
export const CHEST_RARITIES = ['common', 'rare', 'epic', 'legendary'] as const;
export type ChestRarity = (typeof CHEST_RARITIES)[number];

export const CHEST_KINDS = ['wooden', 'silver', 'gold'] as const;
export type ChestKind = (typeof CHEST_KINDS)[number];

export const CURRENCIES = ['gold', 'gems', 'tickets'] as const;
export type CurrencyId = (typeof CURRENCIES)[number];

export const TRAINING_IDS = ['start_fish', 'kill_fish', 'damage', 'boss_time', 'laser_cd', 'start_purr'] as const;
export type TrainingId = (typeof TRAINING_IDS)[number];

/** Why a currency moved. Shows up in the `currency` event and the analytics call. */
export type Reason =
  | 'run_reward' | 'run_double' | 'first_clear' | 'daily_clear' | 'sweep' | 'level_up' | 'training'
  | 'chest_buy' | 'chest_overflow' | 'chest_skip' | 'patrol' | 'patrol_double' | 'mission' | 'mission_chest'
  | 'weekly_mission' | 'calendar' | 'comeback' | 'treat' | 'snack_chest' | 'shop_buy' | 'shop_refresh'
  | 'ticket_buy' | 'ticket_ad' | 'ticket_daily' | 'pass_free' | 'pass_premium' | 'account_level' | 'cup'
  | 'endless' | 'cosmetic_buy' | 'piggy' | 'iap' | 'iap_revoke' | 'gem_pass' | 'offer_revive' | 'offer_double'
  | 'offer_snack' | 'offer_relic' | 'free_chest' | 'consolation';

// ───────────────────────────── rewards ─────────────────────────────

/** Anything a table can hand out. Every reward in the game is one of these. */
export interface Bundle {
  gold?: number;
  gems?: number;
  tickets?: number;
  chests?: Partial<Record<ChestKind, number>>;
  /** Wild cards by rarity. */
  wild?: Partial<Record<ChestRarity, number>>;
  cards?: Partial<Record<BaseUnitId, number>>;
  cosmetics?: string[];
}

// ───────────────────────────── results ─────────────────────────────

export type MetaError =
  | 'not_enough_gold' | 'not_enough_gems' | 'not_enough_tickets' | 'not_enough_cards' | 'max_level'
  | 'locked' | 'not_ready' | 'already_claimed' | 'limit_reached' | 'ad_failed' | 'unavailable'
  | 'invalid' | 'invalid_code' | 'corrupt_code' | 'newer_version' | 'clock_frozen' | 'already_owned' | 'not_owned'
  | 'nothing_to_claim' | 'not_cleared' | 'run_active';

export type Result<T> = { ok: true; value: T } | { ok: false; error: MetaError };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function fail<T = never>(error: MetaError): Result<T> {
  return { ok: false, error };
}

/** i18n key of the toast for a refused command. */
export function errorKey(error: MetaError): string {
  return 'meta.err.' + error;
}

// ───────────────────────────── chest results ─────────────────────────────

export interface ChestCard {
  rarity: ChestRarity;
  /** A wild card has no unit: the player spends it on any unit of this rarity. */
  unit: BaseUnitId | null;
}

/** A decided-and-stored chest opening. The animation only replays this. */
export interface ChestResult {
  id: number;
  kind: ChestKind;
  seed: number;
  oddsVersion: number;
  cards: ChestCard[];
  /** The 10th-gold-chest bonus: which unit and how many cards (0 cards when this was not a pity chest). */
  pity: { unit: BaseUnitId | null; cards: number };
  /** Gold paid for cards the player could no longer use (maxed units / rarities). */
  overflowGold: number;
  /** Number of cards the guarantee had to upgrade (0 for almost every chest). */
  upgraded: number;
}

// ───────────────────────────── persisted profile ─────────────────────────────

export interface MissionState {
  progress: number[];
  claimed: boolean[];
}

export interface DaySlice {
  date: string;
  missions: MissionState;
  chestClaimed: boolean;
  treat: boolean[];
  snackChests: number;
  ticketAds: number;
  shopRefreshes: number;
  patrolDoubles: number;
  chestSkips: number;
  challengeCleared: boolean;
}

export interface WeekSlice {
  week: string;
  missions: MissionState;
  chestClaimed: boolean;
}

export interface PassSlice {
  season: number;
  xp: number;
  premium: boolean;
  claimedFree: number[];
  claimedPremium: number[];
}

export interface RunStatsTotals {
  runs: number;
  wins: number;
  merges: number;
  kills: number;
  bosses: number;
  sweeps: number;
}

export interface AppliedOrder {
  p: string;
  t: number;
  revoked: boolean;
  /** What the order added, so a refund can take back exactly that much. */
  gems: number;
  gold: number;
  chests: Partial<Record<ChestKind, number>>;
}

export interface PendingRun {
  init: BattleInit;
  snapshot: BattleSnapshot | null;
  startedAt: number;
}

/** What a finished run paid, kept until the next run so the result screen can show and double it. */
export interface RunReward {
  id: number;
  mode: BattleMode;
  chapter: number;
  stake: number;
  victory: boolean;
  wavesCleared: number;
  gold: number;
  xp: number;
  /** Everything else the run paid: chests, gems, cards, first-clear rewards. */
  bundle: Bundle;
  firstClear: boolean;
  doubled: boolean;
  newBest: boolean;
}

export interface ProfileData {
  createdAt: number;
  /** Random per profile; salts the daily shop so two players see different offers. */
  seed: number;
  gold: number;
  gems: number;
  tickets: number;
  levels: Record<BaseUnitId, number>;
  cards: Record<BaseUnitId, number>;
  wild: Record<ChestRarity, number>;
  training: Record<TrainingId, number>;
  chests: Record<ChestKind, number>;
  reveals: ChestResult[];
  nextRevealId: number;
  goldOpened: number;
  accountXp: number;
  /** cleared[c - 1] = how many stakes of chapter c are cleared in a row from stake 0 (0..6). */
  cleared: number[];
  endless: { best: number; week: string; weekBest: number; claimed: number[] };
  stats: RunStatsTotals;
  time: { lastSeenAt: number; lastActiveDate: string };
  day: DaySlice;
  week: WeekSlice;
  calendar: { stamp: number; lastDate: string; cycles: number };
  comeback: { pending: boolean; chestClaimed: boolean; patrolBoost: boolean };
  freeChest: { readyAt: number };
  patrol: { since: number };
  shop: { date: string; salt: number; bought: boolean[] };
  pass: PassSlice;
  piggy: { gems: number; since: number };
  cosmetics: { owned: string[]; rug: string; fx: string };
  owned: { butler: boolean; once: string[] };
  gemPass: { until: number; lastClaimDate: string };
  cup: { week: string; days: Record<string, number>; claimed: number[] };
  unlocked: string[];
  orders: Record<string, AppliedOrder>;
  iapLedger: IapLedger;
  ads: AdCounters;
  pending: PendingRun | null;
  lastRun: RunReward | null;
  nextRunId: number;
}

export interface ProfileEvents {
  /** Fired once after every command that changed anything. */
  change: null;
  currency: { currency: CurrencyId; delta: number; total: number; reason: Reason };
  chest: ChestResult;
  unlock: { feature: string };
  unitLevel: { unit: BaseUnitId; level: number };
  accountLevel: { level: number };
  run: RunReward;
}
