/**
 * GameDistribution HTML5 SDK adapter.
 * Docs relied on (fetched 2026-10-06):
 *   https://github.com/GameDistribution/GD-HTML5/wiki/SDK-Implementation   loader snippet, GD_OPTIONS
 *        { gameId, onEvent }, event names SDK_GAME_START / SDK_GAME_PAUSE / SDK_REWARDED_WATCH_COMPLETE,
 *        `gdsdk.showAd()` behind a mouseup/touchup, "check that gdsdk and showAd exist (ad blockers)"
 *   https://github.com/GameDistribution/GD-HTML5 (README)                  SDK_READY / SDK_ERROR event names
 *   https://github-wiki-see.page/m/GameDistribution/GD-HTML5/wiki/Rewarded-Ads   (mirror of the "Rewarded
 *        Ads" wiki page, which github.com itself failed to render): `gdsdk.preloadAd('rewarded')`,
 *        `gdsdk.showAd('rewarded')` both return promises, reward only after SDK_REWARDED_WATCH_COMPLETE,
 *        "rewarded ads" flag must be enabled for the game in the GD developer console.
 * The GD game id comes from the VITE_GD_GAME_ID build variable. The SDK script is the ONLY external
 * request, and only in the gd build.
 */
import { loadScript } from '../sdkLoader';
import { createLocalStorageBackend, safeStorage } from '../storage';
import type { AdKind, AdResult, PlatformAdapter } from '../types';
import { errorMessage, safe, Signal } from '../util';

const SDK_URL = 'https://html5.api.gamedistribution.com/main.min.js';

interface GdSdk {
  showAd(type?: string): Promise<unknown>;
  preloadAd?(type: string): Promise<unknown>;
}

interface GdEvent {
  name?: string;
}

function sdk(): GdSdk | undefined {
  const g = (globalThis as { gdsdk?: GdSdk }).gdsdk;
  // The docs say to check the method exists: an ad blocker can leave a stub or nothing at all.
  return g && typeof g.showAd === 'function' ? g : undefined;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export function createAdapter(): PlatformAdapter {
  const pauseSignal = new Signal();
  const resumeSignal = new Signal();
  let sdkError = false;
  let rewardWatched = false;
  let rewardedFailedAt = 0;

  const onEvent = (event: GdEvent): void => {
    switch (event?.name) {
      case 'SDK_ERROR':
        sdkError = true;
        break;
      case 'SDK_GAME_PAUSE':
        pauseSignal.emit();
        break;
      case 'SDK_GAME_START':
        resumeSignal.emit();
        break;
      case 'SDK_REWARDED_WATCH_COMPLETE':
        rewardWatched = true;
        break;
      default:
        break;
    }
  };

  const show = async (kind: AdKind): Promise<AdResult> => {
    const g = sdk();
    if (!g || sdkError) return { shown: false, error: 'sdk_not_ready' };
    if (kind === 'rewarded') {
      rewardWatched = false;
      try {
        await g.showAd('rewarded');
      } catch (e) {
        // Docs: the rejection means no ad / error: "don't give reward here".
        rewardedFailedAt = Date.now();
        return { shown: false, error: errorMessage(e) };
      }
      // SDK_REWARDED_WATCH_COMPLETE normally lands before the promise settles; allow a short grace.
      for (let i = 0; i < 6 && !rewardWatched; i++) await sleep(100);
      return { shown: true, rewarded: rewardWatched };
    }
    try {
      await g.showAd();
      return { shown: true };
    } catch (e) {
      return { shown: false, error: errorMessage(e) };
    }
  };

  return {
    id: 'gd',
    marker: 'platform-adapter:gd',
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
      const gameId = import.meta.env.VITE_GD_GAME_ID as string | undefined;
      if (!gameId) throw new Error('VITE_GD_GAME_ID is not set');
      // GD reads GD_OPTIONS when the script loads, so it must exist first.
      (globalThis as { GD_OPTIONS?: unknown }).GD_OPTIONS = { gameId, onEvent };
      await loadScript(SDK_URL, { isLoaded: () => sdk() !== undefined, id: 'gamedistribution-jssdk', timeoutMs: 4000 });
    },
    lifecycle: {
      loadingStart: () => undefined,
      loadingFinished: () => undefined,
      firstFrameReady: () => undefined,
      gameReady: () => undefined,
      gameplayStart: () => undefined,
      gameplayStop: () => undefined,
      // SDK_GAME_PAUSE / SDK_GAME_START: the SDK's own ads (preroll) ask the game to pause and resume.
      onPause: (cb) => pauseSignal.on(cb),
      onResume: (cb) => resumeSignal.on(cb),
      happyMoment: () => undefined,
    },
    ads: {
      isAvailable(kind) {
        if (!sdk() || sdkError) return false;
        // After a failed rewarded request, wait 30 s before offering again.
        if (kind === 'rewarded' && rewardedFailedAt && Date.now() - rewardedFailedAt < 30_000) return false;
        return true;
      },
      preload(kind) {
        if (kind !== 'rewarded') return;
        const g = sdk();
        if (!g?.preloadAd) return;
        safe(() => {
          g.preloadAd?.('rewarded').then(
            () => {
              rewardedFailedAt = 0;
            },
            () => {
              rewardedFailedAt = Date.now();
            },
          );
        });
      },
      show,
    },
    storage: safeStorage(createLocalStorageBackend(), { maxBytes: 2_000_000, label: 'gd.localStorage' }),
  };
}
