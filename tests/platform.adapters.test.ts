import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TossBridge, TossShowAdEvent, CapacitorPlugins } from '@/platform/bridges';
import { registerCapacitorPlugins, registerTossBridge } from '@/platform/bridges';
import { createAdapter as createCrazy } from '@/platform/adapters/crazygames';
import { createAdapter as createPoki } from '@/platform/adapters/poki';
import { createAdapter as createGd } from '@/platform/adapters/gd';
import { createAdapter as createYt } from '@/platform/adapters/yt';
import { createAdapter as createToss } from '@/platform/adapters/toss';
import { createAdapter as createCap } from '@/platform/adapters/capacitor';
import { createAdapter as createItch } from '@/platform/adapters/itch';

type G = Record<string, unknown>;
const g = globalThis as unknown as G;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  registerTossBridge(null);
  registerCapacitorPlugins(null);
  for (const k of ['CrazyGames', 'PokiSDK', 'gdsdk', 'GD_OPTIONS', 'ytgame', 'Capacitor']) delete g[k];
});

describe('itch', () => {
  it('has no ads and no IAP, and does not touch the network', async () => {
    const a = createItch();
    await a.init();
    expect(a.id).toBe('itch');
    expect(a.capabilities).toMatchObject({ rewardedAds: false, interstitialAds: false, iap: false });
    expect(a.ads.isAvailable('rewarded', 'revive')).toBe(false);
    expect(await a.ads.show('rewarded', 'revive')).toMatchObject({ shown: false });
    expect(a.iap).toBeUndefined();
  });
});

describe('CrazyGames', () => {
  function sdk(script: (type: string, cb: Record<string, (e?: unknown) => void>) => void) {
    const store = new Map<string, string>();
    const s = {
      environment: 'crazygames',
      init: vi.fn(async () => undefined),
      game: {
        loadingStart: vi.fn(),
        loadingStop: vi.fn(),
        gameplayStart: vi.fn(),
        gameplayStop: vi.fn(),
        happytime: vi.fn(),
      },
      ad: { requestAd: vi.fn(script), hasAdblock: vi.fn(async () => false) },
      data: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
        clear: () => store.clear(),
      },
    };
    g.CrazyGames = { SDK: s };
    return s;
  }

  it('grants the reward only from adFinished', async () => {
    const s = sdk((type, cb) => {
      cb.adStarted?.();
      cb.adFinished?.();
      expect(type).toBe('rewarded');
    });
    const a = createCrazy();
    await a.init();
    expect(a.ads.isAvailable('rewarded', 'revive')).toBe(true);
    expect(await a.ads.show('rewarded', 'revive')).toEqual({ shown: true, rewarded: true });
    expect(s.ad.requestAd).toHaveBeenCalledWith('rewarded', expect.any(Object));
  });

  it('adError means no reward, even after the ad started', async () => {
    sdk((_t, cb) => {
      cb.adStarted?.();
      cb.adError?.({ code: 'other', message: 'x' });
      cb.adFinished?.(); // late and ignored
    });
    const a = createCrazy();
    await a.init();
    expect(await a.ads.show('rewarded', 'revive')).toEqual({ shown: true, rewarded: false, error: 'other' });
  });

  it('interstitials map to midgame and never carry a reward', async () => {
    const s = sdk((_t, cb) => cb.adFinished?.());
    const a = createCrazy();
    await a.init();
    expect(await a.ads.show('interstitial', 'run_end')).toEqual({ shown: true, rewarded: false });
    expect(s.ad.requestAd).toHaveBeenCalledWith('midgame', expect.any(Object));
  });

  it('survives a throwing SDK and an unfilled ad, maps lifecycle and storage', async () => {
    const s = sdk(() => {
      throw new Error('disabled');
    });
    const a = createCrazy();
    await a.init();
    expect(await a.ads.show('rewarded', 'revive')).toMatchObject({ shown: false });
    expect(a.ads.isAvailable('rewarded', 'revive')).toBe(true); // inFlight was reset
    a.lifecycle.loadingStart();
    a.lifecycle.loadingFinished();
    a.lifecycle.gameplayStart();
    a.lifecycle.gameplayStop();
    a.lifecycle.happyMoment();
    expect(s.game.loadingStart).toHaveBeenCalled();
    expect(s.game.loadingStop).toHaveBeenCalled();
    expect(s.game.gameplayStart).toHaveBeenCalled();
    expect(s.game.gameplayStop).toHaveBeenCalled();
    expect(s.game.happytime).toHaveBeenCalled();
    await a.storage.set('k', 'v');
    expect(await a.storage.get('k')).toBe('v');
    expect(a.storage.maxBytes).toBe(1_048_576);
  });

  it("refuses a 'disabled' environment so the safe fallback takes over", async () => {
    const s = sdk(() => undefined);
    s.environment = 'disabled';
    await expect(createCrazy().init()).rejects.toThrow(/disabled/);
  });

  it('reports ads unavailable behind an ad blocker', async () => {
    const s = sdk(() => undefined);
    s.ad.hasAdblock = vi.fn(async () => true);
    const a = createCrazy();
    await a.init();
    expect(a.ads.isAvailable('rewarded', 'revive')).toBe(false);
  });

  it('an ad request the SDK never answers stops reading as busy shortly after the 90 s watchdog', async () => {
    sdk(() => undefined); // requestAd never calls back
    const a = createCrazy();
    await a.init();
    void a.ads.show('rewarded', 'revive');
    expect(a.ads.isAvailable('rewarded', 'revive')).toBe(false);
    await vi.advanceTimersByTimeAsync(90_000);
    expect(a.ads.isAvailable('rewarded', 'revive')).toBe(false);
    await vi.advanceTimersByTimeAsync(5_001);
    expect(a.ads.isAvailable('rewarded', 'revive')).toBe(true);
  });

  it("follows the portal's mute switch, which outranks the game's own audio setting", async () => {
    const s = sdk(() => undefined);
    const settings = { muteAudio: false };
    let listener: (() => void) | undefined;
    const remove = vi.fn();
    Object.assign(s.game, {
      settings,
      addSettingsChangeListener: (l: () => void) => (listener = l),
      removeSettingsChangeListener: remove,
    });
    const a = createCrazy();
    await a.init();
    expect(a.audio?.isSystemMuted()).toBe(false);
    const seen: boolean[] = [];
    const off = a.audio!.onSystemMuteChange((m) => seen.push(m));
    settings.muteAudio = true;
    listener?.();
    expect(a.audio?.isSystemMuted()).toBe(true);
    expect(seen).toEqual([true]);
    off();
    expect(remove).toHaveBeenCalledWith(listener);
  });

  it('copes with an SDK that has no settings object', async () => {
    sdk(() => undefined);
    const a = createCrazy();
    await a.init();
    expect(a.audio?.isSystemMuted()).toBe(false);
    expect(() => a.audio?.onSystemMuteChange(() => undefined)()).not.toThrow();
  });
});

describe('who throttles interstitials', () => {
  it('CrazyGames (adCooldown) and Poki (its system decides) do, so AdService adds no timer there', () => {
    expect(createCrazy().capabilities.managesAdFrequency).toBe(true);
    expect(createPoki().capabilities.managesAdFrequency).toBe(true);
  });

  it('every other adapter leaves the pacing to AdService', () => {
    for (const make of [createGd, createYt, createToss, createCap, createItch]) {
      expect(make().capabilities.managesAdFrequency).toBe(false);
    }
  });

  it('only portals sell interstitials: Toss, store and itch builds never do', () => {
    expect(createToss().capabilities.interstitialAds).toBe(false);
    expect(createCap().capabilities.interstitialAds).toBe(false);
    expect(createItch().capabilities.interstitialAds).toBe(false);
    for (const make of [createCrazy, createPoki, createGd, createYt]) expect(make().capabilities.interstitialAds).toBe(true);
  });
});

describe('Poki', () => {
  function sdk(rewardedResult: boolean | 'throw', startsAd = true) {
    const s = {
      init: vi.fn(async () => undefined),
      gameLoadingFinished: vi.fn(),
      gameplayStart: vi.fn(),
      gameplayStop: vi.fn(),
      commercialBreak: vi.fn(async (onStart?: () => void) => {
        if (startsAd) onStart?.();
      }),
      rewardedBreak: vi.fn(async (onStart?: () => void) => {
        if (rewardedResult === 'throw') throw new Error('x');
        onStart?.();
        return rewardedResult;
      }),
      happyTime: vi.fn(),
    };
    g.PokiSDK = s;
    return s;
  }

  it('rewards only when rewardedBreak resolves true', async () => {
    sdk(true);
    const a = createPoki();
    await a.init();
    expect(await a.ads.show('rewarded', 'revive')).toEqual({ shown: true, rewarded: true });
    sdk(false);
    const b = createPoki();
    await b.init();
    expect(await b.ads.show('rewarded', 'revive')).toEqual({ shown: true, rewarded: false });
    sdk('throw');
    const c = createPoki();
    await c.init();
    expect(await c.ads.show('rewarded', 'revive')).toMatchObject({ shown: false, rewarded: false });
  });

  it('commercialBreak without an ad (not every call shows one) is not "shown"', async () => {
    sdk(true, false);
    const a = createPoki();
    await a.init();
    expect(await a.ads.show('interstitial', 'run_end')).toEqual({ shown: false });
  });

  it('maps lifecycle and treats a failed init as "load anyway, no ads"', async () => {
    const s = sdk(true);
    s.init = vi.fn(async () => {
      throw new Error('adblock');
    });
    const a = createPoki();
    await a.init();
    expect(a.ads.isAvailable('rewarded', 'x')).toBe(false);
    expect(await a.ads.show('rewarded', 'x')).toMatchObject({ shown: false });
    a.lifecycle.loadingFinished();
    a.lifecycle.gameplayStart();
    a.lifecycle.gameplayStop();
    a.lifecycle.happyMoment(2);
    expect(s.gameLoadingFinished).toHaveBeenCalled();
    expect(s.gameplayStart).toHaveBeenCalled();
    expect(s.gameplayStop).toHaveBeenCalled();
    expect(s.happyTime).toHaveBeenCalledWith(1); // clamped to 0..1
  });
});

describe('GameDistribution', () => {
  function sdk(showAd: (type?: string) => Promise<unknown>) {
    const s = { showAd: vi.fn(showAd), preloadAd: vi.fn(async () => undefined) };
    g.gdsdk = s;
    return s;
  }
  const emit = (name: string): void => {
    (g.GD_OPTIONS as { onEvent(e: { name: string }): void }).onEvent({ name });
  };

  it('needs a game id and sets GD_OPTIONS before the script exists', async () => {
    sdk(async () => undefined);
    await expect(createGd().init()).rejects.toThrow(/VITE_GD_GAME_ID/);
    vi.stubEnv('VITE_GD_GAME_ID', 'abc123');
    await createGd().init();
    expect((g.GD_OPTIONS as { gameId: string }).gameId).toBe('abc123');
  });

  it('rewards only after SDK_REWARDED_WATCH_COMPLETE, not when showAd merely resolves', async () => {
    vi.stubEnv('VITE_GD_GAME_ID', 'abc123');
    sdk(async () => undefined);
    const a = createGd();
    await a.init();
    const p = a.ads.show('rewarded', 'revive');
    await vi.advanceTimersByTimeAsync(1000);
    expect(await p).toEqual({ shown: true, rewarded: false });

    const s2 = sdk(async () => {
      emit('SDK_REWARDED_WATCH_COMPLETE');
    });
    const q = a.ads.show('rewarded', 'revive');
    await vi.advanceTimersByTimeAsync(10);
    expect(await q).toEqual({ shown: true, rewarded: true });
    expect(s2.showAd).toHaveBeenCalledWith('rewarded');
  });

  it('accepts a completion event that lands just after the promise resolved', async () => {
    vi.stubEnv('VITE_GD_GAME_ID', 'abc123');
    sdk(async () => {
      setTimeout(() => emit('SDK_REWARDED_WATCH_COMPLETE'), 150);
    });
    const a = createGd();
    await a.init();
    const p = a.ads.show('rewarded', 'revive');
    await vi.advanceTimersByTimeAsync(400);
    expect(await p).toEqual({ shown: true, rewarded: true });
  });

  it('a rejected showAd means no ad and no reward; interstitial uses plain showAd()', async () => {
    vi.stubEnv('VITE_GD_GAME_ID', 'abc123');
    const s = sdk(async (type) => {
      if (type === 'rewarded') throw new Error('no fill');
    });
    const a = createGd();
    await a.init();
    expect(await a.ads.show('rewarded', 'revive')).toMatchObject({ shown: false });
    expect(a.ads.isAvailable('rewarded', 'revive')).toBe(false); // cooling down after a failure
    expect(await a.ads.show('interstitial', 'run_end')).toEqual({ shown: true });
    expect(s.showAd).toHaveBeenLastCalledWith();
  });

  it('maps SDK_GAME_PAUSE / SDK_GAME_START to the lifecycle pause/resume signals', async () => {
    vi.stubEnv('VITE_GD_GAME_ID', 'abc123');
    sdk(async () => undefined);
    const a = createGd();
    await a.init();
    const seen: string[] = [];
    a.lifecycle.onPause(() => seen.push('pause'));
    a.lifecycle.onResume(() => seen.push('resume'));
    emit('SDK_GAME_PAUSE');
    emit('SDK_GAME_START');
    expect(seen).toEqual(['pause', 'resume']);
  });

  it('is unavailable when the SDK is blocked (no global)', async () => {
    vi.stubEnv('VITE_GD_GAME_ID', 'abc123');
    delete g.gdsdk;
    const a = createGd();
    expect(a.ads.isAvailable('rewarded', 'x')).toBe(false);
    expect(await a.ads.show('rewarded', 'x')).toMatchObject({ shown: false });
  });
});

describe('YouTube Playables', () => {
  function sdk(opts: { rewarded?: boolean; audio?: boolean } = {}) {
    const handlers = { pause: [] as Array<() => void>, resume: [] as Array<() => void>, audio: [] as Array<(e: boolean) => void> };
    let cloud = '';
    let loadedOnce = false;
    const saves: string[] = [];
    const s = {
      IN_PLAYABLES_ENV: true,
      game: {
        firstFrameReady: vi.fn(),
        gameReady: vi.fn(),
        loadData: vi.fn(async () => {
          loadedOnce = true;
          return cloud;
        }),
        saveData: vi.fn(async (d: string) => {
          if (!loadedOnce) throw new Error('saveData before loadData is rejected');
          cloud = d;
          saves.push(d);
        }),
      },
      system: {
        onPause: (cb: () => void) => {
          handlers.pause.push(cb);
          return () => undefined;
        },
        onResume: (cb: () => void) => {
          handlers.resume.push(cb);
          return () => undefined;
        },
        isAudioEnabled: () => opts.audio ?? true,
        onAudioEnabledChange: (cb: (e: boolean) => void) => {
          handlers.audio.push(cb);
          return () => undefined;
        },
      },
      ads: {
        requestInterstitialAd: vi.fn(async () => undefined),
        requestRewardedAd: vi.fn(async (_id: string) => opts.rewarded ?? true),
      },
      engagement: { sendScore: vi.fn(async () => undefined) },
    };
    g.ytgame = s;
    return { s, handlers, saves, getCloud: () => cloud };
  }

  it('does not use the Page Visibility API: usesPageVisibility is false and the adapter needs no document', async () => {
    sdk();
    const a = createYt();
    await a.init();
    expect(a.capabilities.usesPageVisibility).toBe(false);
    expect(typeof document).toBe('undefined'); // runs fine with no document/visibility state at all
  });

  it('rewards only when requestRewardedAd resolves true, with the placement as the reward id', async () => {
    const t = sdk({ rewarded: true });
    const a = createYt();
    await a.init();
    expect(await a.ads.show('rewarded', 'revive')).toEqual({ shown: true, rewarded: true });
    expect(t.s.ads.requestRewardedAd).toHaveBeenCalledWith('revive');
    const u = sdk({ rewarded: false });
    const b = createYt();
    await b.init();
    expect(await b.ads.show('rewarded', 'revive')).toEqual({ shown: true, rewarded: false });
    expect(u.s.ads.requestRewardedAd).toHaveBeenCalledTimes(1);
  });

  it('interstitial resolves shown; a rejected request is "not shown"', async () => {
    const t = sdk();
    const a = createYt();
    await a.init();
    expect(await a.ads.show('interstitial', 'run_end')).toEqual({ shown: true });
    t.s.ads.requestInterstitialAd.mockRejectedValueOnce(new Error('region'));
    expect(await a.ads.show('interstitial', 'run_end')).toMatchObject({ shown: false });
  });

  it('forwards onPause/onResume from the SDK and flushes the save when paused', async () => {
    const t = sdk();
    const a = createYt();
    await a.init();
    const seen: string[] = [];
    a.lifecycle.onPause(() => seen.push('pause'));
    a.lifecycle.onResume(() => seen.push('resume'));
    await a.storage.set('save', '{"gold":5}');
    t.handlers.pause.forEach((f) => f());
    await vi.advanceTimersByTimeAsync(0);
    t.handlers.resume.forEach((f) => f());
    expect(seen).toEqual(['pause', 'resume']);
    expect(t.saves.length).toBeGreaterThan(0);
    expect(JSON.parse(t.getCloud())).toEqual({ save: '{"gold":5}' });
  });

  it('respects the YouTube audio setting', async () => {
    const t = sdk({ audio: false });
    const a = createYt();
    await a.init();
    expect(a.audio?.isSystemMuted()).toBe(true);
    const seen: boolean[] = [];
    a.audio?.onSystemMuteChange((m) => seen.push(m));
    t.handlers.audio.forEach((f) => f(true)); // audio enabled again -> not muted
    expect(seen).toEqual([false]);
  });

  it('awaits loadData before saveData, keeps all keys in one blob and debounces saves', async () => {
    const t = sdk();
    const a = createYt();
    await a.init();
    await a.storage.set('a', '1');
    await a.storage.set('b', '2');
    await a.storage.remove('a');
    expect(t.s.game.loadData).toHaveBeenCalledTimes(1);
    expect(t.s.game.saveData).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(t.s.game.saveData).toHaveBeenCalledTimes(1); // three writes, one save
    expect(JSON.parse(t.getCloud())).toEqual({ b: '2' });
    expect(await a.storage.get('b')).toBe('2');
    expect(a.storage.maxBytes).toBe(3 * 1024 * 1024);
  });

  it('merges writes made while loadData was failing over the cloud save once it loads', async () => {
    const t = sdk();
    const real = t.s.game.loadData.getMockImplementation();
    t.s.game.loadData.mockRejectedValueOnce(new Error('offline'));
    const a = createYt();
    await a.init();
    await a.storage.set('local', 'x');
    expect(t.s.game.saveData).not.toHaveBeenCalled(); // never save before a successful load
    t.s.game.loadData.mockImplementation(real ?? (async () => '{"cloud":"y"}'));
    await a.storage.set('more', 'z');
    await vi.advanceTimersByTimeAsync(500);
    const blob = JSON.parse(t.getCloud()) as Record<string, string>;
    expect(blob.local).toBe('x');
    expect(blob.more).toBe('z');
  });

  it('calls firstFrameReady and gameReady once each, and submits integer scores', async () => {
    const t = sdk();
    const a = createYt();
    await a.init();
    a.lifecycle.firstFrameReady();
    a.lifecycle.firstFrameReady();
    a.lifecycle.gameReady();
    a.lifecycle.gameReady();
    expect(t.s.game.firstFrameReady).toHaveBeenCalledTimes(1);
    expect(t.s.game.gameReady).toHaveBeenCalledTimes(1);
    await a.leaderboard?.submit('main', 120.9);
    expect(t.s.engagement.sendScore).toHaveBeenCalledWith({ value: 120 });
  });

  it('refuses to run outside Playables so the fallback adapter takes over', async () => {
    const t = sdk();
    t.s.IN_PLAYABLES_ENV = false;
    await expect(createYt().init()).rejects.toThrow(/Playables/);
  });
});

describe('Apps in Toss (bridge)', () => {
  function bridge() {
    const calls: string[] = [];
    let showEvents: (cb: (e: TossShowAdEvent) => void) => void = () => undefined;
    const completed: string[] = [];
    const store = new Map<string, string>();
    const b: TossBridge = {
      GoogleAdMob: {
        loadAppsInTossAdMob: Object.assign(
          (p: Parameters<NonNullable<TossBridge['GoogleAdMob']>['loadAppsInTossAdMob']>[0]) => {
            calls.push('load:' + p.options.adGroupId);
            queueMicrotask(() => p.onEvent({ type: 'loaded' }));
            return () => calls.push('load-cleanup');
          },
          { isSupported: () => true },
        ),
        showAppsInTossAdMob: Object.assign(
          (p: Parameters<NonNullable<TossBridge['GoogleAdMob']>['showAppsInTossAdMob']>[0]) => {
            calls.push('show:' + p.options.adGroupId);
            queueMicrotask(() => showEvents(p.onEvent));
            return () => calls.push('show-cleanup');
          },
          { isSupported: () => true },
        ),
      },
      IAP: {
        createOneTimePurchaseOrder: (p) => {
          calls.push('buy:' + p.options.sku);
          return () => calls.push('buy-cleanup');
        },
        getPendingOrders: async () => ({ orders: [{ orderId: 'o1', sku: 'gems_80', paymentCompletedDate: 'x' }] }),
        getCompletedOrRefundedOrders: async () => ({
          hasNext: false,
          nextKey: null,
          orders: [
            { orderId: 'c1', sku: 'butler_pass', status: 'COMPLETED', date: '2026-10-01T00:00:00Z' },
            { orderId: 'c2', sku: 'gems_80', status: 'REFUNDED', date: '2026-10-02T00:00:00Z' },
          ],
        }),
        completeProductGrant: async ({ params }) => {
          completed.push(params.orderId);
          return true;
        },
      },
      Storage: {
        getItem: async (k) => store.get(k) ?? null,
        setItem: async (k, v) => void store.set(k, v),
        removeItem: async (k) => void store.delete(k),
      },
      getUserKeyForGame: async () => ({ type: 'HASH', hash: 'h-1' }),
      submitGameCenterLeaderBoardScore: vi.fn(async () => undefined),
    };
    return { b, calls, completed, onShow: (f: typeof showEvents) => (showEvents = f) };
  }

  async function ready() {
    vi.stubEnv('VITE_TOSS_REWARDED_AD_GROUP_ID', 'rew-1');
    const t = bridge();
    registerTossBridge(t.b);
    const a = createToss();
    await a.init();
    await vi.advanceTimersByTimeAsync(0);
    return { a, t };
  }

  it('degrades to unavailable while the bridge is missing', async () => {
    vi.stubEnv('VITE_TOSS_REWARDED_AD_GROUP_ID', 'rew-1');
    const a = createToss();
    await a.init();
    expect(a.ads.isAvailable('rewarded', 'revive')).toBe(false);
    expect(await a.ads.show('rewarded', 'revive')).toMatchObject({ shown: false });
    expect(a.iap?.isAvailable?.()).toBe(false);
    expect(await a.iap?.purchase('gems_80', async () => true)).toBe('unavailable');
    expect(await a.iap?.pendingOrders()).toEqual([]);
    await a.storage.set('k', 'v'); // falls back to localStorage/memory
    expect(await a.storage.get('k')).toBe('v');
    expect(await a.identity?.userKey()).toBeNull();
  });

  it('preloads, and rewards only on userEarnedReward', async () => {
    const { a, t } = await ready();
    expect(a.ads.isAvailable('rewarded', 'revive')).toBe(true);
    t.onShow((cb) => {
      cb({ type: 'show' });
      cb({ type: 'userEarnedReward', data: { unitType: 'coin', unitAmount: 1 } });
      cb({ type: 'dismissed' });
    });
    expect(await a.ads.show('rewarded', 'revive')).toEqual({ shown: true, rewarded: true });
    expect(t.calls).toContain('show-cleanup');
    expect(a.ads.isAvailable('rewarded', 'revive')).toBe(false); // consumed: must be loaded again
  });

  it('dismissed without userEarnedReward is NOT a reward', async () => {
    const { a, t } = await ready();
    t.onShow((cb) => {
      cb({ type: 'show' });
      cb({ type: 'dismissed' });
    });
    expect(await a.ads.show('rewarded', 'revive')).toEqual({ shown: true, rewarded: false });
  });

  it('failedToShow and onError mean nothing shown / no reward; an unloaded ad is refused', async () => {
    const { a, t } = await ready();
    t.onShow((cb) => cb({ type: 'failedToShow' }));
    expect(await a.ads.show('rewarded', 'revive')).toMatchObject({ shown: false });
    expect(await a.ads.show('rewarded', 'revive')).toMatchObject({ shown: false, error: 'not_loaded' });
    a.ads.preload('rewarded', 'revive');
    await vi.advanceTimersByTimeAsync(0);
    expect(a.ads.isAvailable('rewarded', 'revive')).toBe(true);
  });

  it('interstitials are off by default on Toss (GDD 8.1)', async () => {
    const { a } = await ready();
    expect(a.capabilities.interstitialAds).toBe(false);
    expect(a.ads.isAvailable('interstitial', 'run_end')).toBe(false);
  });

  it('needs an ad group id from the build environment', async () => {
    registerTossBridge(bridge().b);
    const a = createToss();
    await a.init();
    expect(a.ads.isAvailable('rewarded', 'revive')).toBe(false);
  });

  it('purchase: grants inside processProductGrant, resolves purchased on success, cleans up', async () => {
    const { a, t } = await ready();
    const original = t.b.IAP?.createOneTimePurchaseOrder;
    expect(original).toBeDefined();
    t.b.IAP!.createOneTimePurchaseOrder = (p) => {
      t.calls.push('buy:' + p.options.sku);
      void (async () => {
        const ok = await p.options.processProductGrant({ orderId: 'o-9' });
        if (ok) p.onEvent({ type: 'success', data: { orderId: 'o-9' } });
        else p.onError(new Error('grant failed'));
      })();
      return () => t.calls.push('buy-cleanup');
    };
    const granted: string[] = [];
    const out = await a.iap!.purchase('gems_80', async (orderId) => {
      granted.push(orderId);
      return true;
    });
    expect(out).toBe('purchased');
    expect(granted).toEqual(['o-9']);
    expect(t.calls).toContain('buy-cleanup');
  });

  it('purchase: USER_CANCELED -> cancelled, other errors -> failed, failed grant -> failed', async () => {
    const { a, t } = await ready();
    const run = (outcome: (p: Parameters<NonNullable<TossBridge['IAP']>['createOneTimePurchaseOrder']>[0]) => void) => {
      t.b.IAP!.createOneTimePurchaseOrder = (p) => {
        queueMicrotask(() => outcome(p));
        return () => undefined;
      };
    };
    run((p) => p.onError({ code: 'USER_CANCELED' }));
    expect(await a.iap!.purchase('gems_80', async () => true)).toBe('cancelled');
    run((p) => p.onError(new Error('network')));
    expect(await a.iap!.purchase('gems_80', async () => true)).toBe('failed');
    run((p) => {
      void p.options.processProductGrant({ orderId: 'o-2' });
      p.onEvent({ type: 'success', data: { orderId: 'o-2' } });
    });
    expect(await a.iap!.purchase('gems_80', async () => false)).toBe('failed');
  });

  it('pending orders map sku -> productId and completion goes through completeProductGrant', async () => {
    const { a, t } = await ready();
    expect(await a.iap!.pendingOrders()).toEqual([{ orderId: 'o1', productId: 'gems_80' }]);
    await a.iap!.complete('o1');
    expect(t.completed).toEqual(['o1']);
  });

  it('lists completed and refunded orders (first page) for the restore', async () => {
    const { a, t } = await ready();
    expect(await a.iap!.completedOrders!()).toEqual([
      { orderId: 'c1', productId: 'butler_pass', status: 'completed' },
      { orderId: 'c2', productId: 'gems_80', status: 'refunded' },
    ]);
    delete t.b.IAP!.getCompletedOrRefundedOrders; // older Toss apps do not have it
    expect(await a.iap!.completedOrders!()).toEqual([]);
    registerTossBridge(null);
    expect(await a.iap!.completedOrders!()).toEqual([]);
  });

  it('gives up on a load that never answers and retries later', async () => {
    const { a, t } = await ready();
    t.b.GoogleAdMob!.loadAppsInTossAdMob = Object.assign(
      () => {
        t.calls.push('silent-load');
        return () => undefined;
      },
      { isSupported: () => true },
    );
    t.onShow((cb) => cb({ type: 'dismissed' }));
    await a.ads.show('rewarded', 'revive'); // consume the loaded ad
    a.ads.preload('rewarded', '*');
    expect(t.calls.filter((c) => c === 'silent-load')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(20_000); // load timeout -> idle, retry armed
    expect(a.ads.isAvailable('rewarded', 'revive')).toBe(false);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(t.calls.filter((c) => c === 'silent-load')).toHaveLength(2);
  });

  it('never offers interstitials: the full-screen ad calls are not used', async () => {
    const { a, t } = await ready();
    expect(await a.ads.show('interstitial', 'run_end')).toMatchObject({ shown: false });
    a.ads.preload('interstitial', '*');
    expect(t.calls.filter((c) => c.startsWith('load:'))).toHaveLength(1); // only the rewarded preload from init
  });

  it('maps storage, identity and the leaderboard (score as a string)', async () => {
    const { a, t } = await ready();
    await a.storage.set('k', 'v');
    expect(await a.storage.get('k')).toBe('v');
    await a.storage.remove('k');
    expect(await a.storage.get('k')).toBeNull();
    expect(await a.identity?.userKey()).toBe('h-1');
    await a.leaderboard?.submit('main', 42);
    expect(t.b.submitGameCenterLeaderBoardScore).toHaveBeenCalledWith({ score: '42' });
  });
});

describe('Capacitor (plugins)', () => {
  function plugins() {
    const listeners = new Map<string, Array<(i: unknown) => void>>();
    const fire = (e: string, info: unknown = {}): void => listeners.get(e)?.slice().forEach((f) => f(info));
    const prefs = new Map<string, string>();
    let showResult: () => Promise<{ type?: string; amount?: number } | undefined> = async () => undefined;
    const AdMob = {
      initialize: vi.fn(async () => undefined),
      prepareRewardVideoAd: vi.fn(async () => {
        queueMicrotask(() => fire('onRewardedVideoAdLoaded'));
      }),
      showRewardVideoAd: vi.fn(() => showResult()),
      prepareInterstitial: vi.fn(async () => undefined),
      showInterstitial: vi.fn(async () => undefined),
      addListener: vi.fn(async (e: string, cb: (i: unknown) => void) => {
        const l = listeners.get(e) ?? [];
        l.push(cb);
        listeners.set(e, l);
        return {
          remove: async () => {
            listeners.set(e, (listeners.get(e) ?? []).filter((f) => f !== cb));
          },
        };
      }),
    };
    const p: CapacitorPlugins = {
      AdMob,
      Preferences: {
        get: async ({ key }) => ({ value: prefs.get(key) ?? null }),
        set: async ({ key, value }) => void prefs.set(key, value),
        remove: async ({ key }) => void prefs.delete(key),
      },
    };
    return { p, AdMob, fire, listeners, setShow: (f: typeof showResult) => (showResult = f) };
  }

  async function ready(extra?: (t: ReturnType<typeof plugins>) => void) {
    vi.stubEnv('VITE_ADMOB_REWARDED_ID', 'ca-app-pub-test/1');
    const t = plugins();
    extra?.(t);
    registerCapacitorPlugins(t.p);
    const a = createCap();
    await a.init();
    await vi.advanceTimersByTimeAsync(0);
    return { a, t };
  }

  it('degrades to unavailable without plugins and with no ad unit id', async () => {
    const a = createCap();
    await a.init();
    expect(a.ads.isAvailable('rewarded', 'revive')).toBe(false);
    expect(await a.ads.show('rewarded', 'revive')).toMatchObject({ shown: false });
    expect(await a.iap?.purchase('gems_80', async () => true)).toBe('unavailable');
    registerCapacitorPlugins(plugins().p);
    const b = createCap();
    await b.init();
    expect(b.ads.isAvailable('rewarded', 'revive')).toBe(false); // no VITE_ADMOB_REWARDED_ID
  });

  it('finds plugins on window.Capacitor.Plugins when none were registered explicitly', async () => {
    vi.stubEnv('VITE_ADMOB_REWARDED_ID', 'x');
    const t = plugins();
    g.Capacitor = { Plugins: t.p };
    const a = createCap();
    await a.init();
    await vi.advanceTimersByTimeAsync(0);
    expect(a.ads.isAvailable('rewarded', 'revive')).toBe(true);
  });

  it('preloads on init, rewards on the Rewarded event, settles on Dismissed, removes its listeners', async () => {
    const { a, t } = await ready();
    expect(t.AdMob.initialize).toHaveBeenCalled();
    expect(t.AdMob.prepareRewardVideoAd).toHaveBeenCalledWith(expect.objectContaining({ adId: 'ca-app-pub-test/1' }));
    expect(a.ads.isAvailable('rewarded', 'revive')).toBe(true);
    t.setShow(async () => {
      t.fire('onRewardedVideoAdReward', { type: 'coin', amount: 1 });
      return { type: 'coin', amount: 1 };
    });
    const p = a.ads.show('rewarded', 'revive');
    await vi.advanceTimersByTimeAsync(0);
    t.fire('onRewardedVideoAdDismissed');
    expect(await p).toEqual({ shown: true, rewarded: true });
    expect(t.listeners.get('onRewardedVideoAdDismissed')?.length ?? 0).toBe(0);
    expect(a.ads.isAvailable('rewarded', 'revive')).toBe(false);
  });

  it('dismissed with no reward is not rewarded; failedToShow is not shown; a rejected show is not shown', async () => {
    const { a, t } = await ready();
    t.setShow(async () => undefined);
    let p = a.ads.show('rewarded', 'revive');
    await vi.advanceTimersByTimeAsync(0);
    t.fire('onRewardedVideoAdDismissed');
    expect(await p).toEqual({ shown: true, rewarded: false });

    t.fire('onRewardedVideoAdLoaded');
    t.setShow(() => new Promise(() => undefined));
    p = a.ads.show('rewarded', 'revive');
    await vi.advanceTimersByTimeAsync(0);
    t.fire('onRewardedVideoAdFailedToShow');
    expect(await p).toMatchObject({ shown: false });

    t.fire('onRewardedVideoAdLoaded');
    t.setShow(async () => {
      throw new Error('native crash');
    });
    expect(await a.ads.show('rewarded', 'revive')).toMatchObject({ shown: false });
  });

  it('retries loading after a failed load', async () => {
    const { a, t } = await ready();
    a.ads.preload('rewarded', 'x'); // already loaded: no-op
    t.fire('onRewardedVideoAdFailedToLoad');
    expect(a.ads.isAvailable('rewarded', 'revive')).toBe(false);
    t.AdMob.prepareRewardVideoAd.mockClear();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(t.AdMob.prepareRewardVideoAd).toHaveBeenCalledTimes(1);
  });

  it('interstitials are off by default on store builds (GDD 8.1)', async () => {
    const { a } = await ready();
    expect(a.capabilities.interstitialAds).toBe(false);
    expect(a.ads.isAvailable('interstitial', 'run_end')).toBe(false);
  });

  it('stores through Preferences and follows appStateChange for pause/resume', async () => {
    let appCb: ((s: { isActive: boolean }) => void) | undefined;
    const { a, t } = await ready((x) => {
      x.p.App = {
        addListener: (_e, cb) => {
          appCb = cb;
          return { remove: () => undefined };
        },
      };
    });
    // `ready` registered the App plugin before init, so the listener is wired already
    await a.storage.set('k', 'v');
    expect(await a.storage.get('k')).toBe('v');
    await a.storage.remove('k');
    expect(await a.storage.get('k')).toBeNull();
    const seen: string[] = [];
    a.lifecycle.onPause(() => seen.push('pause'));
    a.lifecycle.onResume(() => seen.push('resume'));
    appCb?.({ isActive: false });
    appCb?.({ isActive: true });
    expect(seen).toEqual(['pause', 'resume']);
    expect(t.p.Preferences).toBeDefined();
  });

  it('purchase maps the store transaction to the order id; cancel and failure are distinguished', async () => {
    const { a, t } = await ready();
    const purchases = {
      getProducts: vi.fn(async (o: { productIdentifiers: string[] }) => ({
        products: o.productIdentifiers.map((id) => ({ identifier: id, priceString: '₩1,500' })),
      })),
      purchaseStoreProduct: vi.fn(async () => ({ transaction: { transactionIdentifier: 'tx-1' } })),
      restorePurchases: vi.fn(async () => ({
        nonSubscriptionTransactions: [
          { transactionIdentifier: 'tx-1', productIdentifier: 'gems_80' },
          { transactionId: 'tx-2', productId: 'butler_pass' },
          { productIdentifier: 'no_transaction_id' },
        ],
      })),
    };
    t.p.Purchases = purchases;
    const ids: string[] = [];
    expect(
      await a.iap!.purchase('gems_80', async (id) => {
        ids.push(id);
        return true;
      }),
    ).toBe('purchased');
    expect(ids).toEqual(['tx-1']);
    purchases.purchaseStoreProduct.mockRejectedValueOnce({ userCancelled: true });
    expect(await a.iap!.purchase('gems_80', async () => true)).toBe('cancelled');
    purchases.purchaseStoreProduct.mockRejectedValueOnce(new Error('billing unavailable'));
    expect(await a.iap!.purchase('gems_80', async () => true)).toBe('failed');
    expect(await a.iap!.products!(['gems_80'])).toEqual([{ id: 'gems_80', priceText: '₩1,500' }]);
    expect(await a.iap!.pendingOrders()).toEqual([]);
    // restore: the CustomerInfo's non-subscription transactions are the completed orders (refunds are not visible)
    expect(await a.iap!.completedOrders!()).toEqual([
      { orderId: 'tx-1', productId: 'gems_80', status: 'completed' },
      { orderId: 'tx-2', productId: 'butler_pass', status: 'completed' },
    ]);
    purchases.restorePurchases.mockResolvedValueOnce({
      customerInfo: { nonSubscriptionTransactions: [{ transactionIdentifier: 'tx-9', productIdentifier: 'starter_pack' }] },
    } as never);
    expect(await a.iap!.completedOrders!()).toEqual([{ orderId: 'tx-9', productId: 'starter_pack', status: 'completed' }]);
  });

  it('gives up on a load that never answers and retries later', async () => {
    const { a, t } = await ready((x) => {
      x.AdMob.prepareRewardVideoAd.mockImplementation(async () => undefined); // never fires Loaded
    });
    expect(a.ads.isAvailable('rewarded', 'revive')).toBe(false);
    t.AdMob.prepareRewardVideoAd.mockClear();
    await vi.advanceTimersByTimeAsync(20_000);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(t.AdMob.prepareRewardVideoAd).toHaveBeenCalledTimes(1);
  });

  it('never uses AdMob interstitials: they are portal-only', async () => {
    const { a, t } = await ready();
    expect(await a.ads.show('interstitial', 'run_end')).toMatchObject({ shown: false });
    expect(t.AdMob.showInterstitial).not.toHaveBeenCalled();
    expect(t.AdMob.prepareInterstitial).not.toHaveBeenCalled();
  });
});
