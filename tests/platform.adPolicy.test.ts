import { describe, expect, it } from 'vitest';
import {
  AD_PLACEMENTS,
  AdLimiter,
  INTERSTITIAL_RULES,
  createMemoryPersistence,
  emptyCounters,
  evaluateInterstitial,
  localDateKey,
  normalizeCounters,
  type AdCounters,
  type InterstitialContext,
} from '@/platform/adPolicy';

const at = (y: number, mo: number, d: number, h = 12, mi = 0): number => new Date(y, mo - 1, d, h, mi, 0).getTime();

describe('placement table mirrors docs/명세_메타.md section 8', () => {
  it('has exactly the documented caps', () => {
    expect(AD_PLACEMENTS).toEqual({
      revive: { perRun: 1 },
      double_reward: { perRun: 1 },
      relic_reroll: { perRun: 1 },
      start_boost: { perRun: 1 },
      free_chest: { daily: 4 },
      patrol_double: { daily: 3 },
      shop_refresh: { daily: 2 },
    });
  });
});

describe('AdLimiter: caps', () => {
  it('per-run placements allow one reward per run and reset on beginRun()', () => {
    const l = new AdLimiter(createMemoryPersistence());
    const now = at(2026, 10, 6);
    l.beginRun();
    expect(l.check('revive', now)).toBe('ok');
    l.recordGrant('revive', now);
    expect(l.check('revive', now)).toBe('run_cap');
    expect(l.check('double_reward', now)).toBe('ok'); // other placements are independent
    l.beginRun();
    expect(l.check('revive', now)).toBe('ok');
  });

  it('daily placements are capped per local date and not reset by beginRun()', () => {
    const l = new AdLimiter(createMemoryPersistence());
    const now = at(2026, 10, 6);
    for (let i = 0; i < 4; i++) {
      expect(l.check('free_chest', now)).toBe('ok');
      l.recordGrant('free_chest', now);
    }
    expect(l.check('free_chest', now)).toBe('daily_cap');
    l.beginRun();
    expect(l.check('free_chest', now)).toBe('daily_cap');
    expect(l.remaining('free_chest', now).daily).toBe(0);
    expect(l.remaining('patrol_double', now).daily).toBe(3);
    expect(l.remaining('shop_refresh', now).daily).toBe(2);
  });

  it('resets daily counts when the local date rolls forward (also across midnight)', () => {
    const l = new AdLimiter(createMemoryPersistence());
    const late = at(2026, 10, 6, 23, 59);
    for (let i = 0; i < 2; i++) l.recordGrant('shop_refresh', late);
    expect(l.check('shop_refresh', late)).toBe('daily_cap');
    const justAfter = at(2026, 10, 7, 0, 1);
    expect(l.check('shop_refresh', justAfter)).toBe('ok');
    expect(l.counters.day).toBe(localDateKey(justAfter));
    expect(l.counters.daily).toEqual({});
  });

  it('never refunds when the clock is rolled back to an earlier date', () => {
    const l = new AdLimiter(createMemoryPersistence());
    const today = at(2026, 10, 6);
    for (let i = 0; i < 3; i++) l.recordGrant('patrol_double', today);
    expect(l.check('patrol_double', today)).toBe('daily_cap');
    const yesterday = at(2026, 10, 5);
    expect(l.check('patrol_double', yesterday)).toBe('daily_cap');
    expect(l.counters.day).toBe(localDateKey(today));
  });

  it('supports an optional per-placement cooldown', () => {
    const rules = { ...AD_PLACEMENTS, free_chest: { daily: 4, cooldownSec: 60 } };
    const l = new AdLimiter(createMemoryPersistence(), rules);
    const t0 = at(2026, 10, 6);
    l.recordGrant('free_chest', t0);
    expect(l.check('free_chest', t0 + 59_000)).toBe('cooldown');
    expect(l.remaining('free_chest', t0 + 30_000).cooldownMs).toBe(30_000);
    expect(l.check('free_chest', t0 + 60_000)).toBe('ok');
    // a last-reward time in the future (clock moved back) waits one full cooldown from now
    expect(l.check('free_chest', t0 - 3_600_000)).toBe('cooldown');
    expect(l.remaining('free_chest', t0 - 3_600_000).cooldownMs).toBe(60_000);
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
    l.recordGrant('free_chest', at(2026, 10, 6));
    expect(saves.length).toBeGreaterThan(0);
    const l2 = new AdLimiter(p);
    expect(l2.counters.runsBegun).toBe(1);
    expect(l2.counters.daily.free_chest).toBe(1);
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

  it('normalizeCounters survives garbage from a profile', () => {
    expect(normalizeCounters(null)).toEqual(emptyCounters());
    expect(normalizeCounters('x')).toEqual(emptyCounters());
    const c = normalizeCounters({ day: 5, daily: { a: -1, b: 2, c: 'x' }, runsBegun: -3, sessions: 2.7 });
    expect(c.day).toBe('');
    expect(c.daily).toEqual({ b: 2 });
    expect(c.runsBegun).toBe(0);
    expect(c.sessions).toBe(2);
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
    platformReady: true,
    shownThisSession: 0,
  };
  const verdict = (o: Partial<InterstitialContext>) => evaluateInterstitial({ ...base, ...o });

  it('allows the clean case', () => {
    expect(verdict({})).toEqual({ ok: true });
  });

  it.each([
    ['platform without interstitials', { platformSupports: false }, 'platform'],
    ['ad-free owner', { adFree: true }, 'ad_free'],
    ['first session', { sessions: 1 }, 'first_session'],
    ['before the 3rd completed run (0)', { runsCompleted: 0 }, 'few_runs'],
    ['before the 3rd completed run (2)', { runsCompleted: 2 }, 'few_runs'],
    ['right after a defeat', { lastRunResult: 'defeat' }, 'after_defeat'],
    ['ad shown 119 s ago', { lastAnyAdAt: 1_000_000 - 119_000 }, 'gap'],
    ['ad shown now', { lastAnyAdAt: 1_000_000 }, 'gap'],
    ['ad time in the future (clock moved back)', { lastAnyAdAt: 1_000_000 + 5_000 }, 'gap'],
    ['platform has no ad ready', { platformReady: false }, 'unavailable'],
  ] as const)('blocks: %s', (_name, patch, why) => {
    expect(verdict(patch)).toEqual({ ok: false, why });
  });

  it('allows exactly at the boundaries', () => {
    expect(verdict({ runsCompleted: 3 }).ok).toBe(true);
    expect(verdict({ lastAnyAdAt: 1_000_000 - 120_000 }).ok).toBe(true);
    expect(verdict({ lastRunResult: null }).ok).toBe(true);
    expect(verdict({ lastRunResult: 'abandon' }).ok).toBe(true);
  });

  it('honours an optional session cap', () => {
    const rules = { ...INTERSTITIAL_RULES, maxPerSession: 2 };
    expect(evaluateInterstitial({ ...base, shownThisSession: 1 }, rules).ok).toBe(true);
    expect(evaluateInterstitial({ ...base, shownThisSession: 2 }, rules)).toEqual({ ok: false, why: 'session_cap' });
  });

  it('exhaustive matrix: ok only when every condition holds', () => {
    const flags = ['supports', 'notAdFree', 'notFirstSession', 'enoughRuns', 'notDefeat', 'gapOk', 'ready'] as const;
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
        platformReady: on(6),
      };
      expect(evaluateInterstitial(ctx).ok).toBe(mask === (1 << flags.length) - 1);
    }
  });
});
