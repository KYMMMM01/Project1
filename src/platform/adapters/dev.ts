/**
 * Dev adapter: a complete mock of every platform feature, drawn with the DOM overlay in devOverlay.ts.
 * No SDK, no network request. QA switches (read from the page URL at call time):
 *   ?adfail=1   ads are unavailable          ?adfast=1   ads last 0.3 s (automated tests)
 *   ?iapfail=1  the test payment fails       ?iapcrash=1 the app "dies" right after payment, leaving a
 *                                            paid-but-ungranted order that recoverPending() must finish
 */
import { createLocalStorageBackend, safeStorage } from '../storage';
import type { AdResult, IapOutcome, OrderRecord, PendingOrder, PlatformAdapter, PlatformIap } from '../types';
import { Signal } from '../util';
import { isOverlayOpen, overlayLeftovers, showInterstitialCard, showPurchaseSheet, showRewardedCard } from './devOverlay';

interface DevFlags {
  adfail: boolean;
  adfast: boolean;
  iapfail: boolean;
  iapcrash: boolean;
}

function flags(): DevFlags {
  let q: URLSearchParams;
  try {
    q = new URLSearchParams(location.search);
  } catch {
    q = new URLSearchParams();
  }
  const on = (k: string): boolean => q.get(k) === '1';
  return { adfail: on('adfail'), adfast: on('adfast'), iapfail: on('iapfail'), iapcrash: on('iapcrash') };
}

const PENDING_KEY = 'platform.dev.pendingOrders';
const COMPLETED_KEY = 'platform.dev.completedOrders';

export function createAdapter(): PlatformAdapter {
  const raw = createLocalStorageBackend();
  const storage = safeStorage(raw, { maxBytes: 4_000_000, label: 'dev.localStorage' });
  const pauseSignal = new Signal();
  const resumeSignal = new Signal();
  const calls: string[] = [];
  const note = (s: string): void => {
    calls.push(s);
    if (calls.length > 100) calls.shift();
  };

  const readRaw = async (key: string): Promise<unknown[]> => {
    try {
      const text = await raw.get(key);
      const j: unknown = text ? JSON.parse(text) : [];
      return Array.isArray(j) ? (j as unknown[]) : [];
    } catch {
      return [];
    }
  };
  const isOrder = (o: unknown): o is PendingOrder =>
    typeof o === 'object' && o !== null && typeof (o as PendingOrder).orderId === 'string' && typeof (o as PendingOrder).productId === 'string';
  const readPending = async (): Promise<PendingOrder[]> => (await readRaw(PENDING_KEY)).filter(isOrder);
  const readCompleted = async (): Promise<OrderRecord[]> =>
    (await readRaw(COMPLETED_KEY)).filter(
      (o): o is OrderRecord => isOrder(o) && ((o as OrderRecord).status === 'completed' || (o as OrderRecord).status === 'refunded'),
    );
  const write = (key: string, list: readonly object[]): Promise<void> => raw.set(key, JSON.stringify(list));

  const iap: PlatformIap = {
    async purchase(productId, onPaid, info): Promise<IapOutcome> {
      if (isOverlayOpen()) return 'unavailable';
      const f = flags();
      const mode = f.iapcrash ? 'crash' : f.iapfail ? 'fail' : 'ok';
      const result = await showPurchaseSheet({
        name: info?.name ?? productId,
        priceText: info?.priceText ?? '',
        mode,
        messageMs: f.adfast ? 300 : 1200,
      });
      note(`iap:${productId}:${result}`);
      if (result === 'cancelled') return 'cancelled';
      if (result === 'failed') return 'failed';
      // From here the "store" has taken the money: the order is pending until it is completed.
      const orderId = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      await write(PENDING_KEY, [...(await readPending()), { orderId, productId }]);
      if (result === 'crashed') return 'failed'; // the app "died": nothing was granted, recovery will
      const granted = await onPaid(orderId);
      if (!granted) return 'failed';
      await iap.complete(orderId);
      return 'purchased';
    },
    pendingOrders: readPending,
    async complete(orderId) {
      const pending = await readPending();
      const done = pending.find((o) => o.orderId === orderId);
      await write(
        PENDING_KEY,
        pending.filter((o) => o.orderId !== orderId),
      );
      if (done) await write(COMPLETED_KEY, [...(await readCompleted()), { ...done, status: 'completed' }]);
      note(`iap:complete:${orderId}`);
    },
    completedOrders: readCompleted,
  };

  /** QA: the store refunds the newest completed order (the next sync reports it to the revoke handler). */
  const refundLast = async (): Promise<string> => {
    const list = await readCompleted();
    const target = [...list].reverse().find((o) => o.status === 'completed');
    if (!target) return '';
    target.status = 'refunded';
    await write(COMPLETED_KEY, list);
    note(`iap:refund:${target.orderId}`);
    return target.orderId;
  };

  return {
    id: 'dev',
    marker: 'platform-adapter:dev',
    capabilities: {
      rewardedAds: true,
      interstitialAds: true,
      iap: true,
      adFreePurchase: true,
      leaderboard: true,
      cloudSave: false,
      usesPageVisibility: true,
      externalLinksAllowed: true,
      managesAdFrequency: false,
    },
    init: async () => undefined,
    lifecycle: {
      loadingStart: () => note('loadingStart'),
      loadingFinished: () => note('loadingFinished'),
      firstFrameReady: () => note('firstFrameReady'),
      gameReady: () => note('gameReady'),
      gameplayStart: () => note('gameplayStart'),
      gameplayStop: () => note('gameplayStop'),
      onPause: (cb) => pauseSignal.on(cb),
      onResume: (cb) => resumeSignal.on(cb),
      happyMoment: (i) => note(`happyMoment:${i ?? ''}`),
    },
    ads: {
      isAvailable: () => !flags().adfail,
      preload: () => undefined,
      async show(kind, placement): Promise<AdResult> {
        const f = flags();
        if (f.adfail) return { shown: false, error: 'adfail' };
        if (isOverlayOpen()) return { shown: false, error: 'busy' };
        note(`ad:${kind}:${placement}`);
        if (kind === 'rewarded') {
          const r = await showRewardedCard({ seconds: f.adfast ? 0.3 : 5, placement });
          // Only the "claim reward" button is the completion signal; closing early is a dismissal.
          return { shown: true, rewarded: r === 'claimed' };
        }
        await showInterstitialCard({ seconds: f.adfast ? 0.3 : 3, reason: placement });
        return { shown: true };
      },
    },
    storage,
    iap,
    identity: { userKey: async () => 'dev-user' },
    leaderboard: {
      submit: async (boardId, score) => {
        note(`leaderboard:${boardId}:${score}`);
      },
    },
    debug: {
      calls: () => calls.slice(),
      overlayOpen: () => isOverlayOpen(),
      overlayLeftovers: () => overlayLeftovers(),
      triggerPause: () => pauseSignal.emit(),
      triggerResume: () => resumeSignal.emit(),
      refundLast,
      completedOrders: readCompleted,
    },
  };
}
