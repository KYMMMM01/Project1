/**
 * initPlatform(): the one boot call. Resolves the build's adapter, initialises it (5 s timeout, then a
 * safe no-ads adapter so the game ALWAYS starts), installs its storage into core/save, wires lifecycle
 * pause/resume (the adapter's own signal and the page being hidden) and the system mute signal to the
 * game, and returns the services.
 */
import { game } from '@/core/game';
import { debugExpose } from '@/core/debug';
import { setStorageBackend } from '@/core/save';
import { audio } from '@/audio';
import { normalizeCounters, type AdCounters } from './adPolicy';
import { createFallbackAdapter } from './fallback';
import { normalizeLedger, type IapLedger } from './iapService';
import { setInputShield } from './inputShield';
import { domPageSource, wireLifecycle } from './lifecycle';
import type { Pauser } from './modal';
import { resolveAdapter, PLATFORM_ID } from './resolve';
import { preparePlatformRuntime } from './runtime';
import { ads, analytics, iap, installAdapter, lifecycleSignals, platform, setPauser } from './registry';
import { createStoragePersistence } from './storage';
import type { PlatformAdapter } from './types';
import { safe, settleWithin } from './util';

export const INIT_TIMEOUT_MS = 5000;

export interface PlatformServices {
  platform: typeof platform;
  ads: typeof ads;
  iap: typeof iap;
  analytics: typeof analytics;
}

/** What the pause/mute layer is doing right now (QA and the demo read this). */
export interface PauseState {
  /** Open game.setExternalPause(true) calls. */
  pausedDepth: number;
  /** Open audio.setMuted(true) calls. */
  mutedDepth: number;
}

const pauseState: PauseState = { pausedDepth: 0, mutedDepth: 0 };
export function getPauseState(): Readonly<PauseState> {
  return pauseState;
}

// The real pause/mute: game.setExternalPause + audio.setMuted, with counters so QA can see them.
// Ads, purchase sheets, platform pause signals and the system mute all go through it; only modals
// (ads, purchase sheets) also raise the input shield.
const realPauser: Pauser = {
  setInputBlocked: setInputShield,
  setPaused(paused) {
    pauseState.pausedDepth = Math.max(0, pauseState.pausedDepth + (paused ? 1 : -1));
    game.setExternalPause(paused);
  },
  setMuted(muted) {
    pauseState.mutedDepth = Math.max(0, pauseState.mutedDepth + (muted ? 1 : -1));
    audio.setMuted(muted);
  },
};
setPauser(realPauser);

let booting: Promise<PlatformServices> | null = null;
let bootResult: 'ok' | 'fallback' | null = null;

/** 'ok' when the platform adapter initialised, 'fallback' when it timed out/failed, null before boot finished. */
export function getBootResult(): 'ok' | 'fallback' | null {
  return bootResult;
}

/** Idempotent: every caller gets the same promise. Never rejects. */
export function initPlatform(): Promise<PlatformServices> {
  booting ??= doInit().catch((e: unknown) => {
    // Unreachable in practice (every step above is guarded); the game must start no matter what.
    try {
      console.warn('[platform] boot failed, running on the safe fallback:', e);
    } catch {
      /* ignore */
    }
    bootResult = 'fallback';
    return { platform, ads, iap, analytics };
  });
  return booting;
}

async function loadAndInit(): Promise<PlatformAdapter | null> {
  try {
    const adapter = await resolveAdapter();
    await adapter.init();
    return adapter;
  } catch (e) {
    try {
      console.warn(`[platform] ${PLATFORM_ID} adapter failed to initialise, using safe fallback:`, e);
    } catch {
      /* ignore */
    }
    return null;
  }
}

async function doInit(): Promise<PlatformServices> {
  // Best effort and idempotent; ideally main.ts already awaited it before game.init() (README).
  await preparePlatformRuntime().catch(() => undefined);
  let adapter = await settleWithin<PlatformAdapter | null>(loadAndInit(), INIT_TIMEOUT_MS, null);
  if (adapter) {
    bootResult = 'ok';
  } else {
    bootResult = 'fallback';
    adapter = createFallbackAdapter();
  }
  installAdapter(adapter);

  // Storage: every SaveStore from now on goes through the platform.
  setStorageBackend(adapter.storage);

  // Visibility: YouTube forbids the Page Visibility API and delivers its own pause/resume instead.
  game.pauseOnHidden = adapter.capabilities.usesPageVisibility;
  wireLifecycle(adapter, {
    pauser: realPauser,
    signals: lifecycleSignals,
    // Anything paid while we were away (a purchase sheet that outlived its watchdog).
    onResumed: () => void iap.recoverPending(),
    page: domPageSource(),
  });
  wireSystemAudio(adapter);

  // Counters and the order ledger live in platform storage until the meta layer attaches the profile.
  const adStore = createStoragePersistence<AdCounters>(adapter.storage, 'platform.ads.v1', normalizeCounters);
  const ledgerStore = createStoragePersistence<IapLedger>(adapter.storage, 'platform.iap.ledger.v1', normalizeLedger);
  await Promise.all([adStore.hydrate(), ledgerStore.hydrate()]);
  ads.attachPersistence(adStore);
  iap.attachLedger(ledgerStore);

  ads.warm();
  // Restore purchases without a server: finish pending orders, re-grant completed ones the ledger lacks,
  // report refunds. Deferred until a grant handler exists; not awaited so a slow platform call can
  // never delay the first frame.
  void iap.restorePurchases();
  void iap.refreshPrices();

  debugExpose('analytics', analytics.debugApi());
  return { platform, ads, iap, analytics };
}

function wireSystemAudio(adapter: PlatformAdapter): void {
  const sys = adapter.audio;
  if (!sys) return;
  let muted = false;
  const apply = (m: boolean): void => {
    if (m === muted) return;
    muted = m;
    realPauser.setMuted(m);
  };
  safe(() => apply(sys.isSystemMuted()));
  safe(() => sys.onSystemMuteChange(apply));
}
