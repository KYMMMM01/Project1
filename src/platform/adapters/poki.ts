/**
 * Poki SDK adapter.
 * Docs relied on (fetched 2026-10-06): https://developers.poki.com/guide/sdk-html5
 *   script https://game-cdn.poki.com/scripts/v2/poki-sdk.js, `PokiSDK.init().then/.catch`,
 *   `gameLoadingFinished()`, `gameplayStart()/gameplayStop()`,
 *   `commercialBreak(onStart).then(...)`, `rewardedBreak(onStart).then(success => ...)`.
 * `happyTime(intensity 0..1)` is not on that page (seen in Poki's engine wrappers): called only if present.
 * The SDK script is the ONLY external request, and only in the poki build. Poki blocks every other
 * external request by default and wants localStorage inside try/catch (safeStorage does that).
 */
import { loadScript } from '../sdkLoader';
import { createLocalStorageBackend, safeStorage } from '../storage';
import type { AdKind, AdResult, PlatformAdapter } from '../types';
import { errorMessage, safe } from '../util';

const SDK_URL = 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js';

interface PokiSdk {
  init(): Promise<void>;
  gameLoadingFinished(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  commercialBreak(onStart?: () => void): Promise<void>;
  rewardedBreak(onStart?: () => void): Promise<boolean>;
  happyTime?(intensity: number): void;
}

function sdk(): PokiSdk | undefined {
  return (globalThis as { PokiSDK?: PokiSdk }).PokiSDK;
}

export function createAdapter(): PlatformAdapter {
  let ready = false;
  /** init() rejected ("Initialized, something went wrong, load your game anyway"): usually an ad blocker. */
  let adsBroken = false;
  let inFlight = false;

  const show = async (kind: AdKind): Promise<AdResult> => {
    const s = sdk();
    if (!ready || !s || adsBroken) return { shown: false, error: 'sdk_not_ready' };
    inFlight = true;
    let started = false;
    const onStart = (): void => {
      started = true;
    };
    try {
      if (kind === 'rewarded') {
        // `true` means the player watched the ad to the end: the only reward signal Poki gives.
        const success = await s.rewardedBreak(onStart);
        return { shown: started || success === true, rewarded: success === true };
      }
      // Not every commercialBreak() triggers an ad; onStart tells us whether one actually played.
      await s.commercialBreak(onStart);
      return { shown: started };
    } catch (e) {
      return { shown: started, rewarded: false, error: errorMessage(e) };
    } finally {
      inFlight = false;
    }
  };

  return {
    id: 'poki',
    marker: 'platform-adapter:poki',
    capabilities: {
      rewardedAds: true,
      interstitialAds: true,
      iap: false,
      adFreePurchase: false,
      leaderboard: false,
      cloudSave: false,
      usesPageVisibility: true,
      externalLinksAllowed: false,
    },
    async init() {
      await loadScript(SDK_URL, { isLoaded: () => sdk() !== undefined });
      const s = sdk();
      if (!s) throw new Error('PokiSDK global missing after load');
      try {
        await s.init();
      } catch {
        adsBroken = true;
      }
      ready = true;
    },
    lifecycle: {
      loadingStart: () => undefined,
      loadingFinished: () => safe(() => sdk()?.gameLoadingFinished()),
      firstFrameReady: () => undefined,
      gameReady: () => undefined,
      gameplayStart: () => safe(() => sdk()?.gameplayStart()),
      gameplayStop: () => safe(() => sdk()?.gameplayStop()),
      onPause: () => () => undefined,
      onResume: () => () => undefined,
      happyMoment: (intensity = 0.5) => safe(() => sdk()?.happyTime?.(Math.min(1, Math.max(0, intensity)))),
    },
    ads: {
      isAvailable: () => ready && !adsBroken && !inFlight,
      preload: () => undefined,
      show,
    },
    storage: safeStorage(createLocalStorageBackend(), { maxBytes: 2_000_000, label: 'poki.localStorage' }),
  };
}
