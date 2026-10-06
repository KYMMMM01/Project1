import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AD_WATCHDOG_MS } from '@/platform/adService';
import { createMemoryPersistence, emptyCounters, type AdCounters } from '@/platform/adPolicy';
import { makeAds } from './platformHelpers';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/** The exact order game.setExternalPause + audio.setMuted must see around one ad. */
const BRACKET = ['pause:true', 'mute:true', 'mute:false', 'pause:false'];

describe('AdService.showRewarded: result mapping and the reward rule', () => {
  it("reports 'rewarded' only on the adapter's completion signal, pauses and mutes around the ad", async () => {
    const t = makeAds();
    const r = await t.ads.showRewarded('revive');
    expect(r).toBe('rewarded');
    expect(t.pauser.calls).toEqual(BRACKET);
    expect(t.fake.log).toContain('show:rewarded:revive');
  });

  it('pauses BEFORE the SDK is asked and restores only after it answered', async () => {
    const t = makeAds();
    let resolveAd!: (v: { shown: boolean; rewarded: boolean }) => void;
    t.fake.state.next = () => new Promise((res) => (resolveAd = res));
    const p = t.ads.showRewarded('revive');
    await vi.advanceTimersByTimeAsync(0);
    expect(t.pauser.calls).toEqual(['pause:true', 'mute:true']);
    expect(t.fake.log).toContain('show:rewarded:revive');
    expect(t.ads.busy).toBe(true);
    resolveAd({ shown: true, rewarded: true });
    expect(await p).toBe('rewarded');
    expect(t.pauser.calls).toEqual(BRACKET);
    expect(t.ads.busy).toBe(false);
  });

  it.each([
    ['shown but not completed', { shown: true, rewarded: false }, 'dismissed'],
    ['shown, reward flag absent', { shown: true }, 'dismissed'],
    ['SDK error, nothing shown', { shown: false, error: 'adError' }, 'unavailable'],
    ['contradiction: rewarded without shown', { shown: false, rewarded: true }, 'unavailable'],
  ] as const)('does not grant on: %s', async (_n, result, expected) => {
    const t = makeAds();
    t.fake.state.next = result;
    expect(await t.ads.showRewarded('revive')).toBe(expected);
    expect(t.pauser.calls).toEqual(BRACKET);
    // nothing was counted, so the same placement can be offered again
    expect(t.ads.remaining('revive')).toBe(1);
    expect(t.ads.canOffer('revive')).toBe(true);
  });

  it('restores pause and mute when the SDK throws (finally)', async () => {
    const t = makeAds();
    t.fake.state.next = () => Promise.reject(new Error('boom'));
    expect(await t.ads.showRewarded('revive')).toBe('unavailable');
    expect(t.pauser.calls).toEqual(BRACKET);
    expect(t.pauser.depth).toEqual({ paused: 0, muted: 0 });
  });

  it('restores when show() throws synchronously', async () => {
    const t = makeAds();
    t.fake.adapter.ads.show = () => {
      throw new Error('sync boom');
    };
    expect(await t.ads.showRewarded('revive')).toBe('unavailable');
    expect(t.pauser.depth).toEqual({ paused: 0, muted: 0 });
  });

  it('does not touch pause/mute at all when no ad is available', async () => {
    const t = makeAds();
    t.fake.state.available = false;
    expect(await t.ads.showRewarded('revive')).toBe('unavailable');
    expect(t.pauser.calls).toEqual([]);
    expect(t.ads.canOffer('revive')).toBe(false);
  });

  it('is unavailable on a platform without rewarded ads, and for unknown placements', async () => {
    const t = makeAds({ caps: { rewardedAds: false } });
    expect(await t.ads.showRewarded('revive')).toBe('unavailable');
    const u = makeAds();
    expect(await u.ads.showRewarded('not_a_placement')).toBe('unavailable');
    expect(u.fake.log.filter((l) => l.startsWith('show:'))).toEqual([]);
  });

  it('refuses a second ad while one is open (one modal at a time)', async () => {
    const t = makeAds();
    let resolveAd!: (v: { shown: boolean; rewarded: boolean }) => void;
    t.fake.state.next = () => new Promise((res) => (resolveAd = res));
    const first = t.ads.showRewarded('revive');
    await vi.advanceTimersByTimeAsync(0);
    expect(await t.ads.showRewarded('double_reward')).toBe('unavailable');
    resolveAd({ shown: true, rewarded: true });
    expect(await first).toBe('rewarded');
    expect(t.pauser.depth).toEqual({ paused: 0, muted: 0 });
  });
});

describe('AdService: 90 s watchdog', () => {
  it('restores pause/mute and settles when the SDK never answers', async () => {
    const t = makeAds();
    t.fake.state.next = () => new Promise(() => undefined); // never settles
    let settled: string | null = null;
    const p = t.ads.showRewarded('revive').then((r) => (settled = r));
    await vi.advanceTimersByTimeAsync(AD_WATCHDOG_MS - 1);
    expect(settled).toBeNull();
    expect(t.pauser.calls).toEqual(['pause:true', 'mute:true']); // still held at 89.999 s
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(settled).toBe('unavailable');
    expect(t.pauser.calls).toEqual(BRACKET);
    expect(t.pauser.depth).toEqual({ paused: 0, muted: 0 });
    expect(t.ads.busy).toBe(false);
    expect(t.ads.remaining('revive')).toBe(1); // no reward was counted
  });

  it('ignores an SDK answer that arrives after the watchdog fired', async () => {
    const t = makeAds();
    let late!: (v: { shown: boolean; rewarded: boolean }) => void;
    t.fake.state.next = () => new Promise((res) => (late = res));
    const p = t.ads.showRewarded('revive');
    await vi.advanceTimersByTimeAsync(AD_WATCHDOG_MS);
    expect(await p).toBe('unavailable');
    late({ shown: true, rewarded: true });
    await vi.advanceTimersByTimeAsync(10);
    expect(t.pauser.calls).toEqual(BRACKET); // no second restore
    expect(t.ads.remaining('revive')).toBe(1);
  });

  it('a watchdog is armed for interstitials too, and the game is playable again afterwards', async () => {
    const t = makeAds();
    t.fake.state.next = () => new Promise(() => undefined);
    const p = t.ads.showInterstitial('run_end');
    await vi.advanceTimersByTimeAsync(AD_WATCHDOG_MS);
    expect(await p).toBe(false);
    expect(t.pauser.depth).toEqual({ paused: 0, muted: 0 });
    expect(t.ads.busy).toBe(false);
  });
});

describe('AdService: caps, run reset, date rollover', () => {
  it('per-run placements: one reward per run, reset only by beginRun()', async () => {
    const t = makeAds();
    expect(await t.ads.showRewarded('revive')).toBe('rewarded');
    expect(t.ads.canOffer('revive')).toBe(false);
    expect(t.ads.remaining('revive')).toBe(0);
    expect(await t.ads.showRewarded('revive')).toBe('capped');
    expect(t.fake.log.filter((l) => l === 'show:rewarded:revive')).toHaveLength(1); // no 2nd ad was shown
    t.ads.beginRun();
    expect(t.ads.canOffer('revive')).toBe(true);
    expect(await t.ads.showRewarded('revive')).toBe('rewarded');
  });

  it('daily placements: free_chest 4, patrol_double 3, shop_refresh 2, independent of runs', async () => {
    const t = makeAds();
    const caps = { free_chest: 4, patrol_double: 3, shop_refresh: 2 } as const;
    for (const [p, n] of Object.entries(caps)) {
      for (let i = 0; i < n; i++) expect(await t.ads.showRewarded(p)).toBe('rewarded');
      expect(await t.ads.showRewarded(p)).toBe('capped');
    }
    t.ads.beginRun();
    expect(await t.ads.showRewarded('free_chest')).toBe('capped');
  });

  it('daily caps reset on the next local date', async () => {
    const t = makeAds();
    for (let i = 0; i < 2; i++) await t.ads.showRewarded('shop_refresh');
    expect(await t.ads.showRewarded('shop_refresh')).toBe('capped');
    t.clock.advance(24 * 3600 * 1000);
    expect(t.ads.canOffer('shop_refresh')).toBe(true);
    expect(await t.ads.showRewarded('shop_refresh')).toBe('rewarded');
    expect(t.ads.remaining('shop_refresh')).toBe(1);
  });

  it('keeps counters in the injected persistence (the meta layer profile)', async () => {
    const saved: AdCounters[] = [];
    let profile = emptyCounters();
    const persistence = {
      load: () => profile,
      save: (c: AdCounters) => {
        profile = JSON.parse(JSON.stringify(c)) as AdCounters;
        saved.push(profile);
      },
    };
    const t = makeAds({ deps: { persistence } });
    await t.ads.showRewarded('free_chest');
    expect(profile.daily.free_chest).toBe(1);
    expect(profile.last.free_chest).toBe(t.clock.t);
    // a second AdService over the same profile sees the same caps
    const u = makeAds({ deps: { persistence }, skipFtue: false });
    expect(u.ads.remaining('free_chest')).toBe(3);
    // attachPersistence swaps the store and re-reads it
    const other = createMemoryPersistence();
    t.ads.attachPersistence(other);
    expect(t.ads.remaining('free_chest')).toBe(4);
  });

  it('exposes canOffer / remaining / status for the UI', () => {
    const t = makeAds();
    expect(t.ads.remaining('revive')).toBe(1);
    expect(t.ads.remaining('free_chest')).toBe(4);
    expect(t.ads.status('free_chest')).toMatchObject({ canOffer: true, reason: 'ok', dailyLeft: 4 });
    expect(t.ads.status('nope')).toMatchObject({ canOffer: false, reason: 'unknown_placement' });
  });
});

describe('AdService: first run guard (docs/명세_메타.md section 8)', () => {
  it('offers nothing until the second run has begun', async () => {
    const t = makeAds({ skipFtue: false });
    expect(t.ads.canOffer('free_chest')).toBe(false);
    expect(t.ads.status('free_chest').reason).toBe('first_run');
    expect(await t.ads.showRewarded('free_chest')).toBe('unavailable');
    t.ads.beginRun(); // first run
    expect(t.ads.canOffer('double_reward')).toBe(false);
    t.ads.endRun('victory');
    expect(t.ads.canOffer('double_reward')).toBe(false); // the first run's result screen still counts as the first run
    t.ads.beginRun(); // second run
    expect(t.ads.canOffer('revive')).toBe(true);
  });
});

describe('AdService: ad-free pass', () => {
  it("resolves 'rewarded' at once without an ad or any pause, but still counts against the caps", async () => {
    const t = makeAds();
    t.ads.setAdFree(true);
    expect(await t.ads.showRewarded('revive')).toBe('rewarded');
    expect(t.fake.log.filter((l) => l.startsWith('show:'))).toEqual([]);
    expect(t.pauser.calls).toEqual([]);
    expect(await t.ads.showRewarded('revive')).toBe('capped'); // per-run cap applies
    for (let i = 0; i < 4; i++) expect(await t.ads.showRewarded('free_chest')).toBe('rewarded');
    expect(await t.ads.showRewarded('free_chest')).toBe('capped'); // daily cap applies
    t.ads.beginRun();
    expect(await t.ads.showRewarded('revive')).toBe('rewarded');
  });

  it('works even where the platform has no rewarded ads / no ad is available', async () => {
    const t = makeAds({ caps: { rewardedAds: false } });
    t.fake.state.available = false;
    t.ads.setAdFree(true);
    expect(t.ads.canOffer('patrol_double')).toBe(true);
    expect(await t.ads.showRewarded('patrol_double')).toBe('rewarded');
  });
});

describe('AdService: interstitials end to end', () => {
  it('shows one when every condition holds and never when ad-free', async () => {
    const t = makeAds();
    expect(t.ads.canShowInterstitial()).toEqual({ ok: true });
    expect(await t.ads.showInterstitial('run_end')).toBe(true);
    expect(t.pauser.calls).toEqual(BRACKET);
    expect(t.fake.log).toContain('show:interstitial:run_end');
    t.clock.advance(121_000);
    t.ads.setAdFree(true);
    expect(await t.ads.showInterstitial('run_end')).toBe(false);
    expect(t.pauser.calls).toEqual(BRACKET); // blocked: no extra pause
  });

  it('keeps 120 s between ads of ANY kind (a rewarded ad counts)', async () => {
    const t = makeAds();
    expect(await t.ads.showRewarded('free_chest')).toBe('rewarded');
    expect(t.ads.canShowInterstitial()).toEqual({ ok: false, why: 'gap' });
    t.clock.advance(119_999);
    expect(t.ads.canShowInterstitial()).toEqual({ ok: false, why: 'gap' });
    t.clock.advance(1);
    expect(t.ads.canShowInterstitial()).toEqual({ ok: true });
    expect(await t.ads.showInterstitial('run_end')).toBe(true);
    expect(t.ads.canShowInterstitial()).toEqual({ ok: false, why: 'gap' }); // and an interstitial counts for the next
  });

  it('is blocked right after a defeat until the next run begins', () => {
    const t = makeAds();
    t.ads.beginRun();
    t.ads.endRun('defeat');
    expect(t.ads.canShowInterstitial()).toEqual({ ok: false, why: 'after_defeat' });
    t.ads.beginRun();
    expect(t.ads.canShowInterstitial()).toEqual({ ok: true });
    t.ads.endRun('victory');
    expect(t.ads.canShowInterstitial()).toEqual({ ok: true });
  });

  it('needs the second session and 3 completed runs; abandoned runs do not count', () => {
    const t = makeAds({ skipFtue: false });
    expect(t.ads.canShowInterstitial()).toEqual({ ok: false, why: 'first_session' });
    t.ads.qaSetProgress({ sessions: 2 });
    expect(t.ads.canShowInterstitial()).toEqual({ ok: false, why: 'few_runs' });
    for (const result of ['victory', 'defeat', 'abandon'] as const) {
      t.ads.beginRun();
      t.ads.endRun(result);
    }
    expect(t.ads.counters.runsCompleted).toBe(2);
    t.ads.beginRun();
    t.ads.endRun('victory');
    expect(t.ads.counters.runsCompleted).toBe(3);
    expect(t.ads.canShowInterstitial()).toEqual({ ok: true });
  });

  it('is blocked where the platform has no interstitials or none is ready', async () => {
    const a = makeAds({ caps: { interstitialAds: false } });
    expect(a.ads.canShowInterstitial()).toEqual({ ok: false, why: 'platform' });
    expect(await a.ads.showInterstitial('run_end')).toBe(false);
    expect(a.fake.log.filter((l) => l.startsWith('show:'))).toEqual([]);
    const b = makeAds();
    b.fake.state.available = false;
    expect(b.ads.canShowInterstitial()).toEqual({ ok: false, why: 'unavailable' });
  });

  it('a failed interstitial does not start the 120 s gap and returns false', async () => {
    const t = makeAds();
    t.fake.state.next = { shown: false, error: 'no_fill' };
    expect(await t.ads.showInterstitial('run_end')).toBe(false);
    expect(t.ads.canShowInterstitial()).toEqual({ ok: true });
    expect(t.pauser.depth).toEqual({ paused: 0, muted: 0 });
  });
});

describe('AdService: preload and analytics', () => {
  it('re-preloads after every ad and warms every placement', async () => {
    const t = makeAds();
    t.ads.warm();
    expect(t.fake.log.filter((l) => l.startsWith('preload:rewarded:'))).toHaveLength(7);
    t.fake.log.length = 0;
    await t.ads.showRewarded('revive');
    expect(t.fake.log).toContain('preload:rewarded:revive');
  });

  it("emits 'ad_offer' and 'ad_result' with the outcome", async () => {
    const t = makeAds();
    await t.ads.showRewarded('revive');
    await t.ads.showRewarded('revive');
    const events = t.analytics.buffer();
    expect(events.map((e) => e.event)).toEqual(['ad_offer', 'ad_result', 'ad_offer', 'ad_result']);
    expect(events[1]?.params).toMatchObject({ kind: 'rewarded', placement: 'revive', outcome: 'rewarded' });
    expect(events[3]?.params).toMatchObject({ outcome: 'capped', why: 'run_cap' });
  });
});
