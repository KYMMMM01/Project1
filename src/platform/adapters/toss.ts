/**
 * Apps in Toss adapter. The SDK (@apps-in-toss/web-framework) is an npm package that is NOT installed
 * here: this adapter talks to a typed bridge registered through registerTossBridge() (bridges.ts) and
 * degrades to "unavailable" (no ads, no purchases, localStorage) while the bridge is missing.
 * Docs relied on (fetched 2026-10-06), all under https://developers-apps-in-toss.toss.im/documentation/sdk/domains-api/ :
 *   ads/googleadmob.showappsintossadmob   showAppsInTossAdMob({options:{adGroupId}, onEvent, onError}) -> cleanup,
 *        events requested|show|impression|clicked|dismissed|failedToShow|userEarnedReward{unitType,unitAmount};
 *        "grant rewards only on userEarnedReward; dismissed alone cannot confirm completion"
 *   ads/googleadmob.loadappsintossadmob   loadAppsInTossAdMob(...) -> cleanup, event {type:'loaded'}, `.isSupported()`;
 *        ads cannot be reused after display, load again
 *   iap/iap.createonetimepurchaseorder   createOneTimePurchaseOrder({options:{sku, processProductGrant},
 *        onEvent {type:'success', data:{orderId,...}}, onError}) -> cleanup; error codes USER_CANCELED,
 *        ITEM_ALREADY_OWNED, UNSUPPORTED_APP_VERSION; cleanup MUST be called when the flow ends
 *   iap/iap.getpendingorders, iap/iap.completeproductgrant   {orders:[{orderId, sku, paymentCompletedDate}]},
 *        completeProductGrant({params:{orderId}}) -> Promise<boolean>
 *   iap/iap.getcompletedorrefundedorders   getCompletedOrRefundedOrders() -> {hasNext, nextKey, orders:[{orderId,
 *        sku, status 'COMPLETED'|'REFUNDED', date}]}; the web SDK takes no parameters and always returns the first
 *        page; needs Toss app 5.231.0+ (older apps throw UNSUPPORTED_APP_VERSION)
 *   storage/storage.getitem|setitem      Storage.getItem(key): Promise<string|null>, setItem(key, value)
 *   game/game.setleaderboardscore (+ common/growth/game-center)   submitGameCenterLeaderBoardScore({score: string})
 *   common/authentication/hash-key       getUserKeyForGame() -> {type:'HASH', hash} | 'INVALID_CATEGORY' | 'ERROR' | undefined
 * Interstitials are portal-only (GDD 8.1), so loadFullScreenAd/showFullScreenAd are never used here.
 * Ad group id comes from VITE_TOSS_REWARDED_AD_GROUP_ID.
 */
import { getTossBridge } from '../bridges';
import { createLocalStorageBackend, safeStorage } from '../storage';
import type { AdResult, IapOutcome, OrderRecord, PendingOrder, PlatformAdapter, PlatformIap } from '../types';
import { errorMessage, safe } from '../util';

/** A load that neither succeeded nor failed within this long is abandoned and retried. */
const LOAD_TIMEOUT_MS = 20_000;
const RETRY_MS = 30_000;

function adGroupId(): string | undefined {
  const v: unknown = import.meta.env.VITE_TOSS_REWARDED_AD_GROUP_ID;
  return typeof v === 'string' && v !== '' ? v : undefined;
}

function supported(fn: { isSupported?: () => boolean } | undefined): boolean {
  if (!fn) return false;
  try {
    return fn.isSupported ? fn.isSupported() : true;
  } catch {
    return false;
  }
}

const isCancel = (e: unknown): boolean => errorMessage(e).includes('USER_CANCELED');

export function createAdapter(): PlatformAdapter {
  let slot: 'idle' | 'loading' | 'loaded' = 'idle';
  let loadTimer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const usable = (): boolean => {
    const ad = getTossBridge()?.GoogleAdMob;
    return adGroupId() !== undefined && supported(ad?.loadAppsInTossAdMob) && supported(ad?.showAppsInTossAdMob);
  };

  const preload = (): void => {
    const load = getTossBridge()?.GoogleAdMob?.loadAppsInTossAdMob;
    const id = adGroupId();
    if (slot !== 'idle' || !load || !id || !usable()) return;
    clearTimeout(retryTimer);
    slot = 'loading';
    let cleanup: (() => void) | undefined;
    let ended = false;
    const end = (): void => {
      ended = true;
      clearTimeout(loadTimer);
      safe(() => cleanup?.());
    };
    const fail = (): void => {
      if (ended) return;
      slot = 'idle';
      end();
      // No fill / transient error: try again later.
      retryTimer = setTimeout(preload, RETRY_MS);
    };
    loadTimer = setTimeout(fail, LOAD_TIMEOUT_MS);
    try {
      cleanup = load({
        options: { adGroupId: id },
        onEvent: (e) => {
          if (e.type === 'loaded') {
            slot = 'loaded';
            end();
          }
        },
        onError: fail,
      });
      if (ended) safe(() => cleanup?.());
    } catch {
      fail();
    }
  };

  const show = (): Promise<AdResult> =>
    new Promise<AdResult>((resolve) => {
      const fn = getTossBridge()?.GoogleAdMob?.showAppsInTossAdMob;
      const id = adGroupId();
      if (!fn || !id || !usable()) return resolve({ shown: false, error: 'unavailable' });
      // Ads must be preloaded (Toss review rule); an ad that is not loaded cannot be shown.
      if (slot !== 'loaded') return resolve({ shown: false, error: 'not_loaded' });
      slot = 'idle'; // an ad cannot be reused after it was displayed
      let shown = false;
      let rewarded = false;
      let settled = false;
      let cleanup: (() => void) | undefined;
      const settle = (r: AdResult): void => {
        if (settled) return;
        settled = true;
        safe(() => cleanup?.());
        resolve(r);
      };
      try {
        cleanup = fn({
          options: { adGroupId: id },
          onEvent: (e) => {
            switch (e.type) {
              case 'show':
              case 'impression':
                shown = true;
                break;
              case 'userEarnedReward':
                // The only reward signal; `dismissed` alone proves nothing.
                shown = true;
                rewarded = true;
                break;
              case 'dismissed':
                settle({ shown: true, rewarded });
                break;
              case 'failedToShow':
                settle({ shown: false, error: 'failedToShow' });
                break;
              default:
                break;
            }
          },
          onError: (err) => settle({ shown, rewarded, error: errorMessage(err) }),
        });
        if (settled) safe(() => cleanup?.());
      } catch (e) {
        settle({ shown: false, error: errorMessage(e) });
      }
    });

  const local = createLocalStorageBackend();
  const storage = safeStorage(
    {
      async get(key) {
        const s = getTossBridge()?.Storage;
        return s ? ((await s.getItem(key)) ?? null) : local.get(key);
      },
      async set(key, value) {
        const s = getTossBridge()?.Storage;
        if (s) await s.setItem(key, value);
        else await local.set(key, value);
      },
      async remove(key) {
        const s = getTossBridge()?.Storage;
        if (s) await s.removeItem(key);
        else await local.remove(key);
      },
    },
    // Native Storage size limit is not documented; stay well under 1 MB (research asks for < 500 KiB).
    { maxBytes: 1_000_000, label: 'toss.Storage' },
  );

  const iap: PlatformIap = {
    isAvailable: () => getTossBridge()?.IAP !== undefined,
    async products(ids) {
      const list = (await getTossBridge()?.IAP?.getProductItemList?.())?.products ?? [];
      return list
        .filter((p) => ids.includes(p.sku) && typeof p.displayAmount === 'string' && p.displayAmount !== '')
        .map((p) => ({ id: p.sku, priceText: p.displayAmount as string }));
    },
    purchase(productId, onPaid) {
      const api = getTossBridge()?.IAP;
      if (!api) return Promise.resolve<IapOutcome>('unavailable');
      return new Promise<IapOutcome>((resolve) => {
        let settled = false;
        let cleanup: (() => void) | undefined;
        let grant: Promise<boolean> | null = null;
        let sdkGrantCalled = false;
        const finish = (o: IapOutcome): void => {
          if (settled) return;
          settled = true;
          safe(() => cleanup?.()); // the docs: cleanup MUST be called when the flow ends
          resolve(o);
        };
        const grantOnce = (orderId: string): Promise<boolean> => (grant ??= onPaid(orderId));
        try {
          cleanup = api.createOneTimePurchaseOrder({
            options: {
              sku: productId,
              // The SDK completes the order itself when this resolves true.
              processProductGrant: async (arg: unknown) => {
                sdkGrantCalled = true;
                const orderId = typeof arg === 'string' ? arg : (arg as { orderId?: string } | undefined)?.orderId;
                if (!orderId) return false;
                try {
                  return await grantOnce(orderId);
                } catch {
                  return false;
                }
              },
            },
            onEvent: (e) => {
              if (e.type !== 'success') return;
              const orderId = e.data?.orderId;
              if (typeof orderId !== 'string') return finish('failed');
              grantOnce(orderId)
                .then(async (ok) => {
                  // processProductGrant never ran (older flow): complete the order ourselves.
                  if (ok && !sdkGrantCalled) await api.completeProductGrant({ params: { orderId } });
                  finish(ok ? 'purchased' : 'failed');
                })
                .catch(() => finish('failed'));
            },
            onError: (err) => finish(isCancel(err) ? 'cancelled' : 'failed'),
          });
          if (settled) safe(() => cleanup?.());
        } catch {
          finish('failed');
        }
      });
    },
    async pendingOrders(): Promise<PendingOrder[]> {
      const api = getTossBridge()?.IAP;
      if (!api) return [];
      const r = await api.getPendingOrders();
      return (r?.orders ?? []).map((o) => ({ orderId: o.orderId, productId: o.sku }));
    },
    async completedOrders(): Promise<OrderRecord[]> {
      const list = getTossBridge()?.IAP?.getCompletedOrRefundedOrders;
      if (!list) return [];
      // Only the first page: the web SDK takes no cursor. The local ledger covers older orders.
      const r = await list();
      return (r?.orders ?? []).map((o) => ({
        orderId: o.orderId,
        productId: o.sku,
        status: o.status === 'REFUNDED' ? 'refunded' : 'completed',
      }));
    },
    async complete(orderId) {
      await getTossBridge()?.IAP?.completeProductGrant({ params: { orderId } });
    },
  };

  return {
    id: 'toss',
    marker: 'platform-adapter:toss',
    capabilities: {
      rewardedAds: true,
      interstitialAds: false,
      iap: true,
      adFreePurchase: true,
      leaderboard: true,
      cloudSave: false,
      usesPageVisibility: true,
      externalLinksAllowed: false,
      managesAdFrequency: false,
    },
    async init() {
      // Nothing to await: the bridge is registered by the host app before initPlatform(). Start loading
      // the ad now so the first offer is ready (Toss review: ads must be preloaded).
      preload();
    },
    lifecycle: {
      loadingStart: () => undefined,
      loadingFinished: () => undefined,
      firstFrameReady: () => undefined,
      gameReady: () => undefined,
      gameplayStart: () => undefined,
      gameplayStop: () => undefined,
      onPause: () => () => undefined,
      onResume: () => () => undefined,
      happyMoment: () => undefined,
    },
    ads: {
      isAvailable: (kind) => kind === 'rewarded' && slot === 'loaded' && usable(),
      preload: (kind) => {
        if (kind === 'rewarded') preload();
      },
      show: async (kind) => (kind === 'rewarded' ? show() : { shown: false, error: 'unsupported' }),
    },
    storage,
    iap,
    identity: {
      async userKey() {
        const r = await getTossBridge()?.getUserKeyForGame?.();
        return r && typeof r === 'object' && r.type === 'HASH' ? r.hash : null;
      },
    },
    leaderboard: {
      async submit(_boardId, score) {
        const fn = getTossBridge()?.submitGameCenterLeaderBoardScore;
        if (!fn) return;
        try {
          // Toss takes the score as a string; the game center has one board, so the id is not used.
          await fn({ score: String(score) });
        } catch {
          /* best effort */
        }
      },
    },
  };
}
