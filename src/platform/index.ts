/**
 * Platform layer barrel. Gameplay and meta code import from '@/platform' only:
 *
 *   import { initPlatform, ads, iap, analytics, platform } from '@/platform';
 *
 * Nothing here statically imports a vendor adapter; resolve.ts loads exactly one by VITE_PLATFORM.
 */
export { initPlatform, getPauseState, getBootResult, INIT_TIMEOUT_MS } from './boot';
export type { PlatformServices, PauseState } from './boot';
export { ads, iap, analytics, platform, modal, submitScore } from './registry';
export { PLATFORM_ID } from './resolve';
export { preparePlatformRuntime } from './runtime';

export { AdService, AD_WATCHDOG_MS } from './adService';
export type { RewardedOutcome, PlacementStatus, OfferReason } from './adService';
export {
  AD_PLACEMENTS,
  AD_PLACEMENT_IDS,
  GLOBAL_AD_RULES,
  INTERSTITIAL_RULES,
  REWARDED_RULES,
  isAdFreePlacement,
  isPlacement,
  localDateKey,
} from './adPolicy';
export type {
  AdCounters,
  AdPersistence,
  AdPlacementId,
  InterstitialVerdict,
  PlacementRule,
} from './adPolicy';

export { IapService } from './iapService';
export type {
  GrantContext,
  GrantHandler,
  GrantSource,
  IapLedger,
  IapLedgerStore,
  LedgerEntry,
  RestoreSummary,
  RevokeContext,
  RevokeHandler,
} from './iapService';

export {
  TOSS_PRICE_MAX_KRW,
  TOSS_PRICE_MIN_KRW,
  isValidTossPriceKrw,
  tossPriceProblems,
  validateCatalogue,
} from './pricing';
export type { CatalogueProblem, PriceIssue, PriceProblem } from './pricing';

export { Analytics, ANALYTICS_EVENTS } from './analytics';
export type { AnalyticsEvent, AnalyticsParams, AnalyticsRecord } from './analytics';

export { registerTossBridge, registerCapacitorPlugins } from './bridges';
export type { TossBridge, CapacitorPlugins } from './bridges';

export type {
  AdKind,
  AdResult,
  AdapterId,
  ChannelPrice,
  IapOutcome,
  IapProductDef,
  IapProductType,
  LocalizedText,
  OrderRecord,
  OrderStatus,
  PendingOrder,
  PlatformAdapter,
  PlatformAds,
  PlatformAudio,
  PlatformCapabilities,
  PlatformId,
  PlatformIap,
  PlatformIdentity,
  PlatformLeaderboard,
  PlatformLifecycle,
  PlatformStorage,
  PurchaseInfo,
  RunResult,
} from './types';
