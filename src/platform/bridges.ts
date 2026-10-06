/**
 * Runtime bridges for the two platforms whose SDKs are npm packages that are NOT dependencies of this
 * repo: Apps in Toss (@apps-in-toss/web-framework) and Capacitor (@capacitor-community/admob,
 * @capacitor/preferences, @capacitor/app, RevenueCat). The adapters are written against the small
 * typed interfaces below, looked up at runtime, so the repo compiles without the packages and the
 * adapters degrade to "unavailable" while a bridge is missing. See README.md for the 5-line wiring.
 *
 * This file is tiny and shared by every build; it holds types and two registration slots only.
 */

// ----- Apps in Toss ----------------------------------------------------------------------------
// Docs: https://developers-apps-in-toss.toss.im/documentation/sdk/domains-api/ads/ (GoogleAdMob.*,
// loadFullScreenAd/showFullScreenAd), .../iap/ (IAP.*), .../storage, .../game/, authentication/hash-key

export type TossShowAdEvent =
  | { type: 'requested' }
  | { type: 'show' }
  | { type: 'impression' }
  | { type: 'clicked' }
  | { type: 'dismissed' }
  | { type: 'failedToShow' }
  | { type: 'userEarnedReward'; data: { unitType: string; unitAmount: number } };

export interface TossLoadAdParams {
  options: { adGroupId: string };
  onEvent: (event: { type: 'loaded'; data?: unknown }) => void;
  onError: (error: unknown) => void;
}

export interface TossShowAdParams {
  options: { adGroupId: string };
  onEvent: (event: TossShowAdEvent) => void;
  onError: (error: unknown) => void;
}

/** A Toss API function: callable, with the documented `isSupported()` probe attached. */
export type TossAdFn<P> = ((params: P) => () => void) & { isSupported?: () => boolean };

export interface TossIapCreateOrderParams {
  options: {
    sku: string;
    /** Called after payment to grant the product; resolve true when granted. Receives the order id. */
    processProductGrant: (arg: { orderId: string }) => boolean | Promise<boolean>;
  };
  onEvent: (event: { type: 'success'; data: { orderId: string } & Record<string, unknown> }) => void;
  onError: (error: unknown) => void;
}

export interface TossBridge {
  GoogleAdMob?: {
    loadAppsInTossAdMob: TossAdFn<TossLoadAdParams>;
    showAppsInTossAdMob: TossAdFn<TossShowAdParams>;
  };
  loadFullScreenAd?: TossAdFn<TossLoadAdParams>;
  showFullScreenAd?: TossAdFn<TossShowAdParams>;
  IAP?: {
    createOneTimePurchaseOrder: (params: TossIapCreateOrderParams) => () => void;
    getPendingOrders: () => Promise<{ orders: Array<{ orderId: string; sku: string; paymentCompletedDate?: string }> }>;
    completeProductGrant: (arg: { params: { orderId: string } }) => Promise<boolean>;
    /** Shape not verified; used only to show localised prices when present. */
    getProductItemList?: () => Promise<{ products?: Array<{ sku: string; displayAmount?: string }> }>;
  };
  Storage?: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
  };
  getUserKeyForGame?: () => Promise<{ type: 'HASH'; hash: string } | 'INVALID_CATEGORY' | 'ERROR' | undefined>;
  submitGameCenterLeaderBoardScore?: (params: { score: string }) => Promise<unknown>;
}

let tossBridge: TossBridge | null = null;

/** Hand the Toss SDK module (`import * as ait from '@apps-in-toss/web-framework'`) to the adapter. Call before initPlatform(). */
export function registerTossBridge(bridge: TossBridge | null): void {
  tossBridge = bridge;
}

export function getTossBridge(): TossBridge | null {
  return tossBridge;
}

// ----- Capacitor -------------------------------------------------------------------------------
// Docs: https://github.com/capacitor-community/admob (AdMob, RewardAdPluginEvents),
// https://capacitorjs.com/docs/apis/preferences, https://capacitorjs.com/docs/apis/app

export interface CapListenerHandle {
  remove(): Promise<void> | void;
}

export interface CapAdMob {
  initialize(options?: { initializeForTesting?: boolean; testingDevices?: string[] }): Promise<void>;
  prepareRewardVideoAd(options: { adId: string; isTesting?: boolean }): Promise<unknown>;
  showRewardVideoAd(options?: { adId?: string }): Promise<{ type?: string; amount?: number } | undefined>;
  prepareInterstitial(options: { adId: string; isTesting?: boolean }): Promise<unknown>;
  showInterstitial(options?: { adId?: string }): Promise<unknown>;
  addListener(event: string, cb: (info: unknown) => void): Promise<CapListenerHandle> | CapListenerHandle;
}

export interface CapPreferences {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
}

export interface CapApp {
  addListener(
    event: 'appStateChange',
    cb: (state: { isActive: boolean }) => void,
  ): Promise<CapListenerHandle> | CapListenerHandle;
}

/** RevenueCat (@revenuecat/purchases-capacitor). Surface NOT verified against the docs, see README. */
export interface CapPurchases {
  getProducts(options: { productIdentifiers: string[] }): Promise<{
    products: Array<{ identifier: string; priceString?: string }>;
  }>;
  purchaseStoreProduct(options: { product: unknown }): Promise<{
    productIdentifier?: string;
    transaction?: { transactionIdentifier?: string };
  }>;
}

export interface CapacitorPlugins {
  AdMob?: CapAdMob;
  Preferences?: CapPreferences;
  App?: CapApp;
  Purchases?: CapPurchases;
}

/** Plugin event names, overridable with the package's own enums (RewardAdPluginEvents etc.). */
export interface CapAdMobEvents {
  rewardLoaded: string;
  rewardFailedToLoad: string;
  rewardFailedToShow: string;
  rewardDismissed: string;
  rewardRewarded: string;
  interstitialLoaded: string;
  interstitialFailedToLoad: string;
  interstitialFailedToShow: string;
  interstitialDismissed: string;
}

let capPlugins: CapacitorPlugins | null = null;
let capEvents: Partial<CapAdMobEvents> = {};

/**
 * Explicit alternative to the `window.Capacitor.Plugins` lookup: pass the imported plugin objects
 * (and optionally the event names from the packages' enums).
 */
export function registerCapacitorPlugins(plugins: CapacitorPlugins | null, events?: Partial<CapAdMobEvents>): void {
  capPlugins = plugins;
  capEvents = { ...events };
}

export function getCapacitorPlugins(): CapacitorPlugins | null {
  if (capPlugins) return capPlugins;
  try {
    const cap = (globalThis as { Capacitor?: { Plugins?: CapacitorPlugins } }).Capacitor;
    return cap?.Plugins ?? null;
  } catch {
    return null;
  }
}

export function getCapacitorAdMobEvents(): Partial<CapAdMobEvents> {
  return capEvents;
}
