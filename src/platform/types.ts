/**
 * Platform abstraction. Gameplay code never touches a vendor SDK: it talks to AdService, IapService,
 * Analytics (see index.ts) and, for lifecycle signals, `platform.lifecycle`. One adapter per build is
 * selected at build time by VITE_PLATFORM (see resolve.ts). Shape follows docs/research/02 section C-7.2.
 */
import type { StorageBackend } from '@/core/save';

export type PlatformId = 'dev' | 'itch' | 'crazygames' | 'poki' | 'gd' | 'yt' | 'toss' | 'capacitor';

/** 'fallback' is the safe no-ads adapter used before boot and when an SDK fails to initialise. */
export type AdapterId = PlatformId | 'fallback';

export type AdKind = 'interstitial' | 'rewarded';

/**
 * Raw outcome of one ad request, as reported by an adapter.
 * `rewarded` may be true ONLY when the SDK's own completion signal fired (CrazyGames adFinished,
 * Poki rewardedBreak(true), GD SDK_REWARDED_WATCH_COMPLETE, YouTube requestRewardedAd -> true, Toss
 * userEarnedReward, AdMob Rewarded). Everything else is `rewarded: false` / undefined.
 */
export interface AdResult {
  /** An ad was actually put in front of the player. */
  shown: boolean;
  rewarded?: boolean;
  error?: string;
}

export interface PlatformCapabilities {
  rewardedAds: boolean;
  interstitialAds: boolean;
  iap: boolean;
  /** The ad-free pass may be sold on this platform. */
  adFreePurchase: boolean;
  leaderboard: boolean;
  /** Storage follows the player across devices. */
  cloudSave: boolean;
  /** false on YouTube Playables: the Page Visibility API is forbidden, SDK pause/resume signals are used. */
  usesPageVisibility: boolean;
  /** Links leaving the game (store pages, socials) are allowed. */
  externalLinksAllowed: boolean;
  /**
   * The SDK throttles interstitials itself (CrazyGames adCooldown, Poki "decides when a player is ready
   * for another ad"): AdService must not add its own interstitial timer on top.
   */
  managesAdFrequency: boolean;
}

export interface PlatformLifecycle {
  loadingStart(): void;
  loadingFinished(): void;
  /** YouTube firstFrameReady: first frame (loading screen included) is rendering. */
  firstFrameReady(): void;
  /** YouTube gameReady: the player can interact. */
  gameReady(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  /** Platform asked the game to stop (YouTube onPause, GD SDK_GAME_PAUSE, app backgrounded). Returns unsubscribe. */
  onPause(cb: () => void): () => void;
  onResume(cb: () => void): () => void;
  /** Celebrate a high point (CrazyGames happytime, Poki happyTime). Use sparingly. */
  happyMoment(intensity?: number): void;
}

export interface PlatformAds {
  /** Synchronous readiness check; never throws. */
  isAvailable(kind: AdKind, placement: string): boolean;
  /**
   * Start loading the next ad (Toss/AdMob require a preload). Never throws. `placement` is '*' when the
   * request is not tied to one placement (AdService preloads per kind).
   */
  preload(kind: AdKind, placement: string): void;
  /** Show an ad. MUST settle (the AdService also enforces a 90 s watchdog). Never rejects. */
  show(kind: AdKind, placement: string): Promise<AdResult>;
}

/** StorageBackend plus a size ceiling. Every method settles and none throws. */
export interface PlatformStorage extends StorageBackend {
  readonly maxBytes: number;
}

export interface PlatformAudio {
  isSystemMuted(): boolean;
  /** Returns unsubscribe. */
  onSystemMuteChange(cb: (muted: boolean) => void): () => void;
}

export type IapProductType = 'consumable' | 'nonConsumable' | 'subscription';
export type IapOutcome = 'purchased' | 'cancelled' | 'failed' | 'unavailable';

export interface PendingOrder {
  orderId: string;
  productId: string;
}

/** Paid and finished on the platform ('completed'), or paid and then refunded ('refunded'). */
export type OrderStatus = 'completed' | 'refunded';

export interface OrderRecord extends PendingOrder {
  status: OrderStatus;
}

export interface StorePrice {
  id: string;
  priceText: string;
}

/** What a purchase sheet should show (only the dev mock draws its own sheet; real platforms ignore it). */
export interface PurchaseInfo {
  name: string;
  priceText: string;
}

export interface PlatformIap {
  /** false while the platform bridge is missing; IapService then reports 'unavailable'. */
  isAvailable?(): boolean;
  /** Localised store prices when the platform provides them. */
  products?(ids: readonly string[]): Promise<StorePrice[]>;
  /**
   * Open the platform purchase flow. When payment is confirmed the adapter MUST await `onPaid(orderId)`
   * and only treat the order as complete if it resolves true (Toss processProductGrant). Resolves
   * 'purchased' only after a successful grant.
   */
  purchase(
    productId: string,
    onPaid: (orderId: string) => Promise<boolean>,
    info?: PurchaseInfo,
  ): Promise<IapOutcome>;
  /** Orders paid on the platform but not yet marked complete (Toss getPendingOrders). */
  pendingOrders(): Promise<PendingOrder[]>;
  /**
   * Orders the platform already finished or refunded (Toss getCompletedOrRefundedOrders). Only on
   * platforms that list them; it is what makes purchases restorable without a server.
   */
  completedOrders?(): Promise<OrderRecord[]>;
  /** Tell the platform the grant is done (Toss completeProductGrant). */
  complete(orderId: string): Promise<void>;
}

export interface PlatformIdentity {
  userKey(): Promise<string | null>;
}

export interface PlatformLeaderboard {
  submit(boardId: string, score: number): Promise<void>;
}

export interface PlatformAdapter {
  readonly id: AdapterId;
  /** Unique greppable string, proves in a built bundle which adapter was included. */
  readonly marker: string;
  readonly capabilities: PlatformCapabilities;
  init(): Promise<void>;
  readonly lifecycle: PlatformLifecycle;
  readonly ads: PlatformAds;
  readonly storage: PlatformStorage;
  readonly audio?: PlatformAudio;
  readonly iap?: PlatformIap;
  readonly identity?: PlatformIdentity;
  readonly leaderboard?: PlatformLeaderboard;
  /** Optional analytics hook (platform dashboards). Never receives personal data. */
  readonly analytics?: { track(event: string, params?: Record<string, unknown>): void };
  /** Dev-only QA hooks (dev adapter). */
  readonly debug?: Readonly<Record<string, () => unknown>>;
}

/** Localised text, Korean + English. */
export interface LocalizedText {
  ko: string;
  en: string;
}

/** Money amount a channel charges. KRW is whole won, VAT included; USD is dollars. */
export interface ChannelPrice {
  currency: 'KRW' | 'USD';
  amount: number;
}

export interface IapProductDef {
  id: string;
  type: IapProductType;
  /** Fallback price text per language, shown until/unless the store provides its own. */
  price: LocalizedText;
  name?: LocalizedText;
  /** Per-channel price data; checked by pricing.ts (Toss: KRW, VAT included, multiple of 11). */
  prices?: Partial<Record<PlatformId, ChannelPrice>>;
}

/** How a run ended; reported to AdService.endRun(). 'abandon' does not count as a completed run. */
export type RunResult = 'victory' | 'defeat' | 'abandon';
