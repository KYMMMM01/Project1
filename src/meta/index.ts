/**
 * Meta game layer: profile, economy, progression, rewards, chests, missions, calendar, pass, patrol,
 * shop, cosmetics, daily challenge, backup code. No rendering. Rules: docs/명세_메타.md.
 *
 *   import { profile, initMeta, t... } from '@/meta';
 *   await initMeta();                    // once, after initPlatform()
 *   const r = profile.levelUp('w_paw');  // commands return { ok, value } | { ok: false, error }
 */
import './strings';

export { profile, initMeta } from './instance';
export { Profile, createProfile, systemClock, CUP_BOARD_ID } from './profile';
export type { RunOptions, BackupPreview, SweepResult, DungeonView, DungeonTierRow } from './profile';
export type { MetaDeps, AdsPort } from './core';
export type {
  PayVia, UnitView, TrainingRow, ShopView, TicketView, CosmeticRow, PiggyView,
} from './economy';
export type {
  MissionScope, FreeChestView, PatrolView, CalendarView, MissionRow, DailyChestView, PassRow, PassView,
  TierRow, CupView, EndlessView, DailyView,
} from './routines';
export { attachPlatform, createAdPersistence, createLedgerStore } from './platformLink';
export type { PlatformServices } from './platformLink';

// pure rules
export { runGold, runXp, chapterMult, computeRunPayout, sweepPayout, canPlayStake, chaptersCleared, firstClearBundle } from './rewards';
export type { RunPayout } from './rewards';
export {
  cardsToLevel, goldToLevel, totalCardsTo, totalGoldTo, quoteLevelUp, accountProgress, xpForNext, trainCost,
  trainingEffects, buildLoadout, UNITS_BY_RARITY, RARITY_OF,
} from './units';
export type { LevelQuote, TrainingEffects, AccountProgress } from './units';
export { ODDS, ODDS_VERSION, oddsView, percentText } from './odds';
export type { OddsTable, OddsView, Guarantee, PityRule } from './odds';
export { drawChest, chestTotals, pityTarget } from './chests';
export { dailyCode, parseDailyCode, dailySetup, cupScore } from './daily';
export { dungeonGold, dungeonWaveGold, dungeonMaxGold, dungeonFirstClearGold, dungeonTierOpen, dungeonTopTier, dungeonEntriesLeft } from './dungeon';
export type { DailySetup } from './daily';
export { shopOffers } from './shop';
export type { ShopOffer } from './shop';
export { describeBundle, bundleParts, mergeBundles } from './bundle';
export { tn } from './plural';
export type { BundlePart } from './bundle';
export { featureHint, isFeatureUnlocked } from './features';
export { encodeBackup, decodeBackup } from './backup';
export { dateKey, weekKey, SessionClock } from './time';
export type { ClockSource } from './time';
export { iapProductDefs, iapSpec, IAP_SPECS } from './data/catalog';
export type { IapSpec } from './data/catalog';
export { FEATURES } from './data/schedule';
export type { FeatureId } from './data/schedule';
export { OFFERS, SNACKS } from './data/economy';
export type { OfferId, SnackId } from './data/economy';

// types
export { BASE_UNITS, CHEST_KINDS, CHEST_RARITIES, TRAINING_IDS, errorKey } from './types';
export type {
  BaseUnitId, Bundle, ChestCard, ChestKind, ChestRarity, ChestResult, CurrencyId, MetaError, ProfileData,
  ProfileEvents, Reason, Result, RunReward, TrainingId,
} from './types';
