/**
 * Numbers of the economy. Every tunable lives here (or in schedule.ts / catalog.ts) so the balance
 * pass and the progression report touch data only. Rules: docs/명세_메타.md.
 */
import type { ChestKind, ChestRarity, TrainingId } from '../types';

export const MAX_LEVEL = 10;

// ───────────────────────────── unit levels ─────────────────────────────

/** Cards needed to reach level 2..10 before the rarity factor. */
export const CARD_BASE: readonly number[] = [2, 4, 8, 16, 30, 50, 80, 120, 200];
/** Higher rarities drop less often, so they need fewer cards. Rounded up. */
export const CARD_RARITY_FACTOR: Readonly<Record<ChestRarity, number>> = { common: 1, rare: 1, epic: 0.6, legendary: 0.3 };

/** Gold to reach level 2..10 before the rarity factor. */
export const GOLD_BASE: readonly number[] = [100, 250, 600, 1200, 2500, 5000, 9000, 14000, 20000];
export const GOLD_RARITY_FACTOR: Readonly<Record<ChestRarity, number>> = { common: 1, rare: 1.2, epic: 1.5, legendary: 2 };

/** Gold paid per card that can no longer be used (unit at level 10, or every unit of the rarity at 10). */
export const OVERFLOW_GOLD: Readonly<Record<ChestRarity, number>> = { common: 10, rare: 30, epic: 100, legendary: 400 };

// ───────────────────────────── training ─────────────────────────────

export const TRAINING_MAX = 10;
export const TRAINING_COST_BASE = 200;
export const TRAINING_COST_GROWTH = 1.55;
/** start_purr: +1 purr at these levels. */
export const START_PURR_LEVELS: readonly number[] = [3, 6, 9];

export interface TrainingDef {
  id: TrainingId;
  /** Effect per level in the unit named by `unit` (see trainingEffects). */
  perLevel: number;
  unit: 'fish' | 'percent' | 'seconds';
}

export const TRAINING_DEFS: readonly TrainingDef[] = [
  { id: 'start_fish', perLevel: 5, unit: 'fish' },
  { id: 'kill_fish', perLevel: 2, unit: 'percent' },
  { id: 'damage', perLevel: 2, unit: 'percent' },
  { id: 'boss_time', perLevel: 1, unit: 'seconds' },
  { id: 'laser_cd', perLevel: 0.3, unit: 'seconds' },
  { id: 'start_purr', perLevel: 0, unit: 'fish' },
];

// ───────────────────────────── run rewards ─────────────────────────────

/** Gold = (BASE + PER_WAVE x waves cleared) x chapter x stake x victory. */
export const RUN_GOLD_BASE = 40;
export const RUN_GOLD_PER_WAVE = 14;
export const CHAPTER_MULT: readonly number[] = [1, 1.3, 1.6, 2.0, 2.5];
/** 6 acts of 4 waves. A sweep pays what a full win pays. */
export const CHAPTER_WAVES = 24;
export const CHAPTER_COUNT = 5;
export const STAKE_STEP = 0.15;
export const VICTORY_MULT = 1.25;
/** Account XP = pass XP = XP_BASE + XP_PER_WAVE x waves cleared. */
export const XP_BASE = 10;
export const XP_PER_WAVE = 2;

/** A defeat that got this far still pays a few common/rare cards. */
export const CONSOLATION_WAVES = 10;
export const CONSOLATION_CARDS = 2;

/** First clear of a chapter at a stake: gems = base + step x stake, plus the chest of FIRST_CLEAR_CHEST[stake]. */
export const FIRST_CLEAR_GEMS_BASE = 12;
export const FIRST_CLEAR_GEMS_STEP = 5;

export const ACCOUNT_LEVEL_GEMS = 10;
export const ACCOUNT_LEVEL_CAP = 99;

export const DAILY_MISSION_CHEST_POINTS = 100;
/** A cosmetic the player already owns turns into gems. */
export const DUPLICATE_COSMETIC_GEMS = 100;

// ───────────────────────────── sweep ─────────────────────────────

export const SWEEP_PAYOUT = 0.6;
export const TICKETS_PER_DAY = 3;
export const TICKETS_PASS_EXTRA = 3;
export const TICKET_STOCK = 6;
export const TICKET_STOCK_PASS = 12;
export const TICKET_HARD_CAP = 99;
export const TICKET_AD_AMOUNT = 2;
export const TICKET_AD_DAILY = 2;
export const TICKET_GEMS = 30;

// ───────────────────────────── time-based rewards ─────────────────────────────

const HOUR = 3_600_000;
export const FREE_CHEST_MS = 4 * HOUR;
export const PATROL_CAP_MS = 8 * HOUR;
export const PATROL_CAP_PASS_MS = 12 * HOUR;
export const PATROL_CAP_COMEBACK_MS = 24 * HOUR;
export const PATROL_MIN_MS = 10 * 60_000;
export const PATROL_GOLD_PER_HOUR = 42;
export const COMEBACK_DAYS = 3;
export const ROLLBACK_SLACK_MS = 5 * 60_000;

// ───────────────────────────── gem prices ─────────────────────────────

/** A wooden chest is never sold. */
export const CHEST_GEM_PRICE: Readonly<Record<ChestKind, number>> = { wooden: 0, silver: 150, gold: 500 };

/**
 * Most chests of one kind opened in a single go. The stored reveals kept for a replay after a crash cover a whole
 * pile, so a pile never loses its first chests to the cap.
 */
export const CHEST_BULK_MAX = 50;

// ───────────────────────────── piggy bank ─────────────────────────────

export const PIGGY_PER_RUN = 6;
export const PIGGY_CAP = 600;
export const PIGGY_FREE_BREAK_DAYS = 7;
export const PIGGY_FREE_SHARE = 0.25;

// ───────────────────────────── gem alternatives to rewarded ads ─────────────────────────────

/** Every rewarded offer that can be paid with gems instead. `ad` is the AdService placement id. */
export const OFFERS = {
  revive: { ad: 'revive', gems: 30, reason: 'offer_revive' },
  result_double: { ad: 'result_double', gems: 20, reason: 'offer_double' },
  chest_skip: { ad: 'free_chest', gems: 20, reason: 'chest_skip' },
  relic_reroll: { ad: 'relic_reroll', gems: 10, reason: 'offer_relic' },
  start_snack: { ad: 'pre_run_snack', gems: 15, reason: 'offer_snack' },
} as const;
export type OfferId = keyof typeof OFFERS;

/** AdService placement ids of the offers the meta layer sells without a gem alternative. Each must be a row of the platform's AD_PLACEMENTS (tests/meta.rules.test.ts checks). */
export const PLACEMENTS = {
  treat: 'daily_treat',
  snackChest: 'snack_box',
  ticket: 'sweep_ticket',
  shopRefresh: 'shop_refresh',
  patrolDouble: 'patrol_double',
} as const;
export const SNACK_CHESTS_PER_DAY = 3;
export const CHEST_SKIPS_PER_DAY = 4;
export const PATROL_DOUBLES_PER_DAY = 3;
export const SHOP_REFRESHES_PER_DAY = 2;
export const TREAT_SLOTS = 3;

/** Pre-run snack: pick one of three. */
export const SNACKS = ['fish', 'purr', 'rare_summon'] as const;
export type SnackId = (typeof SNACKS)[number];
export const SNACK_FISH = 60;
export const SNACK_PURR = 2;
