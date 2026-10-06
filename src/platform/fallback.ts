/**
 * The safe no-ads adapter. Used (a) before boot, so every service call is harmless, (b) when a
 * platform SDK fails or times out during init, so the game always starts, and (c) as the base of the
 * itch.io adapter (no ads, no IAP, localStorage). Makes no network request.
 * Pure: safe in node and the browser.
 */
import type { AdapterId, PlatformAdapter, PlatformCapabilities, PlatformLifecycle } from './types';
import { createLocalStorageBackend, safeStorage } from './storage';

const noop = (): void => undefined;

export function noopLifecycle(): PlatformLifecycle {
  return {
    loadingStart: noop,
    loadingFinished: noop,
    firstFrameReady: noop,
    gameReady: noop,
    gameplayStart: noop,
    gameplayStop: noop,
    onPause: () => noop,
    onResume: () => noop,
    happyMoment: noop,
  };
}

export const NO_ADS_CAPABILITIES: PlatformCapabilities = {
  rewardedAds: false,
  interstitialAds: false,
  iap: false,
  adFreePurchase: false,
  leaderboard: false,
  cloudSave: false,
  usesPageVisibility: true,
  externalLinksAllowed: true,
  managesAdFrequency: false,
};

export function createFallbackAdapter(id: AdapterId = 'fallback', marker = 'platform-adapter:fallback'): PlatformAdapter {
  return {
    id,
    marker,
    capabilities: { ...NO_ADS_CAPABILITIES },
    init: async () => undefined,
    lifecycle: noopLifecycle(),
    ads: {
      isAvailable: () => false,
      preload: noop,
      show: async () => ({ shown: false, error: 'unsupported' }),
    },
    storage: safeStorage(createLocalStorageBackend(), { maxBytes: 2_000_000, label: 'localStorage' }),
  };
}
