/** Shared fakes for the platform tests (not a test file itself). Node only: no DOM, no SDK. */
import { Analytics } from '@/platform/analytics';
import { AdService, type AdServiceDeps } from '@/platform/adService';
import { ModalGate, type Pauser } from '@/platform/modal';
import { noopLifecycle } from '@/platform/fallback';
import { createMemoryBackend, safeStorage } from '@/platform/storage';
import { IapService, createMemoryLedgerStore, type IapLedgerStore } from '@/platform/iapService';
import type {
  AdResult,
  IapOutcome,
  OrderRecord,
  PendingOrder,
  PlatformAdapter,
  PlatformCapabilities,
} from '@/platform/types';

/** Records every pause/mute/input-block call in order, like game.setExternalPause + audio.setMuted + the shield would see them. */
export function makePauser(): {
  pauser: Pauser;
  calls: string[];
  depth: { paused: number; muted: number; blocked: number };
} {
  const calls: string[] = [];
  const depth = { paused: 0, muted: 0, blocked: 0 };
  const pauser: Pauser = {
    setInputBlocked(b) {
      calls.push(`block:${b}`);
      depth.blocked += b ? 1 : -1;
    },
    setPaused(p) {
      calls.push(`pause:${p}`);
      depth.paused += p ? 1 : -1;
    },
    setMuted(m) {
      calls.push(`mute:${m}`);
      depth.muted += m ? 1 : -1;
    },
  };
  return { pauser, calls, depth };
}

export interface FakeAdapterState {
  available: boolean;
  /** What the next show() does. */
  next: AdResult | (() => Promise<AdResult>);
  /** Pending platform orders for the IAP fake. */
  pending: PendingOrder[];
  /** Orders the platform was told are complete. */
  completed: string[];
  /** What the platform lists as completed or refunded (delete adapter.iap.completedOrders for a platform with no listing). */
  listing: OrderRecord[];
  /** What the next purchase() flow does. */
  purchase: (onPaid: (orderId: string) => Promise<boolean>, productId: string) => Promise<IapOutcome>;
  iapAvailable: boolean;
}

export interface FakeAdapter {
  adapter: PlatformAdapter;
  state: FakeAdapterState;
  log: string[];
}

export function fakeAdapter(caps: Partial<PlatformCapabilities> = {}): FakeAdapter {
  const log: string[] = [];
  const state: FakeAdapterState = {
    available: true,
    next: { shown: true, rewarded: true },
    pending: [],
    completed: [],
    listing: [],
    iapAvailable: true,
    purchase: async (onPaid, productId) => {
      const orderId = `order-${productId}-${state.pending.length + state.completed.length + 1}`;
      state.pending.push({ orderId, productId });
      return (await onPaid(orderId)) ? 'purchased' : 'failed';
    },
  };
  const adapter: PlatformAdapter = {
    id: 'dev',
    marker: 'platform-adapter:fake',
    capabilities: {
      rewardedAds: true,
      interstitialAds: true,
      iap: true,
      adFreePurchase: true,
      leaderboard: false,
      cloudSave: false,
      usesPageVisibility: true,
      externalLinksAllowed: true,
      managesAdFrequency: false,
      ...caps,
    },
    init: async () => undefined,
    lifecycle: noopLifecycle(),
    ads: {
      isAvailable: () => state.available,
      preload: (kind, placement) => {
        log.push(`preload:${kind}:${placement}`);
      },
      show: async (kind, placement) => {
        log.push(`show:${kind}:${placement}`);
        return typeof state.next === 'function' ? state.next() : state.next;
      },
    },
    storage: safeStorage(createMemoryBackend(), { maxBytes: 1_000_000 }),
    iap: {
      isAvailable: () => state.iapAvailable,
      purchase: (productId, onPaid) => state.purchase(onPaid, productId),
      pendingOrders: async () => state.pending.slice(),
      complete: async (orderId) => {
        state.completed.push(orderId);
        state.pending = state.pending.filter((o) => o.orderId !== orderId);
      },
    },
  };
  const iap = adapter.iap;
  if (iap) iap.completedOrders = async () => state.listing.slice();
  return { adapter, state, log };
}

export interface Clock {
  t: number;
  now: () => number;
  advance(ms: number): void;
}

/** A controllable wall clock starting 2026-10-06 12:00 local time. */
export function makeClock(start = new Date(2026, 9, 6, 12, 0, 0).getTime()): Clock {
  const c: Clock = {
    t: start,
    now: () => c.t,
    advance(ms) {
      c.t += ms;
    },
  };
  return c;
}

export function makeAds(
  opts: {
    caps?: Partial<PlatformCapabilities>;
    deps?: Partial<AdServiceDeps>;
    skipFtue?: boolean;
  } = {},
) {
  const fake = fakeAdapter(opts.caps);
  const p = makePauser();
  const modal = new ModalGate(p.pauser);
  const clock = makeClock();
  const analytics = new Analytics();
  const ads = new AdService({
    getAdapter: () => fake.adapter,
    modal,
    analytics,
    now: clock.now,
    sessionId: 'session-1',
    ...opts.deps,
  });
  // Most tests want to be past "first session" and "first run": 2nd session, 2 runs begun, 3 completed.
  if (opts.skipFtue !== false) ads.qaSetProgress({ sessions: 2, runsBegun: 2, runsCompleted: 3 });
  return { ads, fake, pauser: p, modal, clock, analytics };
}

export function makeIap(
  opts: {
    ledger?: IapLedgerStore;
    fake?: FakeAdapter;
    pauser?: ReturnType<typeof makePauser>;
    purchaseWatchdogMs?: number;
    callTimeoutMs?: number;
    channel?: string;
  } = {},
) {
  const fake = opts.fake ?? fakeAdapter();
  const p = opts.pauser ?? makePauser();
  const modal = new ModalGate(p.pauser);
  const analytics = new Analytics();
  const ledger = opts.ledger ?? createMemoryLedgerStore();
  const clock = makeClock();
  const iap = new IapService({
    getAdapter: () => fake.adapter,
    modal,
    analytics,
    ledger,
    now: clock.now,
    lang: () => 'en',
    channel: opts.channel,
    purchaseWatchdogMs: opts.purchaseWatchdogMs,
    callTimeoutMs: opts.callTimeoutMs,
  });
  iap.registerProducts([
    { id: 'gems_80', type: 'consumable', price: { ko: '₩1,500', en: '$1.29' }, name: { ko: '보석 80개', en: '80 Gems' } },
    { id: 'premium_pass', type: 'nonConsumable', price: { ko: '₩9,900', en: '$7.99' } },
  ]);
  return { iap, fake, pauser: p, modal, analytics, ledger };
}
