/**
 * Capacitor (Android / iOS store build) adapter. The plugins are npm packages that are NOT installed
 * here: the adapter looks them up at runtime in `window.Capacitor.Plugins` (or the objects given to
 * registerCapacitorPlugins()) and degrades to "unavailable" when a plugin is missing.
 * Docs relied on (fetched 2026-10-06):
 *   https://github.com/capacitor-community/admob   AdMob.initialize, prepareRewardVideoAd/showRewardVideoAd
 *        (-> AdMobRewardItem {type, amount}), prepareInterstitial/showInterstitial, addListener, AdOptions
 *        {adId, isTesting}
 *   RewardAdPluginEvents (raw file src/reward/reward-ad-plugin-events.enum.ts): Loaded 'onRewardedVideoAdLoaded',
 *        FailedToLoad ..'FailedToLoad', FailedToShow ..'FailedToShow', Dismissed ..'Dismissed', Rewarded 'onRewardedVideoAdReward'
 *   InterstitialAdPluginEvents (raw file): 'interstitialAdLoaded' / 'FailedToLoad' / 'FailedToShow' / 'Dismissed'
 *   https://capacitorjs.com/docs/apis/preferences  Preferences.get/set/remove({key, value})
 *   https://capacitorjs.com/docs/apis/app          App.addListener('appStateChange', ({isActive}) => ...)
 * NOT confirmed (see README / final report): RevenueCat's Capacitor surface (getProducts,
 * purchaseStoreProduct, transaction.transactionIdentifier, userCancelled) and that
 * `Capacitor.Plugins.<Name>` exposes plugins that the app code never imported.
 * Ad unit ids: VITE_ADMOB_REWARDED_ID / VITE_ADMOB_INTERSTITIAL_ID; VITE_ADMOB_TESTING=1 or a dev
 * build uses AdMob test mode. EEA consent (UMP) is NOT handled here.
 */
import {
  getCapacitorAdMobEvents,
  getCapacitorPlugins,
  type CapAdMobEvents,
  type CapListenerHandle,
  type CapacitorPlugins,
} from '../bridges';
import { createLocalStorageBackend, safeStorage } from '../storage';
import type { AdKind, AdResult, IapOutcome, PlatformAdapter, PlatformIap } from '../types';
import { errorMessage, safe, Signal } from '../util';

/** GDD 8.1: interstitials are off by default on store builds. Flip to enable. */
const INTERSTITIALS_ENABLED = false;

const DEFAULT_EVENTS: CapAdMobEvents = {
  rewardLoaded: 'onRewardedVideoAdLoaded',
  rewardFailedToLoad: 'onRewardedVideoAdFailedToLoad',
  rewardFailedToShow: 'onRewardedVideoAdFailedToShow',
  rewardDismissed: 'onRewardedVideoAdDismissed',
  rewardRewarded: 'onRewardedVideoAdReward',
  interstitialLoaded: 'interstitialAdLoaded',
  interstitialFailedToLoad: 'interstitialAdFailedToLoad',
  interstitialFailedToShow: 'interstitialAdFailedToShow',
  interstitialDismissed: 'interstitialAdDismissed',
};

const events = (): CapAdMobEvents => ({ ...DEFAULT_EVENTS, ...getCapacitorAdMobEvents() });
const plugins = (): CapacitorPlugins | null => getCapacitorPlugins();

function adUnitId(kind: AdKind): string | undefined {
  const v: unknown =
    kind === 'rewarded' ? import.meta.env.VITE_ADMOB_REWARDED_ID : import.meta.env.VITE_ADMOB_INTERSTITIAL_ID;
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

export function createAdapter(): PlatformAdapter {
  type Slot = { state: 'idle' | 'loading' | 'loaded' };
  const slots: Record<AdKind, Slot> = { rewarded: { state: 'idle' }, interstitial: { state: 'idle' } };
  const permanent: CapListenerHandle[] = [];
  const pauseSignal = new Signal();
  const resumeSignal = new Signal();

  const enabled = (kind: AdKind): boolean =>
    (kind === 'rewarded' || INTERSTITIALS_ENABLED) && plugins()?.AdMob !== undefined && adUnitId(kind) !== undefined;

  const preload = (kind: AdKind): void => {
    const AdMob = plugins()?.AdMob;
    const adId = adUnitId(kind);
    const slot = slots[kind];
    if (!AdMob || !adId || !enabled(kind) || slot.state !== 'idle') return;
    slot.state = 'loading';
    const fail = (): void => {
      slot.state = 'idle';
      setTimeout(() => preload(kind), 30_000);
    };
    const opts = { adId, isTesting: testing() };
    const p = kind === 'rewarded' ? AdMob.prepareRewardVideoAd(opts) : AdMob.prepareInterstitial(opts);
    // The Loaded / FailedToLoad listeners set the slot; a rejected prepare call also means "no ad".
    Promise.resolve(p).catch(fail);
  };

  const show = async (kind: AdKind): Promise<AdResult> => {
    const AdMob = plugins()?.AdMob;
    const slot = slots[kind];
    if (!AdMob || !enabled(kind)) return { shown: false, error: 'unavailable' };
    if (slot.state !== 'loaded') return { shown: false, error: 'not_loaded' };
    slot.state = 'idle'; // consumed by this show
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
      const rewardedKind = kind === 'rewarded';
      const dismissed = rewardedKind ? ev.rewardDismissed : ev.interstitialDismissed;
      const failedToShow = rewardedKind ? ev.rewardFailedToShow : ev.interstitialFailedToShow;
      const setup = async (): Promise<void> => {
        await listen(dismissed, () => settle({ shown: true, rewarded }), bucket);
        await listen(failedToShow, () => settle({ shown: false, error: 'failedToShow' }), bucket);
        // The plugin's Rewarded event: the SDK's own completion signal.
        if (rewardedKind) await listen(ev.rewardRewarded, () => (rewarded = true), bucket);
        if (settled) removeAll(bucket);
        const out = rewardedKind ? await AdMob.showRewardVideoAd() : await AdMob.showInterstitial();
        // showRewardVideoAd() resolves with the AdMobRewardItem once the reward is earned: the same
        // signal as the Rewarded event, accepted too so a renamed event string cannot lose a reward.
        if (rewardedKind && out && typeof (out as { amount?: unknown }).amount === 'number') rewarded = true;
        // Interstitials resolve after the ad; rewarded ads are settled by the Dismissed event.
        if (!rewardedKind) settle({ shown: true });
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
    complete: async () => undefined,
  };

  return {
    id: 'capacitor',
    marker: 'platform-adapter:capacitor',
    capabilities: {
      rewardedAds: true,
      interstitialAds: INTERSTITIALS_ENABLED,
      iap: true,
      adFreePurchase: true,
      leaderboard: false,
      cloudSave: false,
      usesPageVisibility: true,
      externalLinksAllowed: true,
    },
    async init() {
      const p = plugins();
      if (p?.AdMob) {
        try {
          await p.AdMob.initialize({ initializeForTesting: testing() });
          const ev = events();
          const setSlot = (kind: AdKind, state: Slot['state']) => () => {
            slots[kind].state = state;
          };
          await listen(ev.rewardLoaded, setSlot('rewarded', 'loaded'), permanent);
          await listen(
            ev.rewardFailedToLoad,
            () => {
              slots.rewarded.state = 'idle';
              setTimeout(() => preload('rewarded'), 30_000);
            },
            permanent,
          );
          if (INTERSTITIALS_ENABLED) {
            await listen(ev.interstitialLoaded, setSlot('interstitial', 'loaded'), permanent);
            await listen(
              ev.interstitialFailedToLoad,
              () => {
                slots.interstitial.state = 'idle';
                setTimeout(() => preload('interstitial'), 30_000);
              },
              permanent,
            );
          }
          preload('rewarded');
          preload('interstitial');
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
      isAvailable: (kind) => slots[kind].state === 'loaded' && enabled(kind),
      preload: (kind) => preload(kind),
      show: (kind) => show(kind),
    },
    storage,
    iap,
  };
}
