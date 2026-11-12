/**
 * Capacitor (Android / iOS store build) adapter. The store build (VITE_PLATFORM=capacitor) imports the plugin packages itself
 * (`loadPlugins`) and hands them to registerCapacitorPlugins(); every other build and the tests never reach that import and pass
 * their own objects (or `window.Capacitor.Plugins`). A missing plugin degrades to "unavailable".
 * Checked against the installed type definitions (2026-11-11: @capacitor-community/admob 8.3, @revenuecat/purchases-capacitor 14.1,
 * @capacitor/app 8.1, @capacitor/preferences 8.0):
 *   AdMob.initialize({initializeForTesting}), prepareRewardVideoAd({adId, isTesting}), showRewardVideoAd() -> AdMobRewardItem
 *   {type, amount}; RewardAdPluginEvents Loaded 'onRewardedVideoAdLoaded', FailedToLoad, FailedToShow, Dismissed, Rewarded
 *   'onRewardedVideoAdReward'; consent: requestConsentInfo() / showConsentForm() -> {status, isConsentFormAvailable, canRequestAds}.
 *   Purchases.configure({apiKey}); getProducts({productIdentifiers, type}) where type defaults to SUBSCRIPTION on Android, so the
 *   one-time products are asked for as NON_SUBSCRIPTION; purchaseStoreProduct({product}) -> {transaction: {transactionIdentifier}};
 *   restorePurchases() -> {customerInfo: {nonSubscriptionTransactions: [{transactionIdentifier, productIdentifier}]}}; a cancelled
 *   purchase rejects with code '1' (PURCHASE_CANCELLED_ERROR) and userCancelled true.
 * Still to check on a device: whether refunds leave nonSubscriptionTransactions (they do not reach the revoke handler here).
 * Interstitials are portal-only (GDD 8.1), so the AdMob interstitial calls are never used here.
 * Ad unit id: VITE_ADMOB_REWARDED_ID; VITE_ADMOB_TESTING=1 or a dev build uses AdMob test mode. RevenueCat: VITE_REVENUECAT_API_KEY
 * (the public Google SDK key, goog_...). Without it purchases are unavailable.
 * The ad SDK starts after init() has returned (consent first, where the UMP SDK asks for it), so it is not on the first screen's path.
 */
import {
  getCapacitorAdMobEvents,
  getCapacitorPlugins,
  registerCapacitorPlugins,
  type CapAdMobEvents,
  type CapCustomerInfo,
  type CapListenerHandle,
  type CapRestoreResult,
  type CapacitorPlugins,
  type CapPlayGames,
} from '../bridges';
import { createLocalStorageBackend, safeStorage } from '../storage';
import type { AdResult, IapOutcome, OrderRecord, PendingOrder, PlatformAdapter, PlatformIap } from '../types';
import { errorMessage, safe, Signal } from '../util';

const DEFAULT_EVENTS: CapAdMobEvents = {
  rewardLoaded: 'onRewardedVideoAdLoaded',
  rewardFailedToLoad: 'onRewardedVideoAdFailedToLoad',
  rewardFailedToShow: 'onRewardedVideoAdFailedToShow',
  rewardDismissed: 'onRewardedVideoAdDismissed',
  rewardRewarded: 'onRewardedVideoAdReward',
};

/** A load that neither succeeded nor failed within this long is abandoned and retried. */
const LOAD_TIMEOUT_MS = 20_000;
const RETRY_MS = 30_000;
/** RevenueCat's PRODUCT_CATEGORY.NON_SUBSCRIPTION and PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR. */
const ONE_TIME = 'NON_SUBSCRIPTION';
const CANCELLED = '1';
/** Purchases this device started and has not yet seen granted (see `pendingOrders`): productId -> start time in ms. */
const INTENTS_KEY = 'iap.intents';
/** A transaction this long before the attempt's start is an older purchase of the same product, not this one (clock skew margin). */
const INTENT_SKEW_MS = 5 * 60_000;
/** An attempt with no transaction after this long is dropped (Google Play keeps a pending payment open for a few days at most). */
const INTENT_MAX_AGE_MS = 14 * 24 * 3600_000;

const events = (): CapAdMobEvents => ({ ...DEFAULT_EVENTS, ...getCapacitorAdMobEvents() });
const plugins = (): CapacitorPlugins | null => getCapacitorPlugins();

function adUnitId(): string | undefined {
  const v: unknown = import.meta.env.VITE_ADMOB_REWARDED_ID;
  return typeof v === 'string' && v !== '' ? v : undefined;
}

const testing = (): boolean => import.meta.env.VITE_ADMOB_TESTING === '1' || import.meta.env.DEV === true;

function revenueCatKey(): string | undefined {
  const v: unknown = import.meta.env.VITE_REVENUECAT_API_KEY;
  return typeof v === 'string' && v !== '' ? v : undefined;
}

/** The store build brings in the plugin packages itself; the literal comparison drops the imports from every other build. */
async function loadPlugins(): Promise<void> {
  if (import.meta.env.VITE_PLATFORM !== 'capacitor') return;
  const [{ AdMob }, { Preferences }, { App }, { Purchases }, { registerPlugin }] = await Promise.all([
    import('@capacitor-community/admob'),
    import('@capacitor/preferences'),
    import('@capacitor/app'),
    import('@revenuecat/purchases-capacitor'),
    import('@capacitor/core'),
  ]);
  // The game's own native plugin (PlayGamesPlugin.java) has no npm package: registerPlugin gives its proxy by name.
  const PlayGames = registerPlugin<CapPlayGames>('PlayGames');
  // The packages' own types are wider than the slices in bridges.ts (overloaded addListener, enums for strings).
  registerCapacitorPlugins({ AdMob, Preferences, App, Purchases, PlayGames } as unknown as CapacitorPlugins);
}

async function listen(
  event: string,
  cb: (info: unknown) => void,
  bucket: CapListenerHandle[],
): Promise<void> {
  const AdMob = plugins()?.AdMob;
  if (!AdMob) return;
  const h = await AdMob.addListener(event, cb);
  if (h) bucket.push(h);
}

function removeAll(bucket: CapListenerHandle[]): void {
  for (const h of bucket.splice(0)) safe(() => void h.remove());
}

function customerInfo(r: CapRestoreResult): CapCustomerInfo {
  return 'customerInfo' in r ? r.customerInfo : r;
}

export function createAdapter(): PlatformAdapter {
  let slot: 'idle' | 'loading' | 'loaded' = 'idle';
  let loadTimer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  const permanent: CapListenerHandle[] = [];
  const pauseSignal = new Signal();
  const resumeSignal = new Signal();

  // sdkReady: the SDK has started and its listeners are on. adsAllowed: the consent SDK has answered that an ad may be requested
  // (true at once where there is no consent API); it stays false while consent is unknown, so no ad goes out before it.
  let sdkReady = false;
  let adsAllowed = false;
  let consentTimer: ReturnType<typeof setTimeout> | undefined;
  const enabled = (): boolean => adsAllowed && plugins()?.AdMob !== undefined && adUnitId() !== undefined;

  // RevenueCat is configured once, on the first purchase call; a failed configure leaves purchases unavailable.
  let configured: Promise<boolean> | undefined;
  const purchases = async (): Promise<NonNullable<CapacitorPlugins['Purchases']> | null> => {
    const P = plugins()?.Purchases;
    const apiKey = revenueCatKey();
    if (!P || !apiKey) return null;
    configured ??= Promise.resolve(P.configure?.({ apiKey })).then(
      () => true,
      () => false,
    );
    return (await configured) ? P : null;
  };

  const retryLater = (): void => {
    slot = 'idle';
    clearTimeout(loadTimer);
    clearTimeout(retryTimer);
    retryTimer = setTimeout(preload, RETRY_MS);
  };

  function preload(): void {
    const AdMob = plugins()?.AdMob;
    const adId = adUnitId();
    if (!AdMob || !adId || !sdkReady || !adsAllowed || slot !== 'idle') return;
    clearTimeout(retryTimer);
    slot = 'loading';
    // The Loaded / FailedToLoad listeners settle the slot; a rejected prepare call or silence also means "no ad".
    loadTimer = setTimeout(retryLater, LOAD_TIMEOUT_MS);
    Promise.resolve(AdMob.prepareRewardVideoAd({ adId, isTesting: testing() })).catch(retryLater);
  }

  /** Consent first (UMP: a form only where the law asks for one), then the first preload. A failure (offline start) asks again later. */
  async function askConsent(): Promise<void> {
    const AdMob = plugins()?.AdMob;
    if (!AdMob) return;
    clearTimeout(consentTimer);
    try {
      if (AdMob.requestConsentInfo) {
        let consent = await AdMob.requestConsentInfo();
        if (consent.status === 'REQUIRED' && consent.isConsentFormAvailable && AdMob.showConsentForm) {
          consent = await AdMob.showConsentForm();
        }
        adsAllowed = consent.canRequestAds;
      } else {
        adsAllowed = true;
      }
      preload();
    } catch {
      adsAllowed = false;
      consentTimer = setTimeout(() => void askConsent(), RETRY_MS);
    }
  }

  const show = async (): Promise<AdResult> => {
    const AdMob = plugins()?.AdMob;
    if (!AdMob || !enabled()) return { shown: false, error: 'unavailable' };
    if (slot !== 'loaded') return { shown: false, error: 'not_loaded' };
    slot = 'idle'; // consumed by this show
    const ev = events();
    const bucket: CapListenerHandle[] = [];
    return new Promise<AdResult>((resolve) => {
      let rewarded = false;
      let settled = false;
      const settle = (r: AdResult): void => {
        if (settled) return;
        settled = true;
        removeAll(bucket);
        resolve(r);
      };
      const setup = async (): Promise<void> => {
        await listen(ev.rewardDismissed, () => settle({ shown: true, rewarded }), bucket);
        await listen(ev.rewardFailedToShow, () => settle({ shown: false, error: 'failedToShow' }), bucket);
        // The plugin's Rewarded event: the SDK's own completion signal.
        await listen(ev.rewardRewarded, () => (rewarded = true), bucket);
        if (settled) removeAll(bucket);
        const out = await AdMob.showRewardVideoAd();
        // showRewardVideoAd() resolves with the AdMobRewardItem once the reward is earned: the same
        // signal as the Rewarded event, accepted too so a renamed event string cannot lose a reward.
        if (out && typeof (out as { amount?: unknown }).amount === 'number') rewarded = true;
      };
      setup().catch((e: unknown) => settle({ shown: false, rewarded: false, error: errorMessage(e) }));
    });
  };

  const local = createLocalStorageBackend();
  const storage = safeStorage(
    {
      async get(key) {
        const P = plugins()?.Preferences;
        return P ? ((await P.get({ key })).value ?? null) : local.get(key);
      },
      async set(key, value) {
        const P = plugins()?.Preferences;
        if (P) await P.set({ key, value });
        else await local.set(key, value);
      },
      async remove(key) {
        const P = plugins()?.Preferences;
        if (P) await P.remove({ key });
        else await local.remove(key);
      },
    },
    { maxBytes: 4_000_000, label: 'capacitor.Preferences' },
  );

  // A purchase is written down before the store sheet opens and crossed out once granted, so a payment the app never saw finish
  // (the app died in between, or Play kept it pending and completed it later) is granted by the next sync as a pending order;
  // without this record it would only come back through restore, where a consumable is recorded but not given (meta/profile.ts).
  const pendingProduct = new Map<string, string>();
  async function readIntents(): Promise<Record<string, number>> {
    try {
      const v: unknown = JSON.parse((await storage.get(INTENTS_KEY)) ?? '{}');
      const out: Record<string, number> = {};
      if (v && typeof v === 'object') {
        for (const [id, at] of Object.entries(v)) if (typeof at === 'number' && Date.now() - at < INTENT_MAX_AGE_MS) out[id] = at;
      }
      return out;
    } catch {
      return {};
    }
  }
  async function writeIntent(productId: string, at: number | null): Promise<void> {
    const intents = await readIntents();
    if (at === null) delete intents[productId];
    else intents[productId] = at;
    await storage.set(INTENTS_KEY, JSON.stringify(intents)).catch(() => undefined);
  }

  const iap: PlatformIap = {
    isAvailable: () => plugins()?.Purchases !== undefined && revenueCatKey() !== undefined,
    async products(ids) {
      const P = await purchases();
      if (!P) return [];
      const { products } = await P.getProducts({ productIdentifiers: [...ids], type: ONE_TIME });
      return products
        .filter((p) => typeof p.priceString === 'string' && p.priceString !== '')
        .map((p) => ({ id: p.identifier, priceText: p.priceString as string }));
    },
    async purchase(productId, onPaid): Promise<IapOutcome> {
      const P = await purchases();
      if (!P) return 'unavailable';
      try {
        const { products } = await P.getProducts({ productIdentifiers: [productId], type: ONE_TIME });
        const product = products.find((p) => p.identifier === productId);
        if (!product) return 'failed';
        await writeIntent(productId, Date.now());
        const res = await P.purchaseStoreProduct({ product });
        // The store transaction id is the order id. (Fallback id is NOT idempotent across restarts.)
        const orderId = res.transaction?.transactionIdentifier ?? `${productId}:${Date.now()}`;
        const granted = await onPaid(orderId);
        // A grant that failed keeps the record: the next sync finds the transaction and grants it.
        if (granted) await writeIntent(productId, null);
        return granted ? 'purchased' : 'failed';
      } catch (e) {
        const err = e as { userCancelled?: unknown; code?: unknown } | null;
        const cancelled = err?.userCancelled === true || err?.code === CANCELLED || /cancel/i.test(errorMessage(e));
        // Any other failure (a payment Play keeps pending is code '20') keeps the record: money may still change hands.
        if (cancelled) await writeIntent(productId, null);
        return cancelled ? 'cancelled' : 'failed';
      }
    },
    // RevenueCat finishes Play transactions itself; the pending orders are the transactions of purchases this device started and
    // has not granted (the record above). With no record there is nothing to ask the store.
    async pendingOrders() {
      const intents = await readIntents();
      if (Object.keys(intents).length === 0) return [];
      const P = await purchases();
      if (!P) return [];
      const info = customerInfo(await (P.getCustomerInfo ? P.getCustomerInfo() : P.restorePurchases()));
      const out: PendingOrder[] = [];
      for (const t of info.nonSubscriptionTransactions ?? []) {
        const orderId = t.transactionIdentifier ?? t.transactionId;
        const productId = t.productIdentifier ?? t.productId;
        const since = productId === undefined ? undefined : intents[productId];
        if (!orderId || !productId || since === undefined) continue;
        const at = Date.parse(t.purchaseDate ?? '');
        if (Number.isFinite(at) && at < since - INTENT_SKEW_MS) continue;
        pendingProduct.set(orderId, productId);
        out.push({ orderId, productId });
      }
      return out;
    },
    async completedOrders(): Promise<OrderRecord[]> {
      const P = await purchases();
      if (!P) return [];
      const info = customerInfo(await P.restorePurchases());
      const out: OrderRecord[] = [];
      for (const t of info.nonSubscriptionTransactions ?? []) {
        const orderId = t.transactionIdentifier ?? t.transactionId;
        const productId = t.productIdentifier ?? t.productId;
        if (orderId && productId) out.push({ orderId, productId, status: 'completed' });
      }
      return out;
    },
    async complete(orderId) {
      const productId = pendingProduct.get(orderId);
      if (productId === undefined) return;
      pendingProduct.delete(orderId);
      await writeIntent(productId, null);
    },
  };

  return {
    id: 'capacitor',
    marker: 'platform-adapter:capacitor',
    capabilities: {
      rewardedAds: true,
      interstitialAds: false,
      iap: true,
      adFreePurchase: true,
      leaderboard: false,
      cloudSave: false,
      usesPageVisibility: true,
      externalLinksAllowed: true,
      managesAdFrequency: false,
    },
    async init() {
      await loadPlugins().catch(() => undefined);
      const p = plugins();
      const AdMob = p?.AdMob;
      if (AdMob) {
        // Not awaited: the SDK (and a consent form, where one is required) starts behind the first screen.
        void (async () => {
          await AdMob.initialize({ initializeForTesting: testing() });
          const ev = events();
          await listen(
            ev.rewardLoaded,
            () => {
              clearTimeout(loadTimer);
              slot = 'loaded';
            },
            permanent,
          );
          await listen(ev.rewardFailedToLoad, retryLater, permanent);
          sdkReady = true;
          await askConsent();
        })().catch(() => {
          /* AdMob failed to start: ads stay unavailable, the game is not affected */
        });
      }
      const App = p?.App;
      if (App) {
        try {
          const h = await App.addListener('appStateChange', ({ isActive }) =>
            isActive ? resumeSignal.emit() : pauseSignal.emit(),
          );
          if (h) permanent.push(h);
        } catch {
          /* no app lifecycle plugin */
        }
      }
    },
    lifecycle: {
      loadingStart: () => undefined,
      loadingFinished: () => undefined,
      firstFrameReady: () => undefined,
      gameReady: () => undefined,
      gameplayStart: () => undefined,
      gameplayStop: () => undefined,
      onPause: (cb) => pauseSignal.on(cb),
      onResume: (cb) => resumeSignal.on(cb),
      happyMoment: () => undefined,
    },
    ads: {
      isAvailable: (kind) => kind === 'rewarded' && slot === 'loaded' && enabled(),
      preload: (kind) => {
        if (kind === 'rewarded') preload();
      },
      show: async (kind) => (kind === 'rewarded' ? show() : { shown: false, error: 'unsupported' }),
    },
    storage,
    iap,
  };
}
