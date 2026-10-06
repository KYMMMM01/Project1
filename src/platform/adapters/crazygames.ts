/**
 * CrazyGames SDK v3 adapter.
 * Docs relied on (fetched 2026-10-06):
 *   https://docs.crazygames.com/sdk/intro/        script tag, `await window.CrazyGames.SDK.init()`, `.environment`
 *   https://docs.crazygames.com/sdk/video-ads     `ad.requestAd("midgame" | "rewarded", {adStarted, adFinished, adError})`,
 *                                                  error codes (adCooldown: the SDK itself enforces ~3 min between
 *                                                  midgame ads, so capabilities.managesAdFrequency = true),
 *                                                  `ad.hasAdblock()`, "give reward in adFinished only"
 *   https://docs.crazygames.com/sdk/game/         `game.loadingStart/loadingStop/gameplayStart/gameplayStop/happytime`,
 *                                                  `game.settings.muteAudio` + `add/removeSettingsChangeListener`
 *                                                  ("takes priority over your in-game audio settings")
 *   https://docs.crazygames.com/sdk/data/         `data.getItem/setItem/removeItem/clear` (localStorage API, 1 MB limit)
 * The SDK script is the ONLY external request, and only in the crazygames build.
 */
import { loadScript } from '../sdkLoader';
import { createLocalStorageBackend, safeStorage } from '../storage';
import type { AdKind, AdResult, PlatformAdapter, PlatformStorage } from '../types';
import { createBusyFlag, errorMessage, safe } from '../util';

const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
/** A bit over AdService's 90 s watchdog. */
const AD_BUSY_MAX_MS = 95_000;

interface AdCallbacks {
  adStarted?: () => void;
  adFinished?: () => void;
  adError?: (error: { code?: string; message?: string } | string) => void;
}

interface CrazySdk {
  environment?: 'local' | 'crazygames' | 'disabled';
  init(): Promise<void>;
  game: {
    loadingStart(): void;
    loadingStop(): void;
    gameplayStart(): void;
    gameplayStop(): void;
    happytime(): void;
    settings?: { muteAudio?: boolean };
    addSettingsChangeListener?(listener: () => void): void;
    removeSettingsChangeListener?(listener: () => void): void;
  };
  ad: {
    requestAd(type: 'midgame' | 'rewarded', callbacks: AdCallbacks): void;
    hasAdblock(): Promise<boolean>;
  };
  data: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
    clear(): void;
  };
}

function sdk(): CrazySdk | undefined {
  return (globalThis as { CrazyGames?: { SDK?: CrazySdk } }).CrazyGames?.SDK;
}

export function createAdapter(): PlatformAdapter {
  let ready = false;
  let adblock = false;
  const inFlight = createBusyFlag(AD_BUSY_MAX_MS);

  // Before the SDK is up (or if it is disabled on this domain) fall back to plain localStorage.
  const local = createLocalStorageBackend();
  const storageBackend = {
    get: async (key: string): Promise<string | null> => {
      const s = sdk();
      if (ready && s) return s.data.getItem(key);
      return local.get(key);
    },
    set: async (key: string, value: string): Promise<void> => {
      const s = sdk();
      if (ready && s) s.data.setItem(key, value);
      else await local.set(key, value);
    },
    remove: async (key: string): Promise<void> => {
      const s = sdk();
      if (ready && s) s.data.removeItem(key);
      else await local.remove(key);
    },
  };
  const storage: PlatformStorage = safeStorage(storageBackend, { maxBytes: 1_048_576, label: 'crazygames.data' });

  const requestAd = (kind: AdKind): Promise<AdResult> =>
    new Promise<AdResult>((resolve) => {
      let started = false;
      let settled = false;
      const settle = (r: AdResult): void => {
        if (settled) return;
        settled = true;
        inFlight.end();
        resolve(r);
      };
      const s = sdk();
      if (!ready || !s) {
        settle({ shown: false, error: 'sdk_not_ready' });
        return;
      }
      inFlight.begin();
      try {
        s.ad.requestAd(kind === 'rewarded' ? 'rewarded' : 'midgame', {
          adStarted: () => {
            started = true;
          },
          // Rewards are granted from adFinished only (docs: "for rewarded ads give reward here").
          adFinished: () => settle({ shown: true, rewarded: kind === 'rewarded' }),
          adError: (err) => {
            const code = typeof err === 'string' ? err : (err.code ?? err.message ?? 'ad_error');
            settle({ shown: started, rewarded: false, error: code });
          },
        });
      } catch (e) {
        settle({ shown: false, error: errorMessage(e) });
      }
    });

  return {
    id: 'crazygames',
    marker: 'platform-adapter:crazygames',
    capabilities: {
      rewardedAds: true,
      interstitialAds: true,
      iap: false,
      adFreePurchase: false,
      leaderboard: false,
      cloudSave: true,
      usesPageVisibility: true,
      externalLinksAllowed: false,
      managesAdFrequency: true,
    },
    async init() {
      await loadScript(SDK_URL, { isLoaded: () => sdk() !== undefined });
      const s = sdk();
      if (!s) throw new Error('CrazyGames SDK global missing after load');
      await s.init();
      if (s.environment === 'disabled') {
        // "On other domains all SDK calls throw": treat as no SDK so the safe adapter takes over.
        throw new Error('CrazyGames SDK is disabled on this domain');
      }
      ready = true;
      try {
        adblock = await s.ad.hasAdblock();
      } catch {
        adblock = false;
      }
    },
    lifecycle: {
      loadingStart: () => safe(() => sdk()?.game.loadingStart()),
      loadingFinished: () => safe(() => sdk()?.game.loadingStop()),
      firstFrameReady: () => undefined,
      gameReady: () => undefined,
      gameplayStart: () => safe(() => sdk()?.game.gameplayStart()),
      gameplayStop: () => safe(() => sdk()?.game.gameplayStop()),
      // CrazyGames has no pause signal; the page visibility drives the game's own pause.
      onPause: () => () => undefined,
      onResume: () => () => undefined,
      happyMoment: () => safe(() => sdk()?.game.happytime()),
    },
    ads: {
      isAvailable: () => ready && !adblock && !inFlight.active,
      preload: () => undefined,
      show: (kind) => requestAd(kind),
    },
    storage,
    audio: {
      // The portal's mute switch outranks the game's own audio settings.
      isSystemMuted: () => sdk()?.game.settings?.muteAudio === true,
      onSystemMuteChange(cb) {
        const game = sdk()?.game;
        if (!game?.addSettingsChangeListener) return () => undefined;
        // Read the live setting instead of trusting the listener's argument shape.
        const listener = (): void => cb(game.settings?.muteAudio === true);
        game.addSettingsChangeListener(listener);
        return () => safe(() => game.removeSettingsChangeListener?.(listener));
      },
    },
  };
}
