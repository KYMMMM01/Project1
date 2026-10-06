import { describe, expect, it } from 'vitest';
import {
  AD_PLACEMENTS,
  AD_PLACEMENT_IDS,
  AdLimiter,
  GLOBAL_AD_RULES,
  createMemoryPersistence,
  emptyCounters,
  evaluateInterstitial,
  isAdFreePlacement,
  isPlacement,
  localDateKey,
  normalizeCounters,
  type AdCounters,
  type InterstitialContext,
} from '@/platform/adPolicy';

const at = (y: number, mo: number, d: number, h = 12, mi = 0): number => new Date(y, mo - 1, d, h, mi, 0).getTime();

describe('placement table mirrors docs/기획서_GDD.md section 8.2', () => {
  it('has exactly the documented placements and caps', () => {
    expect(AD_PLACEMENTS).toEqual({
      pre_run_snack: { perRun: 1 },
      revive: { perRun: 1 },
      relic_reroll: { perRun: 1 },
      result_double: { perRun: 1 },
      snack_box: { daily: 3 },
      daily_treat: { daily: 3 },
      free_chest: { daily: 4 },
      patrol_double: { daily: 3 },
      shop_refresh: { daily: 2 },
    });
    expect([...AD_PLACEMENT_IDS].sort()).toEqual(Object.keys(AD_PLACEMENTS).sort());
    expect(isPlacement('revive')).toBe(true);
    expect(isPlacement('double_reward')).toBe(false); // the old id is gone
    expect(isPlacement('toString')).toBe(false);
  });

  it('the global rules are 90 s apart, 2 offers per run, 12 rewarded ads a day', () => {
    expect(GLOBAL_AD_RULES).toEqual({ minGapMs: 90_000, maxOffersPerRun: 2, maxRewardedPerDay: 12 });
  });

  it('the Butler Pass skips the ad for result_double, free_chest and patrol_double only', () => {
    for (const id of AD_PLACEMENT_IDS) {
      expect(isAdFreePlacement(id)).toBe(id === 'result_double' || id === 'free_chest' || id === 'patrol_double');
    }
    // in-run edges stay ad-or-gems even for owners
    for (const id of ['revive', 'pre_run_snack', 'relic_reroll']) expect(isAdFreePlacement(id)).toBe(false);
  });
});

describe('AdLimiter: placement caps', () => {
  it('per-run placements allow one reward per run and reset on beginRun()', () => {
    const l = new AdLimiter(createMemoryPersistence());
    const now = at(2026, 10, 6);
    l.beginRun();
    expect(l.verdict('revive', now, false)).toBe('ok');
    l.recordGrant('revive', now, false);
    expect(l.verdict('revive', now, false)).toBe('run_cap');
    expect(l.verdict('result_double', now, false)).toBe('ok'); // other placements are independent
    l.beginRun();
    expect(l.verdict('revive', now, false)).toBe('ok');
  });

  it('daily placements are capped per local date and not reset by beginRun()', () => {
    const l = new AdLimiter(createMemoryPersistence());
    const now = at(2026, 10, 6);
    for (let i = 0; i < 4; i++) {
      expect(l.verdict('free_chest', now, false)).toBe('ok');
      l.recordGrant('free_chest', now, false);
    }
    expect(l.verdict('free_chest', now, false)).toBe('daily_cap');
    l.beginRun();
    expect(l.verdict('free_chest', now, false)).toBe('daily_cap');
    expect(l.dailyLeft('free_chest', now)).toBe(0);
    expect(l.dailyLeft('patrol_double', now)).toBe(3);
    expect(l.dailyLeft('shop_refresh', now)).toBe(2);
    expect(l.dailyLeft('snack_box', now)).toBe(3);
    expect(l.dailyLeft('daily_treat', now)).toBe(3);
    expect(l.dailyLeft('revive', now)).toBe(Infinity);
    expect(l.perRunLeft('free_chest')).toBe(Infinity);
  });

  it('resets daily counts when the local date rolls forward (also across midnight)', () => {
    const l = new AdLimiter(createMemoryPersistence());
    const late = at(2026, 10, 6, 23, 59);
    for (let i = 0; i < 2; i++) l.recordGrant('shop_refresh', late, true);
    expect(l.verdict('shop_refresh', late, false)).toBe('daily_cap');
    expect(l.counters.adsToday).toBe(2);
    const justAfter = at(2026, 10, 7, 0, 1);
    expect(l.verdict('shop_refresh', justAfter, false)).toBe('ok');
    expect(l.counters.day).toBe(localDateKey(justAfter));
    expect(l.counters.daily).toEqual({});
    expect(l.counters.adsToday).toBe(0);
  });

  it('never refunds when the clock is rolled back to an earlier date', () => {
    const l = new AdLimiter(createMemoryPersistence());
    const today = at(2026, 10, 6);
    for (let i = 0; i < 3; i++) l.recordGrant('patrol_double', today, true);
    expect(l.verdict('patrol_double', today, false)).toBe('daily_cap');
    const yesterday = at(2026, 10, 5);
    expect(l.verdict('patrol_double', yesterday, false)).toBe('daily_cap');
    expect(l.counters.day).toBe(localDateKey(today));
    expect(l.counters.adsToday).toBe(3);
  });

  it('re-checks the day after the counters were swapped (a profile attached later)', () => {
    const l = new AdLimiter(createMemoryPersistence());
    const now = at(2026, 10, 6);
    expect(l.dailyLeft('free_chest', now)).toBe(4); // caches today's window
    const stale = { ...emptyCounters(), day: '2026-10-05', daily: { free_chest: 4 } };
    l.attach({ load: () => stale, save: () => undefined }, 's');
    expect(l.dailyLeft('free_chest', now)).toBe(4); // yesterday's cap does not carry over
    const fresh = { ...emptyCounters(), day: '2026-10-06', daily: { free_chest: 4 } };
    l.attach({ load: () => fresh, save: () => undefined }, 's');
    expect(l.dailyLeft('free_chest', now)).toBe(0);
  });

  it('supports an optional per-placement cooldown', () => {
    const rules = { ...AD_PLACEMENTS, free_chest: { daily: 4, cooldownSec: 60 } };
    const l = new AdLimiter(createMemoryPersistence(), rules);
    const t0 = at(2026, 10, 6);
    l.recordGrant('free_chest', t0, false);
    expect(l.verdict('free_chest', t0 + 59_000, false)).toBe('cooldown');
    expect(l.cooldownMs('free_chest', t0 + 30_000)).toBe(30_000);
    expect(l.verdict('free_chest', t0 + 60_000, false)).toBe('ok');
    // a last-reward time in the future (clock moved back) waits one full cooldown from now, not until the clock catches up
    expect(l.verdict('free_chest', t0 - 3_600_000, false)).toBe('cooldown');
    expect(l.cooldownMs('free_chest', t0 - 3_600_000)).toBe(60_000);
    expect(l.cooldownMs('free_chest', t0 - 3_600_000 + 61_000)).toBe(0);
  });
});

describe('AdLimiter: global rewarded rules', () => {
  const t0 = at(2026, 10, 6);

  it('at most 2 ads per run are put in front of the player; beginRun() resets the budget', () => {
    const l = new AdLimiter(createMemoryPersistence());
    l.beginRun();
    expect(l.offersLeft()).toBe(2);
    l.noteAdShown(t0, 'rewarded');
    expect(l.offersLeft()).toBe(1);
    l.noteAdShown(t0 + 100_000, 'rewarded');
    expect(l.verdict('revive', t0 + 200_000, true)).toBe('offer_cap');
    // interstitials are not "offers"
    l.beginRun();
    l.noteAdShown(t0 + 300_000, 'interstitial');
    expect(l.offersLeft()).toBe(2);
    // a pass owner's ad-free grant is not an ad: it neither needs nor uses the budget
    l.noteAdShown(t0 + 400_000, 'rewarded');
    l.noteAdShown(t0 + 500_000, 'rewarded');
    expect(l.verdict('result_double', t0 + 600_000, false)).toBe('ok');
  });

  it('at most 12 completed rewarded ads a day, reset at local midnight; ad-free grants do not count', () => {
    const l = new AdLimiter(createMemoryPersistence());
    for (let i = 0; i < 11; i++) l.recordGrant('revive', t0, true);
    l.recordGrant('result_double', t0, false); // ad-free grant: no ad was shown
    expect(l.adsLeftToday(t0)).toBe(1);
    l.beginRun();
    expect(l.verdict('relic_reroll', t0 + 200_000, true)).toBe('ok');
    l.recordGrant('relic_reroll', t0 + 200_000, true);
    expect(l.adsLeftToday(t0 + 200_000)).toBe(0);
    l.beginRun();
    expect(l.verdict('pre_run_snack', t0 + 400_000, true)).toBe('day_cap');
    expect(l.verdict('pre_run_snack', t0 + 400_000, false)).toBe('ok');
    expect(l.verdict('pre_run_snack', at(2026, 10, 7, 0, 5), true)).toBe('ok');
  });

  it('keeps 90 s between any two ads, interstitials included, and never blocks a pass grant on it', () => {
    const l = new AdLimiter(createMemoryPersistence());
    expect(l.gapMs(t0)).toBe(0);
    l.noteAdShown(t0, 'interstitial');
    expect(l.gapMs(t0 + 30_000)).toBe(60_000);
    expect(l.verdict('free_chest', t0 + 89_999, true)).toBe('gap');
    expect(l.verdict('free_chest', t0 + 89_999, false)).toBe('ok');
    expect(l.verdict('free_chest', t0 + 90_000, true)).toBe('ok');
    // clock moved back: the stored time is re-anchored, the wait is one normal gap
    expect(l.gapMs(t0 - 5_000_000)).toBe(90_000);
    expect(l.gapMs(t0 - 5_000_000 + 91_000)).toBe(0);
  });

  it('checks the placement caps before the global ones', () => {
    const l = new AdLimiter(createMemoryPersistence());
    l.beginRun();
    l.recordGrant('revive', t0, true);
    l.noteAdShown(t0, 'rewarded');
    expect(l.verdict('revive', t0 + 1, true)).toBe('run_cap');
  });
});

describe('AdLimiter: persistence', () => {
  it('saves through the injected persistence and reads back from it', () => {
    const saves: AdCounters[] = [];
    let stored = emptyCounters();
    const p = {
      load: () => stored,
      save: (c: AdCounters) => {
        stored = JSON.parse(JSON.stringify(c)) as AdCounters;
        saves.push(stored);
      },
    };
    const l = new AdLimiter(p);
    l.beginRun();
    l.recordGrant('free_chest', at(2026, 10, 6), true);
    expect(saves.length).toBeGreaterThan(0);
    const l2 = new AdLimiter(p);
    expect(l2.counters.runsBegun).toBe(1);
    expect(l2.counters.daily.free_chest).toBe(1);
    expect(l2.counters.adsToday).toBe(1);
  });

  it('bumps the session count once per session id, however often it is attached', () => {
    const p = createMemoryPersistence();
    const l = new AdLimiter(p);
    l.attach(p, 'a');
    l.attach(p, 'a');
    expect(l.counters.sessions).toBe(1);
    l.attach(p, 'b'); // next app launch
    expect(l.counters.sessions).toBe(2);
  });

  it('normalizeCounters survives garbage from a profile and counters saved before adsToday existed', () => {
    expect(normalizeCounters(null)).toEqual(emptyCounters());
    expect(normalizeCounters('x')).toEqual(emptyCounters());
    const c = normalizeCounters({ day: 5, daily: { a: -1, b: 2, c: 'x' }, runsBegun: -3, sessions: 2.7, adsToday: 'many' });
    expect(c.day).toBe('');
    expect(c.daily).toEqual({ b: 2 });
    expect(c.runsBegun).toBe(0);
    expect(c.sessions).toBe(2);
    expect(c.adsToday).toBe(0);
    expect(normalizeCounters({ v: 1, day: '2026-10-06', daily: {}, last: {}, lastAnyAdAt: 0 }).adsToday).toBe(0);
  });
});

describe('interstitial policy matrix', () => {
  const base: InterstitialContext = {
    now: 1_000_000,
    sessions: 2,
    runsCompleted: 3,
    lastAnyAdAt: 0,
    lastRunResult: 'victory',
    adFree: false,
    platformSupports: true,
    platformThrottles: false,
    busy: false,
    platformReady: true,
  };
  const verdict = (o: Partial<InterstitialContext>) => evaluateInterstitial({ ...base, ...o });

  it('allows the clean case', () => {
    expect(verdict({})).toEqual({ ok: true });
  });

  it.each([
    ['platform without interstitials (store / Toss build)', { platformSupports: false }, 'platform'],
    ['ad-free owner', { adFree: true }, 'ad_free'],
    ['first session', { sessions: 1 }, 'first_session'],
    ['before the 3rd completed run (0)', { runsCompleted: 0 }, 'few_runs'],
    ['before the 3rd completed run (2)', { runsCompleted: 2 }, 'few_runs'],
    ['right after a defeat', { lastRunResult: 'defeat' }, 'after_defeat'],
    ['after an abandoned run', { lastRunResult: 'abandon' }, 'not_after_win'],
    ['no run result yet', { lastRunResult: null }, 'not_after_win'],
    ['ad shown 119 s ago', { lastAnyAdAt: 1_000_000 - 119_000 }, 'gap'],
    ['ad shown now', { lastAnyAdAt: 1_000_000 }, 'gap'],
    ['ad time in the future (clock moved back)', { lastAnyAdAt: 1_000_000 + 5_000 }, 'gap'],
    ['an ad or purchase sheet is open', { busy: true }, 'busy'],
    ['platform has no ad ready', { platformReady: false }, 'unavailable'],
  ] as const)('blocks: %s', (_name, patch, why) => {
    expect(verdict(patch)).toEqual({ ok: false, why });
  });

  it('allows exactly at the boundaries', () => {
    expect(verdict({ runsCompleted: 3 }).ok).toBe(true);
    expect(verdict({ lastAnyAdAt: 1_000_000 - 120_000 }).ok).toBe(true);
  });

  it('adds no timer of its own where the SDK throttles interstitials (CrazyGames, Poki)', () => {
    const recent = { lastAnyAdAt: 1_000_000 - 1_000 };
    expect(verdict({ ...recent, platformThrottles: false })).toEqual({ ok: false, why: 'gap' });
    expect(verdict({ ...recent, platformThrottles: true })).toEqual({ ok: true });
    // every other rule still applies there
    expect(verdict({ platformThrottles: true, lastRunResult: 'defeat' })).toEqual({ ok: false, why: 'after_defeat' });
    expect(verdict({ platformThrottles: true, sessions: 1 })).toEqual({ ok: false, why: 'first_session' });
  });

  it('exhaustive matrix: ok only when every condition holds', () => {
    const flags = ['supports', 'notAdFree', 'notFirstSession', 'enoughRuns', 'won', 'gapOk', 'idle', 'ready'] as const;
    for (let mask = 0; mask < 1 << flags.length; mask++) {
      const on = (i: number): boolean => (mask & (1 << i)) !== 0;
      const ctx: InterstitialContext = {
        ...base,
        platformSupports: on(0),
        adFree: !on(1),
        sessions: on(2) ? 2 : 1,
        runsCompleted: on(3) ? 3 : 2,
        lastRunResult: on(4) ? 'victory' : 'defeat',
        lastAnyAdAt: on(5) ? 1_000_000 - 120_000 : 1_000_000 - 1_000,
        busy: !on(6),
        platformReady: on(7),
      };
      expect(evaluateInterstitial(ctx).ok).toBe(mask === (1 << flags.length) - 1);
    }
  });
});
