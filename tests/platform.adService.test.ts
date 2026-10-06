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

/** The exact order game.setExternalPause + audio.setMuted must see around one ad (the input shield opens first and closes last). */
const BRACKET = ['block:true', 'pause:true', 'mute:true', 'block:false', 'mute:false', 'pause:false'];
const GAP = 91_000;

type Ads = ReturnType<typeof makeAds>;

/** Watch one rewarded ad in its own run and let the 90 s gap pass, so a test can chain placements. */
async function watch(t: Ads, placement: string): Promise<string> {
  t.ads.beginRun();
  const r = await t.ads.showRewarded(placement);
  t.clock.advance(GAP);
  return r;
}

describe('AdService.showRewarded: result mapping and the reward rule', () => {
  it("reports 'rewarded' only on the adapter's completion signal, pauses and mutes around the ad", async () => {
    const t = makeAds();
    const r = await t.ads.showRewarded('revive');
    expect(r).toBe('rewarded');
    expect(t.pauser.calls).toEqual(BRACKET);
    expect(t.fake.log).toContain('show:rewarded:revive');
  });

  it('pauses and blocks input BEFORE the SDK is asked and restores only after it answered', async () => {
    const t = makeAds();
    let resolveAd!: (v: { shown: boolean; rewarded: boolean }) => void;
    t.fake.state.next = () => new Promise((res) => (resolveAd = res));
    const p = t.ads.showRewarded('revive');
    await vi.advanceTimersByTimeAsync(0);
    expect(t.pauser.calls).toEqual(['block:true', 'pause:true', 'mute:true']);
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
    // nothing was counted against the placement, so it can be offered again (after the gap if an ad did play)
    expect(t.ads.remaining('revive')).toBeGreaterThan(0);
    expect(t.ads.counters.daily.revive).toBeUndefined();
    expect(t.ads.counters.adsToday).toBe(0);
  });

  it('restores pause and mute when the SDK throws (finally)', async () => {
    const t = makeAds();
    t.fake.state.next = () => Promise.reject(new Error('boom'));
    expect(await t.ads.showRewarded('revive')).toBe('unavailable');
    expect(t.pauser.calls).toEqual(BRACKET);
    expect(t.pauser.depth).toEqual({ paused: 0, muted: 0, blocked: 0 });
  });

  it('restores when show() throws synchronously', async () => {
    const t = makeAds();
    t.fake.adapter.ads.show = () => {
      throw new Error('sync boom');
    };
    expect(await t.ads.showRewarded('revive')).toBe('unavailable');
    expect(t.pauser.depth).toEqual({ paused: 0, muted: 0, blocked: 0 });
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
    expect(t.ads.status('revive').reason).toBe('platform');
    const u = makeAds();
    expect(await u.ads.showRewarded('not_a_placement')).toBe('unavailable');
    expect(await u.ads.showRewarded('double_reward')).toBe('unavailable'); // the retired id
    expect(u.fake.log.filter((l) => l.startsWith('show:'))).toEqual([]);
  });

  it('refuses a second ad while one is open (one modal at a time)', async () => {
    const t = makeAds();
    let resolveAd!: (v: { shown: boolean; rewarded: boolean }) => void;
    t.fake.state.next = () => new Promise((res) => (resolveAd = res));
    const first = t.ads.showRewarded('revive');
    await vi.advanceTimersByTimeAsync(0);
    expect(t.ads.canOffer('result_double')).toBe(false);
    expect(await t.ads.showRewarded('result_double')).toBe('unavailable');
    resolveAd({ shown: true, rewarded: true });
    expect(await first).toBe('rewarded');
    expect(t.pauser.depth).toEqual({ paused: 0, muted: 0, blocked: 0 });
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
    expect(t.pauser.calls).toEqual(['block:true', 'pause:true', 'mute:true']); // still held at 89.999 s
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(settled).toBe('unavailable');
    expect(t.pauser.calls).toEqual(BRACKET);
    expect(t.pauser.depth).toEqual({ paused: 0, muted: 0, blocked: 0 });
    expect(t.ads.busy).toBe(false);
    expect(t.ads.remaining('revive')).toBeGreaterThan(0); // no reward was counted
    expect(t.ads.counters.daily.revive).toBeUndefined();
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
    expect(t.ads.counters.daily.revive).toBeUndefined();
  });

  it('a watchdog is armed for interstitials too, and the game is playable again afterwards', async () => {
    const t = makeAds();
    t.ads.beginRun();
    t.ads.endRun('victory');
    t.fake.state.next = () => new Promise(() => undefined);
    const p = t.ads.showInterstitial('run_end');
    await vi.advanceTimersByTimeAsync(AD_WATCHDOG_MS);
    expect(await p).toBe(false);
    expect(t.pauser.depth).toEqual({ paused: 0, muted: 0, blocked: 0 });
    expect(t.ads.busy).toBe(false);
  });
});

describe('AdService: placement caps, run reset, date rollover', () => {
  it('per-run placements: one reward per run, reset only by beginRun()', async () => {
    const t = makeAds();
    expect(await t.ads.showRewarded('revive')).toBe('rewarded');
    expect(t.ads.canOffer('revive')).toBe(false);
    expect(t.ads.remaining('revive')).toBe(0);
    expect(await t.ads.showRewarded('revive')).toBe('capped');
    expect(t.fake.log.filter((l) => l === 'show:rewarded:revive')).toHaveLength(1); // no 2nd ad was shown
    t.clock.advance(GAP);
    t.ads.beginRun();
    expect(t.ads.canOffer('revive')).toBe(true);
    expect(await t.ads.showRewarded('revive')).toBe('rewarded');
  });

  it('daily placements: free_chest 4, patrol_double 3, shop_refresh 2, snack_box 3, daily_treat 3, independent of runs', async () => {
    const t = makeAds();
    const caps = { free_chest: 4, patrol_double: 3, shop_refresh: 2 } as const;
    for (const [p, n] of Object.entries(caps)) {
      for (let i = 0; i < n; i++) expect(await watch(t, p)).toBe('rewarded');
      t.ads.beginRun();
      expect(await t.ads.showRewarded(p)).toBe('capped');
      t.clock.advance(GAP);
    }
    // the 12 a day is not hit yet (9 so far); snack_box and daily_treat keep their own 3
    for (let i = 0; i < 3; i++) expect(await watch(t, 'snack_box')).toBe('rewarded');
    t.ads.beginRun();
    expect(t.ads.status('snack_box')).toMatchObject({ canOffer: false, reason: 'daily_cap', dailyLeft: 0 });
    expect(t.ads.status('daily_treat')).toMatchObject({ canOffer: false, reason: 'day_cap' }); // 12 reached
    expect(t.ads.status('daily_treat').dailyLeft).toBe(3);
  });

  it("sweep_ticket (the meta layer's ticket ad) is a known placement: it plays, twice a day, and the pass does not skip it", async () => {
    const t = makeAds();
    expect(t.ads.status('sweep_ticket')).toMatchObject({ canOffer: true, reason: 'ok', dailyLeft: 2, perRunLeft: Infinity });
    expect(await t.ads.showRewarded('sweep_ticket')).toBe('rewarded');
    expect(t.fake.log).toContain('show:rewarded:sweep_ticket');
    t.clock.advance(GAP);
    expect(await t.ads.showRewarded('sweep_ticket')).toBe('rewarded');
    t.clock.advance(GAP);
    expect(t.ads.status('sweep_ticket')).toMatchObject({ canOffer: false, reason: 'daily_cap', dailyLeft: 0 });
    expect(await t.ads.showRewarded('sweep_ticket')).toBe('capped');
    expect(t.fake.log.filter((l) => l === 'show:rewarded:sweep_ticket')).toHaveLength(2);
    expect(t.ads.counters.daily.sweep_ticket).toBe(2);
    // an owner still watches the ad: the pass sells tickets (+3 a day) elsewhere, not this placement
    const owner = makeAds();
    owner.ads.setAdFree(true);
    expect(await owner.ads.showRewarded('sweep_ticket')).toBe('rewarded');
    expect(owner.fake.log).toContain('show:rewarded:sweep_ticket');
  });

  it('daily caps reset on the next local date', async () => {
    const t = makeAds();
    for (let i = 0; i < 2; i++) await watch(t, 'shop_refresh');
    t.ads.beginRun();
    expect(await t.ads.showRewarded('shop_refresh')).toBe('capped');
    t.clock.advance(24 * 3600 * 1000);
    expect(t.ads.canOffer('shop_refresh')).toBe(true);
    expect(await t.ads.showRewarded('shop_refresh')).toBe('rewarded');
    expect(t.ads.remaining('shop_refresh')).toBe(1);
  });

  it('keeps counters in the injected persistence (the meta layer profile)', async () => {
    let profile = emptyCounters();
    const persistence = {
      load: () => profile,
      save: (c: AdCounters) => {
        profile = JSON.parse(JSON.stringify(c)) as AdCounters;
      },
    };
    const t = makeAds({ deps: { persistence } });
    await t.ads.showRewarded('free_chest');
    expect(profile.daily.free_chest).toBe(1);
    expect(profile.adsToday).toBe(1);
    expect(profile.last.free_chest).toBe(t.clock.t);
    expect(profile.lastAnyAdAt).toBe(t.clock.t);
    // a second AdService over the same profile sees the same caps
    const u = makeAds({ deps: { persistence }, skipFtue: false });
    expect(u.ads.status('free_chest').dailyLeft).toBe(3);
    // attachPersistence swaps the store and re-reads it
    const other = createMemoryPersistence();
    t.ads.attachPersistence(other);
    expect(t.ads.status('free_chest').dailyLeft).toBe(4);
  });

  it('exposes canOffer / remaining / status for the UI', () => {
    const t = makeAds();
    expect(t.ads.remaining('revive')).toBe(1);
    expect(t.ads.remaining('free_chest')).toBe(4);
    expect(t.ads.status('free_chest')).toMatchObject({ canOffer: true, reason: 'ok', dailyLeft: 4 });
    expect(t.ads.status('nope')).toMatchObject({ canOffer: false, reason: 'unknown_placement', remaining: 0 });
  });
});

describe('AdService: global rules (GDD 8.2)', () => {
  it('keeps 90 s between any two ads and says how long to wait', async () => {
    const t = makeAds();
    expect(await t.ads.showRewarded('revive')).toBe('rewarded');
    t.ads.beginRun();
    expect(t.ads.canOffer('relic_reroll')).toBe(false);
    expect(t.ads.status('relic_reroll')).toMatchObject({ reason: 'gap', cooldownMs: 90_000 });
    expect(await t.ads.showRewarded('relic_reroll')).toBe('capped');
    t.clock.advance(89_999);
    expect(t.ads.canOffer('relic_reroll')).toBe(false);
    t.clock.advance(1);
    expect(t.ads.canOffer('relic_reroll')).toBe(true);
    expect(await t.ads.showRewarded('relic_reroll')).toBe('rewarded');
  });

  it('a failed ad (nothing shown) starts no gap', async () => {
    const t = makeAds();
    t.fake.state.next = { shown: false, error: 'no_fill' };
    expect(await t.ads.showRewarded('revive')).toBe('unavailable');
    expect(t.ads.canOffer('revive')).toBe(true);
    expect(t.ads.counters.lastAnyAdAt).toBe(0);
  });

  it('at most 2 ads are put in front of the player per run; a dismissed one counts, beginRun resets', async () => {
    const t = makeAds();
    t.ads.beginRun();
    t.fake.state.next = { shown: true, rewarded: false };
    expect(await t.ads.showRewarded('revive')).toBe('dismissed');
    t.clock.advance(GAP);
    t.fake.state.next = { shown: true, rewarded: true };
    expect(await t.ads.showRewarded('relic_reroll')).toBe('rewarded');
    t.clock.advance(GAP);
    expect(t.ads.status('result_double')).toMatchObject({ canOffer: false, reason: 'offer_cap' });
    expect(await t.ads.showRewarded('result_double')).toBe('capped');
    expect(t.fake.log.filter((l) => l === 'show:rewarded:result_double')).toHaveLength(0);
    t.ads.beginRun();
    expect(t.ads.canOffer('result_double')).toBe(true);
    // the dismissed revive was never counted as a reward
    expect(t.ads.counters.daily.revive).toBeUndefined();
  });

  it('home offers made between runs never use up the per-run offer budget', async () => {
    const t = makeAds(); // runsBegun 2, no run in progress: the player is on the home screen
    for (const p of ['daily_treat', 'free_chest', 'patrol_double']) {
      expect(t.ads.canOffer(p), p).toBe(true);
      expect(await t.ads.showRewarded(p)).toBe('rewarded');
      t.clock.advance(GAP);
    }
    // three offers taken, the budget is untouched: the next ones are limited only by their own daily caps
    expect(t.ads.status('shop_refresh')).toMatchObject({ canOffer: true, reason: 'ok' });
    expect(t.ads.status('patrol_double')).toMatchObject({ canOffer: true, reason: 'ok', dailyLeft: 2 });
  });

  it('a run still stops after 2 offers, and the home offers stay open next to an exhausted run', async () => {
    const t = makeAds();
    t.ads.beginRun();
    expect(await t.ads.showRewarded('revive')).toBe('rewarded');
    t.clock.advance(GAP);
    expect(await t.ads.showRewarded('result_double')).toBe('rewarded');
    t.clock.advance(GAP);
    expect(t.ads.status('relic_reroll')).toMatchObject({ canOffer: false, reason: 'offer_cap' });
    expect(t.ads.status('free_chest')).toMatchObject({ canOffer: true, reason: 'ok' });
    expect(await t.ads.showRewarded('free_chest')).toBe('rewarded');
    t.clock.advance(GAP);
    expect(t.ads.status('relic_reroll')).toMatchObject({ canOffer: false, reason: 'offer_cap' }); // the home ad did not reopen it
  });

  it('at most 12 rewarded ads a day; the next local date resets it', async () => {
    const t = makeAds();
    for (let i = 0; i < 12; i++) expect(await watch(t, 'revive')).toBe('rewarded');
    expect(t.ads.counters.adsToday).toBe(12);
    t.ads.beginRun();
    expect(t.ads.status('revive')).toMatchObject({ canOffer: false, reason: 'day_cap' });
    expect(await t.ads.showRewarded('revive')).toBe('capped');
    expect(t.fake.log.filter((l) => l === 'show:rewarded:revive')).toHaveLength(12);
    t.clock.advance(24 * 3600 * 1000);
    expect(t.ads.canOffer('revive')).toBe(true);
  });
});

describe('AdService: first run guard (GDD 8.2: no offer in the first run)', () => {
  it('offers nothing until the second run has begun', async () => {
    const t = makeAds({ skipFtue: false });
    expect(t.ads.canOffer('free_chest')).toBe(false);
    expect(t.ads.status('free_chest').reason).toBe('first_run');
    expect(await t.ads.showRewarded('free_chest')).toBe('unavailable');
    t.ads.beginRun(); // first run
    expect(t.ads.canOffer('pre_run_snack')).toBe(false);
    t.ads.endRun('victory');
    expect(t.ads.canOffer('result_double')).toBe(false); // the first run's result screen still counts as the first run
    t.ads.beginRun(); // second run
    expect(t.ads.canOffer('revive')).toBe(true);
  });

  it('the Butler Pass does not lift it either', async () => {
    const t = makeAds({ skipFtue: false });
    t.ads.setAdFree(true);
    expect(t.ads.canOffer('result_double')).toBe(false);
    expect(await t.ads.showRewarded('result_double')).toBe('unavailable');
  });
});

describe('AdService: ad-free Butler Pass', () => {
  it("pays out result_double, free_chest and patrol_double at once: no ad, no pause, caps still count", async () => {
    const t = makeAds();
    t.ads.setAdFree(true);
    expect(await t.ads.showRewarded('result_double')).toBe('rewarded');
    expect(t.fake.log.filter((l) => l.startsWith('show:'))).toEqual([]);
    expect(t.pauser.calls).toEqual([]);
    expect(await t.ads.showRewarded('result_double')).toBe('capped'); // per-run cap applies
    for (let i = 0; i < 4; i++) expect(await t.ads.showRewarded('free_chest')).toBe('rewarded');
    expect(await t.ads.showRewarded('free_chest')).toBe('capped'); // daily cap applies
    for (let i = 0; i < 3; i++) expect(await t.ads.showRewarded('patrol_double')).toBe('rewarded');
    expect(await t.ads.showRewarded('patrol_double')).toBe('capped');
    t.ads.beginRun();
    expect(await t.ads.showRewarded('result_double')).toBe('rewarded');
  });

  it('rations no ad: no 90 s gap, no offer budget, no part of the 12 a day', async () => {
    const t = makeAds();
    t.ads.setAdFree(true);
    t.ads.beginRun();
    await t.ads.showRewarded('result_double');
    await t.ads.showRewarded('free_chest');
    await t.ads.showRewarded('patrol_double');
    expect(t.ads.counters.adsToday).toBe(0);
    expect(t.ads.counters.lastAnyAdAt).toBe(0);
    // both real ads of the run are still available, immediately
    expect(await t.ads.showRewarded('revive')).toBe('rewarded');
  });

  it('still needs an ad (or gems, in the UI) for revive, pre_run_snack and relic_reroll', async () => {
    const t = makeAds();
    t.ads.setAdFree(true);
    t.ads.beginRun();
    for (const p of ['pre_run_snack', 'revive'] as const) {
      expect(await t.ads.showRewarded(p)).toBe('rewarded');
      t.clock.advance(GAP);
    }
    expect(t.fake.log.filter((l) => l.startsWith('show:rewarded:'))).toEqual(['show:rewarded:pre_run_snack', 'show:rewarded:revive']);
    t.ads.beginRun();
    t.fake.state.available = false;
    expect(t.ads.canOffer('relic_reroll')).toBe(false);
    expect(await t.ads.showRewarded('relic_reroll')).toBe('unavailable');
  });

  it('works for the covered placements where the platform has no rewarded ads / no ad is ready', async () => {
    const t = makeAds({ caps: { rewardedAds: false } });
    t.fake.state.available = false;
    t.ads.setAdFree(true);
    expect(t.ads.canOffer('patrol_double')).toBe(true);
    expect(await t.ads.showRewarded('patrol_double')).toBe('rewarded');
    expect(t.ads.canOffer('revive')).toBe(false);
  });
});

describe('AdService: interstitials end to end', () => {
  const won = (t: Ads): void => {
    t.ads.beginRun();
    t.ads.endRun('victory');
  };

  it('shows one after a win when every condition holds and never when ad-free', async () => {
    const t = makeAds();
    expect(t.ads.canShowInterstitial()).toEqual({ ok: false, why: 'not_after_win' });
    won(t);
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
    won(t);
    expect(t.ads.canShowInterstitial()).toEqual({ ok: false, why: 'gap' });
    t.clock.advance(119_999);
    expect(t.ads.canShowInterstitial()).toEqual({ ok: false, why: 'gap' });
    t.clock.advance(1);
    expect(t.ads.canShowInterstitial()).toEqual({ ok: true });
    expect(await t.ads.showInterstitial('run_end')).toBe(true);
    expect(t.ads.canShowInterstitial()).toEqual({ ok: false, why: 'gap' }); // and an interstitial counts for the next
    // ... and it holds back a rewarded ad for the 90 s rule
    expect(t.ads.status('result_double')).toMatchObject({ canOffer: false, reason: 'gap' });
  });

  it('adds no timer of its own where the SDK manages the frequency (CrazyGames, Poki)', async () => {
    const t = makeAds({ caps: { managesAdFrequency: true } });
    expect(await t.ads.showRewarded('free_chest')).toBe('rewarded');
    won(t);
    expect(t.ads.canShowInterstitial()).toEqual({ ok: true });
    // every other rule still applies
    t.ads.beginRun();
    t.ads.endRun('defeat');
    expect(t.ads.canShowInterstitial()).toEqual({ ok: false, why: 'after_defeat' });
  });

  it('is blocked after a defeat and after an abandoned run, until a win', () => {
    const t = makeAds();
    t.ads.beginRun();
    t.ads.endRun('defeat');
    expect(t.ads.canShowInterstitial()).toEqual({ ok: false, why: 'after_defeat' });
    t.ads.beginRun();
    expect(t.ads.canShowInterstitial()).toEqual({ ok: false, why: 'not_after_win' });
    t.ads.endRun('abandon');
    expect(t.ads.canShowInterstitial()).toEqual({ ok: false, why: 'not_after_win' });
    t.ads.beginRun();
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

  it('is blocked where the platform has no interstitials, none is ready, or a modal is open', async () => {
    const a = makeAds({ caps: { interstitialAds: false } });
    won(a);
    expect(a.ads.canShowInterstitial()).toEqual({ ok: false, why: 'platform' });
    expect(await a.ads.showInterstitial('run_end')).toBe(false);
    expect(a.fake.log.filter((l) => l.startsWith('show:'))).toEqual([]);
    const b = makeAds();
    won(b);
    b.fake.state.available = false;
    expect(b.ads.canShowInterstitial()).toEqual({ ok: false, why: 'unavailable' });
    const c = makeAds();
    won(c);
    c.fake.state.next = () => new Promise(() => undefined);
    void c.ads.showRewarded('revive');
    expect(c.ads.canShowInterstitial()).toEqual({ ok: false, why: 'busy' });
  });

  it('a failed interstitial does not start the 120 s gap and returns false', async () => {
    const t = makeAds();
    won(t);
    t.fake.state.next = { shown: false, error: 'no_fill' };
    expect(await t.ads.showInterstitial('run_end')).toBe(false);
    expect(t.ads.canShowInterstitial()).toEqual({ ok: true });
    expect(t.pauser.depth).toEqual({ paused: 0, muted: 0, blocked: 0 });
  });

  it('re-anchors an ad time in the future (clock moved back) instead of blocking until the clock catches up', async () => {
    const t = makeAds();
    won(t);
    expect(await t.ads.showInterstitial('run_end')).toBe(true);
    t.clock.advance(-3_600_000);
    expect(t.ads.canShowInterstitial()).toEqual({ ok: false, why: 'gap' });
    t.clock.advance(121_000);
    expect(t.ads.canShowInterstitial()).toEqual({ ok: true });
  });
});

describe('AdService: preload and readiness', () => {
  it("preloads a rewarded ad at run start and after every show, per kind with placement '*'", async () => {
    const t = makeAds();
    t.ads.warm();
    expect(t.fake.log).toEqual(['preload:rewarded:*', 'preload:interstitial:*']);
    t.fake.log.length = 0;
    t.ads.beginRun();
    expect(t.fake.log).toEqual(['preload:rewarded:*']);
    t.fake.log.length = 0;
    await t.ads.showRewarded('revive');
    expect(t.fake.log).toEqual(['show:rewarded:revive', 'preload:rewarded:*']);
    t.fake.log.length = 0;
    t.fake.state.next = { shown: false, error: 'no_fill' };
    t.clock.advance(GAP);
    t.ads.beginRun();
    await t.ads.showRewarded('relic_reroll');
    expect(t.fake.log.filter((l) => l.startsWith('preload:'))).toHaveLength(2); // run start + after the failed show
  });

  it('canOffer is false while the platform has no ad ready and never throws or waits', () => {
    const t = makeAds();
    expect(t.ads.canOffer('revive')).toBe(true);
    t.fake.state.available = false;
    expect(t.ads.canOffer('revive')).toBe(false);
    expect(t.ads.status('revive').reason).toBe('unavailable');
    t.fake.adapter.ads.isAvailable = () => {
      throw new Error('sdk exploded');
    };
    expect(t.ads.canOffer('revive')).toBe(false);
    expect(() => t.ads.status('revive')).not.toThrow();
  });

  it('a preload that throws never breaks the flow', async () => {
    const t = makeAds();
    t.fake.adapter.ads.preload = () => {
      throw new Error('preload boom');
    };
    expect(() => t.ads.beginRun()).not.toThrow();
    expect(await t.ads.showRewarded('revive')).toBe('rewarded');
  });
});

describe('AdService: analytics', () => {
  it("emits 'ad_offer' and 'ad_result' with the outcome and the reason", async () => {
    const t = makeAds();
    await t.ads.showRewarded('revive');
    await t.ads.showRewarded('revive');
    const events = t.analytics.buffer();
    expect(events.map((e) => e.event)).toEqual(['ad_offer', 'ad_result', 'ad_offer', 'ad_result']);
    expect(events[1]?.params).toMatchObject({ kind: 'rewarded', placement: 'revive', outcome: 'rewarded' });
    expect(events[3]?.params).toMatchObject({ outcome: 'capped', why: 'run_cap' });
  });

  it('marks pass payouts as ad_free', async () => {
    const t = makeAds();
    t.ads.setAdFree(true);
    await t.ads.showRewarded('result_double');
    await t.ads.showRewarded('revive'); // not covered by the pass: a real ad
    const results = t.analytics.buffer().filter((e) => e.event === 'ad_result');
    expect(results[0]?.params).toMatchObject({ placement: 'result_double', ad_free: true, why: 'ad_free' });
    expect(results[1]?.params).toMatchObject({ placement: 'revive', ad_free: false });
  });
});
