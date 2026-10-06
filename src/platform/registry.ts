/**
 * The singletons every module imports: { ads, iap, analytics, platform }. They exist from the first
 * import, backed by the safe no-ads fallback adapter, so a call made before initPlatform() resolves
 * (ads -> 'unavailable', purchases -> 'unavailable', storage -> localStorage) and never throws.
 * boot.ts swaps the real adapter in. Pure: no game/audio/pixi imports, node-safe.
 */
import { Analytics } from './analytics';
import { AdService } from './adService';
import { IapService } from './iapService';
import { createFallbackAdapter } from './fallback';
import { createScoreSubmitter } from './leaderboard';
import { ModalGate, type Pauser } from './modal';
import { PLATFORM_ID } from './resolve';
import type { PlatformAdapter, PlatformLifecycle } from './types';
import { Signal, safe } from './util';

let current: PlatformAdapter = createFallbackAdapter();

/** Console mirror of analytics events in dev builds only (docs/명세_메타.md section 11). */
const DEV_SINK =
  import.meta.env.DEV || import.meta.env.VITE_PLATFORM === undefined || import.meta.env.VITE_PLATFORM === 'dev';

export const analytics = new Analytics({ console: DEV_SINK });

// The pause/mute implementation is injected by boot.ts (game.setExternalPause + audio.setMuted).
let pauserImpl: Pauser = { setPaused: () => undefined, setMuted: () => undefined };
export function setPauser(p: Pauser): void {
  pauserImpl = p;
}
const pauser: Pauser = {
  setPaused: (v) => pauserImpl.setPaused(v),
  setMuted: (v) => pauserImpl.setMuted(v),
  setInputBlocked: (v) => pauserImpl.setInputBlocked?.(v),
};

/** Shared by ads and purchases: only one modal at a time. */
export const modal = new ModalGate(pauser);

export const ads = new AdService({ getAdapter: () => current, modal, analytics });
export const iap = new IapService({ getAdapter: () => current, modal, analytics, channel: PLATFORM_ID });

/** submitScore(boardId, score): forwards to the platform's leaderboard, a no-op where there is none. */
export const submitScore = createScoreSubmitter(() => current);

// Lifecycle signals survive an adapter swap: callers subscribe here once, boot forwards the adapter's.
const pauseSignal = new Signal();
const resumeSignal = new Signal();
export const lifecycleSignals = { pause: pauseSignal, resume: resumeSignal };

const lifecycle: PlatformLifecycle = {
  loadingStart: () => safe(() => current.lifecycle.loadingStart()),
  loadingFinished: () => safe(() => current.lifecycle.loadingFinished()),
  firstFrameReady: () => safe(() => current.lifecycle.firstFrameReady()),
  gameReady: () => safe(() => current.lifecycle.gameReady()),
  gameplayStart: () => safe(() => current.lifecycle.gameplayStart()),
  gameplayStop: () => safe(() => current.lifecycle.gameplayStop()),
  onPause: (cb) => pauseSignal.on(cb),
  onResume: (cb) => resumeSignal.on(cb),
  happyMoment: (intensity) => safe(() => current.lifecycle.happyMoment(intensity)),
};

/** Live view of the current adapter: always valid, follows the swap done at boot. */
export const platform: PlatformAdapter = {
  get id() {
    return current.id;
  },
  get marker() {
    return current.marker;
  },
  get capabilities() {
    return current.capabilities;
  },
  init: () => current.init(),
  lifecycle,
  get ads() {
    return current.ads;
  },
  get storage() {
    return current.storage;
  },
  get audio() {
    return current.audio;
  },
  get iap() {
    return current.iap;
  },
  get identity() {
    return current.identity;
  },
  get leaderboard() {
    return current.leaderboard;
  },
  get analytics() {
    return current.analytics;
  },
  get debug() {
    return current.debug;
  },
};

export function currentAdapter(): PlatformAdapter {
  return current;
}

/** Boot only: make `adapter` the one every singleton talks to. */
export function installAdapter(adapter: PlatformAdapter): void {
  current = adapter;
  const hook = adapter.analytics;
  analytics.setAdapterHook(hook ? (event, params) => hook.track(event, { ...params }) : null);
}
