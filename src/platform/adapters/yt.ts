/**
 * YouTube Playables adapter.
 * Docs relied on (fetched 2026-10-06):
 *   https://developers.google.com/youtube/gaming/playables/reference/sdk
 *        ytgame.game.firstFrameReady/gameReady/loadData/saveData, ytgame.system.onPause/onResume/
 *        isAudioEnabled/onAudioEnabledChange, ytgame.ads.requestInterstitialAd/requestRewardedAd(rewardId)
 *        -> Promise<boolean>, ytgame.engagement.sendScore({value}), ytgame.IN_PLAYABLES_ENV
 *   https://developers.google.com/youtube/gaming/playables/reference/getting_started
 *        script tag `<script src="https://www.youtube.com/game_api/v1"></script>`, "MUST be loaded before
 *        any of your game code"
 *   https://developers.google.com/youtube/gaming/playables/certification/requirements_integration
 *        MUST NOT use the Page Visibility API; pause everything on onPause, resume only on onResume;
 *        respect isAudioEnabled/onAudioEnabledChange; await loadData before saveData; save up to 64 KiB
 *        on exit.
 * This adapter never touches the Page Visibility API (capabilities.usesPageVisibility = false; boot then
 * sets game.pauseOnHidden = false and the SDK pause/resume signals drive the game).
 * The SDK script is the ONLY external request, and only in the yt build.
 */
import { loadScript } from '../sdkLoader';
import { safeStorage } from '../storage';
import type { PlatformAdapter, PlatformStorage } from '../types';
import { createBusyFlag, errorMessage, safe } from '../util';

const SDK_URL = 'https://www.youtube.com/game_api/v1';
/** saveData accepts a well-formed UTF-16 string of at most 3 MiB. */
const MAX_BLOB_BYTES = 3 * 1024 * 1024;
/** A bit over AdService's 90 s watchdog. */
const AD_BUSY_MAX_MS = 95_000;

interface YtSdk {
  IN_PLAYABLES_ENV?: boolean;
  game: {
    firstFrameReady(): void;
    gameReady(): void;
    loadData(): Promise<string>;
    saveData(data: string): Promise<void>;
  };
  system: {
    onPause(cb: () => void): () => void;
    onResume(cb: () => void): () => void;
    isAudioEnabled(): boolean;
    onAudioEnabledChange(cb: (isAudioEnabled: boolean) => void): () => void;
  };
  ads: {
    requestInterstitialAd(): Promise<void>;
    requestRewardedAd(rewardId: string): Promise<boolean>;
  };
  engagement: {
    sendScore(score: { value: number }): Promise<void>;
  };
}

function yt(): YtSdk | undefined {
  return (globalThis as { ytgame?: YtSdk }).ytgame;
}

/** All keys live in ONE saveData string: a JSON object of key -> value. */
function createBlobBackend(): { backend: PlatformStorage; flush: () => Promise<void> } {
  let data: Record<string, string> = {};
  /** Writes made while loadData had not succeeded yet; merged over the cloud data once it arrives. */
  const unsaved = new Map<string, string | null>();
  let loadPromise: Promise<boolean> | null = null;
  let loaded = false;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  const load = (): Promise<boolean> => {
    if (loaded) return Promise.resolve(true);
    loadPromise ??= (async () => {
      const y = yt();
      if (!y) return false;
      try {
        const text = await y.game.loadData();
        let parsed: Record<string, string> = {};
        if (text) {
          const j: unknown = JSON.parse(text);
          if (j && typeof j === 'object' && !Array.isArray(j)) parsed = j as Record<string, string>;
        }
        data = parsed;
        for (const [k, v] of unsaved) {
          if (v === null) delete data[k];
          else data[k] = v;
        }
        unsaved.clear();
        loaded = true;
        return true;
      } catch {
        loadPromise = null; // try again on the next access
        return false;
      }
    })();
    return loadPromise;
  };

  const flush = async (): Promise<void> => {
    if (saveTimer !== undefined) {
      clearTimeout(saveTimer);
      saveTimer = undefined;
    }
    // "saveData before loadData completes is rejected": never save before a successful load.
    if (!loaded) return;
    const y = yt();
    if (!y) return;
    const blob = JSON.stringify(data);
    if (blob.length * 2 > MAX_BLOB_BYTES) throw new Error('save data exceeds 3 MiB');
    await y.game.saveData(blob);
  };

  const scheduleSave = (): void => {
    if (saveTimer !== undefined) return;
    saveTimer = setTimeout(() => {
      saveTimer = undefined;
      flush().catch(() => undefined);
    }, 400);
  };

  const raw = {
    async get(key: string): Promise<string | null> {
      await load();
      if (unsaved.has(key)) return unsaved.get(key) ?? null;
      return data[key] ?? null;
    },
    async set(key: string, value: string): Promise<void> {
      if (await load()) {
        data[key] = value;
        scheduleSave();
      } else {
        unsaved.set(key, value);
      }
    },
    async remove(key: string): Promise<void> {
      if (await load()) {
        delete data[key];
        scheduleSave();
      } else {
        unsaved.set(key, null);
      }
    },
  };
  return { backend: safeStorage(raw, { maxBytes: MAX_BLOB_BYTES, label: 'yt.saveData' }), flush };
}

export function createAdapter(): PlatformAdapter {
  let ready = false;
  const inFlight = createBusyFlag(AD_BUSY_MAX_MS);
  let firstFrame = false;
  let gameReady = false;
  const blob = createBlobBackend();

  return {
    id: 'yt',
    marker: 'platform-adapter:yt',
    capabilities: {
      rewardedAds: true,
      interstitialAds: true,
      iap: false,
      adFreePurchase: false,
      leaderboard: true,
      cloudSave: true,
      // Page Visibility is forbidden here; the SDK's onPause/onResume are the only signals.
      usesPageVisibility: false,
      externalLinksAllowed: false,
      managesAdFrequency: false,
    },
    async init() {
      await loadScript(SDK_URL, { isLoaded: () => yt() !== undefined });
      const y = yt();
      if (!y) throw new Error('ytgame global missing after load');
      if (y.IN_PLAYABLES_ENV === false) throw new Error('not running inside YouTube Playables');
      ready = true;
    },
    lifecycle: {
      loadingStart: () => undefined,
      loadingFinished: () => undefined,
      firstFrameReady() {
        if (firstFrame) return;
        firstFrame = true;
        safe(() => yt()?.game.firstFrameReady());
      },
      gameReady() {
        if (gameReady) return;
        gameReady = true;
        safe(() => yt()?.game.gameReady());
      },
      gameplayStart: () => undefined,
      gameplayStop: () => undefined,
      onPause(cb) {
        const off = yt()?.system.onPause(() => {
          // Persist first: a paused Playable can be killed at any time.
          blob.flush().catch(() => undefined);
          cb();
        });
        return typeof off === 'function' ? off : () => undefined;
      },
      onResume(cb) {
        const off = yt()?.system.onResume(cb);
        return typeof off === 'function' ? off : () => undefined;
      },
      happyMoment: () => undefined,
    },
    ads: {
      isAvailable: () => ready && !inFlight.active,
      preload: () => undefined,
      async show(kind, placement) {
        const y = yt();
        if (!ready || !y) return { shown: false, error: 'sdk_not_ready' };
        inFlight.begin();
        try {
          if (kind === 'rewarded') {
            // The promise value is YouTube's own "user met the conditions to receive a reward".
            const earned = await y.ads.requestRewardedAd(placement);
            // Reward ids must not carry personal data: the placement name qualifies.
            return { shown: true, rewarded: earned === true };
          }
          // "Makes no guarantees about whether the ad was shown": counted as shown for spacing purposes.
          await y.ads.requestInterstitialAd();
          return { shown: true };
        } catch (e) {
          return { shown: false, error: errorMessage(e) };
        } finally {
          inFlight.end();
        }
      },
    },
    storage: blob.backend,
    audio: {
      isSystemMuted: () => {
        const y = yt();
        return y ? !y.system.isAudioEnabled() : false;
      },
      onSystemMuteChange(cb) {
        const off = yt()?.system.onAudioEnabledChange((enabled) => cb(!enabled));
        return typeof off === 'function' ? off : () => undefined;
      },
    },
    leaderboard: {
      async submit(_boardId, score) {
        const y = yt();
        const value = Math.floor(score);
        if (!y || !Number.isSafeInteger(value)) return;
        try {
          await y.engagement.sendScore({ value });
        } catch {
          /* score submission is best effort */
        }
      },
    },
  };
}
