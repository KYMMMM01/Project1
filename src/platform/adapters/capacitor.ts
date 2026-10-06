/**
 * Capacitor (Android / iOS store build) adapter. The plugins are npm packages that are NOT installed
 * here: the adapter looks them up at runtime in `window.Capacitor.Plugins` (or the objects given to
 * registerCapacitorPlugins()) and degrades to "unavailable" when a plugin is missing.
 * Docs relied on (fetched 2026-10-06):
 *   https://github.com/capacitor-community/admob   AdMob.initialize, prepareRewardVideoAd/showRewardVideoAd
 *        (-> AdMobRewardItem {type, amount}), addListener, AdOptions {adId, isTesting}
 *   RewardAdPluginEvents (raw file src/reward/reward-ad-plugin-events.enum.ts): Loaded 'onRewardedVideoAdLoaded',
 *        FailedToLoad ..'FailedToLoad', FailedToShow ..'FailedToShow', Dismissed ..'Dismissed', Rewarded 'onRewardedVideoAdReward'
 *   https://capacitorjs.com/docs/apis/preferences  Preferences.get/set/remove({key, value})
 *   https://capacitorjs.com/docs/apis/app          App.addListener('appStateChange', ({isActive}) => ...)
 *   https://www.revenuecat.com/docs/getting-started/restoring-purchases   `const customerInfo = await Purchases.restorePurchases()`
 *   https://www.revenuecat.com/docs/customers/customer-info   CustomerInfo has `nonSubscriptionTransactions`
 * NOT confirmed (see README / final report): the item fields of nonSubscriptionTransactions, whether it lists
 * consumables and non-consumables, whether refunds leave it, RevenueCat's getProducts / purchaseStoreProduct /
 * transaction.transactionIdentifier / userCancelled, and that `Capacitor.Plugins.<Name>` exposes plugins the
 * app code never imported.
 * Interstitials are portal-only (GDD 8.1), so the AdMob interstitial calls are never used here.
 * Ad unit id: VITE_ADMOB_REWARDED_ID; VITE_ADMOB_TESTING=1 or a dev build uses AdMob test mode.
 * EEA consent (UMP) is NOT handled here.
 */
import {
  getCapacitorAdMobEvents,
  getCapacitorPlugins,
  type CapAdMobEvents,
  type CapCustomerInfo,
  type CapListenerHandle,
  type CapRestoreResult,
  type CapacitorPlugins,
} from '../bridges';
import { createLocalStorageBackend, safeStorage } from '../storage';
import type { AdResult, IapOutcome, OrderRecord, PlatformAdapter, PlatformIap } from '../types';
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

const events = (): CapAdMobEvents => ({ ...DEFAULT_EVENTS, ...getCapacitorAdMobEvents() });
const plugins = (): CapacitorPlugins | null => getCapacitorPlugins();

function adUnitId(): string | undefined {
  const v: unknown = import.meta.env.VITE_ADMOB_REWARDED_ID;
  return typeof v === 'string' && v !== '' ? v : undefined;
}

const testing = (): boolean => import.meta.env.VITE_ADMOB_TESTING === '1' || import.meta.env.DEV === true;

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

  const enabled = (): boolean => plugins()?.AdMob !== undefined && adUnitId() !== undefined;

  const retryLater = (): void => {
    slot = 'idle';
    clearTimeout(loadTimer);
    clearTimeout(retryTimer);
    retryTimer = setTimeout(preload, RETRY_MS);
  };

  function preload(): void {
    const AdMob = plugins()?.AdMob;
    const adId = adUnitId();
    if (!AdMob || !adId || slot !== 'idle') return;
    clearTimeout(retryTimer);
    slot = 'loading';
    // The Loaded / FailedToLoad listeners settle the slot; a rejected prepare call or silence also means "no ad".
    loadTimer = setTimeout(retryLater, LOAD_TIMEOUT_MS);
    Promise.resolve(AdMob.prepareRewardVideoAd({ adId, isTesting: testing() })).catch(retryLater);
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

  const iap: PlatformIap = {
    isAvailable: () => plugins()?.Purchases !== undefined,
    async products(ids) {
      const P = plugins()?.Purchases;
      if (!P) return [];
      const { products } = await P.getProducts({ productIdentifiers: [...ids] });
      return products
        .filter((p) => typeof p.priceString === 'string' && p.priceString !== '')
        .map((p) => ({ id: p.identifier, priceText: p.priceString as string }));
    },
    async purchase(productId, onPaid): Promise<IapOutcome> {
      const P = plugins()?.Purchases;
      if (!P) return 'unavailable';
      try {
        const { products } = await P.getProducts({ productIdentifiers: [productId] });
        const product = products.find((p) => p.identifier === productId);
        if (!product) return 'failed';
        const res = await P.purchaseStoreProduct({ product });
        // The store transaction id is the order id. (Fallback id is NOT idempotent across restarts.)
        const orderId = res.transaction?.transactionIdentifier ?? `${productId}:${Date.now()}`;
        return (await onPaid(orderId)) ? 'purchased' : 'failed';
      } catch (e) {
        const cancelled = (e as { userCancelled?: unknown } | null)?.userCancelled === true;
        return cancelled || /cancel/i.test(errorMessage(e)) ? 'cancelled' : 'failed';
      }
    },
    // The store plugin finishes transactions itself and has no "pending orders" list.
    pendingOrders: async () => [],
    async completedOrders(): Promise<OrderRecord[]> {
      const P = plugins()?.Purchases;
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
    complete: async () => undefined,
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
      const p = plugins();
      if (p?.AdMob) {
        try {
          await p.AdMob.initialize({ initializeForTesting: testing() });
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
          preload();
        } catch {
          /* AdMob failed to initialise: ads stay unavailable, the game still starts */
        }
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
