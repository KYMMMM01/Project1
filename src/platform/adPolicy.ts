/**
 * Ad policy: the per-placement table (docs/기획서_GDD.md section 8.2, which supersedes the older table in
 * docs/명세_메타.md section 8), the global rules, the counters behind them and the interstitial policy.
 * Everything here is pure (no DOM, no SDK, no timers) so it is unit-testable in node. AdService wires
 * it to a platform adapter.
 */
import type { RunResult } from './types';

export interface PlacementRule {
  /** Max rewards per run; reset by beginRun(). */
  perRun?: number;
  /** Max rewards per local calendar day. */
  daily?: number;
  /** Minimum seconds between two rewards on this placement. */
  cooldownSec?: number;
  /**
   * Offered on the home or a shop screen, between runs (GDD 8.2 "홈", "일일 상점"): the per-run offer
   * budget (GLOBAL_AD_RULES.maxOffersPerRun) neither limits nor counts it.
   */
  home?: boolean;
}

export const AD_PLACEMENT_IDS = [
  'pre_run_snack',
  'revive',
  'relic_reroll',
  'result_double',
  'snack_box',
  'daily_treat',
  'free_chest',
  'patrol_double',
  'shop_refresh',
  'sweep_ticket',
] as const;

export type AdPlacementId = (typeof AD_PLACEMENT_IDS)[number];

/**
 * GDD 8.2 "제한" column. Cells without a limit are simply absent. `sweep_ticket` (the sweep-ticket ad on the
 * stage card, twice a day) is not a GDD 8.2 row: its cap comes from docs/명세_메타.md section 8.
 */
export const AD_PLACEMENTS: Readonly<Record<AdPlacementId, Readonly<PlacementRule>>> = {
  pre_run_snack: { perRun: 1 },
  revive: { perRun: 1 },
  relic_reroll: { perRun: 1 },
  result_double: { perRun: 1 },
  snack_box: { daily: 3 },
  daily_treat: { daily: 3, home: true },
  free_chest: { daily: 4, home: true },
  patrol_double: { daily: 3, home: true },
  shop_refresh: { daily: 2, home: true },
  sweep_ticket: { daily: 2, home: true },
};

/**
 * What the ad-free "Butler Pass" skips the ad for (GDD 8.3): result x2, chest wait skip, patrol x2.
 * revive, pre_run_snack and relic_reroll stay ad-or-gems even for owners: the pass sells no in-run edge.
 */
const AD_FREE_PLACEMENTS: readonly AdPlacementId[] = ['result_double', 'free_chest', 'patrol_double'];

export function isPlacement(id: string): id is AdPlacementId {
  return Object.prototype.hasOwnProperty.call(AD_PLACEMENTS, id);
}

export function isAdFreePlacement(id: string): boolean {
  return (AD_FREE_PLACEMENTS as readonly string[]).includes(id);
}

/** Rewarded offers (GDD 8.2: "첫 판에는 어떤 제안도 없다"). */
export const REWARDED_RULES = {
  /** The player must have started this many runs: offers begin with the second run. */
  minRunsBegun: 2,
} as const;

/** Rules across all rewarded ads that really play (GDD 8.2: "광고 사이 90초 이상, 한 판에 제안은 2개까지, 하루 12회"). */
export const GLOBAL_AD_RULES = {
  /** Minimum gap between any two ads, rewarded or interstitial. */
  minGapMs: 90_000,
  /** Rewarded ads put in front of the player in one run (watched or dismissed; home and shop offers are not part of a run). */
  maxOffersPerRun: 2,
  /** Rewarded ads completed per local day. */
  maxRewardedPerDay: 12,
} as const;

/** Interstitial policy (GDD 8.1/8.2, research 03 section 4.5). */
export const INTERSTITIAL_RULES = {
  /** Completed (victory or defeat) runs required first. */
  minRunsCompleted: 3,
  /** Minimum gap since the last ad of ANY kind (unless the SDK throttles by itself). */
  minGapMs: 120_000,
} as const;

export interface AdCounters {
  v: 1;
  /** Local date 'YYYY-MM-DD' the `daily` counts belong to. */
  day: string;
  /** Rewards granted today, by placement. */
  daily: Record<string, number>;
  /** Rewarded ads completed today (ad-free grants excluded: no ad was shown). */
  adsToday: number;
  /** Epoch ms of the last reward, by placement (cooldowns). */
  last: Record<string, number>;
  /** Epoch ms of the last ad of any kind (0 = never). */
  lastAnyAdAt: number;
  /** App sessions started, this one included. 1 = still the first session. */
  sessions: number;
  /** Id of the session that last bumped `sessions` (so re-attaching in one session never double counts). */
  sessionId: string;
  runsBegun: number;
  runsCompleted: number;
}

/** Where AdService keeps its counters. The meta layer can implement this on top of the profile. */
export interface AdPersistence {
  load(): AdCounters;
  save(counters: AdCounters): void;
}

export function emptyCounters(): AdCounters {
  return {
    v: 1,
    day: '',
    daily: {},
    adsToday: 0,
    last: {},
    lastAnyAdAt: 0,
    sessions: 0,
    sessionId: '',
    runsBegun: 0,
    runsCompleted: 0,
  };
}

function numRecord(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
      if (typeof n === 'number' && Number.isFinite(n) && n >= 0) out[k] = n;
    }
  }
  return out;
}

function nonNeg(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

/** Accept anything a profile might hand back (missing fields, old versions, garbage). */
export function normalizeCounters(raw: unknown): AdCounters {
  const c = emptyCounters();
  if (!raw || typeof raw !== 'object') return c;
  const r = raw as Record<string, unknown>;
  c.day = typeof r.day === 'string' ? r.day : '';
  c.daily = numRecord(r.daily);
  c.adsToday = nonNeg(r.adsToday);
  c.last = numRecord(r.last);
  c.lastAnyAdAt = typeof r.lastAnyAdAt === 'number' && Number.isFinite(r.lastAnyAdAt) ? r.lastAnyAdAt : 0;
  c.sessions = nonNeg(r.sessions);
  c.sessionId = typeof r.sessionId === 'string' ? r.sessionId : '';
  c.runsBegun = nonNeg(r.runsBegun);
  c.runsCompleted = nonNeg(r.runsCompleted);
  return c;
}

/** In-memory persistence (default before the meta layer or platform storage is attached). */
export function createMemoryPersistence(): AdPersistence {
  let c = emptyCounters();
  return {
    load: () => c,
    save: (next) => {
      c = next;
    },
  };
}

/** Local calendar date, 'YYYY-MM-DD'. Daily caps reset when this changes (docs/명세_메타.md section 9). */
export function localDateKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${m < 10 ? '0' : ''}${m}-${day < 10 ? '0' : ''}${day}`;
}

export type LimitVerdict = 'ok' | 'run_cap' | 'daily_cap' | 'cooldown' | 'offer_cap' | 'day_cap' | 'gap';

/**
 * Per-placement caps, global rewarded rules, per-run reset, daily rollover and cooldowns, on top of an
 * injected persistence. Daily rollover only moves FORWARD: a clock rolled back to an earlier date never
 * refunds the caps (docs/명세_메타.md section 9). Every query is allocation-free (UI may poll it).
 */
export class AdLimiter {
  counters: AdCounters;
  private persistence: AdPersistence;
  private run: Record<string, number> = {};
  private runOffers = 0;
  /** Epoch ms window of the local day last checked: queries inside it skip the date work (no allocation). */
  private dayStart = 0;
  private dayEnd = 0;

  constructor(
    persistence: AdPersistence,
    private readonly rules: Readonly<Record<string, Readonly<PlacementRule>>> = AD_PLACEMENTS,
  ) {
    this.persistence = persistence;
    this.counters = normalizeCounters(persistence.load());
  }

  /**
   * Switch to another persistence (the profile). Counters are re-read; `sessions` is bumped once per
   * app session id, so attaching twice in one session does not count twice.
   */
  attach(persistence: AdPersistence, sessionId: string): void {
    this.persistence = persistence;
    this.counters = normalizeCounters(persistence.load());
    this.dayEnd = 0; // the new counters may belong to an older day
    if (this.counters.sessionId !== sessionId) {
      this.counters.sessions += 1;
      this.counters.sessionId = sessionId;
    }
    this.save();
  }

  save(): void {
    try {
      this.persistence.save(this.counters);
    } catch {
      /* a failing profile write must not break the ad flow */
    }
  }

  /** Reset daily counts when the local date moved forward. */
  rollover(now: number): void {
    if (now >= this.dayStart && now < this.dayEnd) return;
    const d = new Date(now);
    this.dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    this.dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
    const today = localDateKey(now);
    if (today > this.counters.day) {
      this.counters.day = today;
      this.counters.daily = {};
      this.counters.adsToday = 0;
      this.save();
    }
  }

  beginRun(): void {
    this.run = {};
    this.runOffers = 0;
    this.counters.runsBegun += 1;
    this.save();
  }

  completeRun(): void {
    this.counters.runsCompleted += 1;
    this.save();
  }

  /** Rewards left this run for the placement (Infinity = no per-run limit). */
  perRunLeft(id: string): number {
    const limit = this.rules[id]?.perRun;
    return limit === undefined ? Infinity : Math.max(0, limit - (this.run[id] ?? 0));
  }

  /** Rewards left today for the placement (Infinity = no daily limit). */
  dailyLeft(id: string, now: number): number {
    this.rollover(now);
    const limit = this.rules[id]?.daily;
    return limit === undefined ? Infinity : Math.max(0, limit - (this.counters.daily[id] ?? 0));
  }

  /** ms until the placement's own cooldown ends (0 = none). */
  cooldownMs(id: string, now: number): number {
    const sec = this.rules[id]?.cooldownSec;
    const last = this.counters.last[id];
    if (sec === undefined || last === undefined) return 0;
    // A last-reward time in the future means the clock moved back: wait one full cooldown from now.
    if (last > now) this.counters.last[id] = now;
    return Math.max(0, sec * 1000 - Math.max(0, now - last));
  }

  /** The placement spends the per-run offer budget (every placement except the home and shop ones). */
  private countsAsRunOffer(id: string): boolean {
    return this.rules[id]?.home !== true;
  }

  /** Rewarded ads that may still be put in front of the player in this run. */
  offersLeft(): number {
    return Math.max(0, GLOBAL_AD_RULES.maxOffersPerRun - this.runOffers);
  }

  /** Rewarded ads that may still complete today. */
  adsLeftToday(now: number): number {
    this.rollover(now);
    return Math.max(0, GLOBAL_AD_RULES.maxRewardedPerDay - this.counters.adsToday);
  }

  /**
   * Epoch ms of the last ad of any kind (0 = never). A timestamp in the future means the clock moved
   * back: it is re-anchored to `now`, so the player waits one normal gap instead of until the clock
   * catches up.
   */
  lastAnyAdAt(now: number): number {
    if (this.counters.lastAnyAdAt > now) this.counters.lastAnyAdAt = now;
    return this.counters.lastAnyAdAt;
  }

  /** ms until another ad of any kind is allowed (the 90 s rule). */
  gapMs(now: number): number {
    const last = this.lastAnyAdAt(now);
    return last <= 0 ? 0 : Math.max(0, GLOBAL_AD_RULES.minGapMs - (now - last));
  }

  /**
   * Why a rewarded offer is blocked, or 'ok'. `needsAd` false (ad-free pass on an eligible placement)
   * skips the global rules: no ad is shown, so nothing is being rationed.
   */
  verdict(id: string, now: number, needsAd: boolean): LimitVerdict {
    if (this.perRunLeft(id) <= 0) return 'run_cap';
    if (this.dailyLeft(id, now) <= 0) return 'daily_cap';
    if (this.cooldownMs(id, now) > 0) return 'cooldown';
    if (!needsAd) return 'ok';
    if (this.countsAsRunOffer(id) && this.offersLeft() <= 0) return 'offer_cap';
    if (this.adsLeftToday(now) <= 0) return 'day_cap';
    if (this.gapMs(now) > 0) return 'gap';
    return 'ok';
  }

  /** Count one granted reward. `viaAd`: a real ad was completed for it (counts toward the daily 12). */
  recordGrant(id: string, now: number, viaAd: boolean): void {
    this.rollover(now);
    this.run[id] = (this.run[id] ?? 0) + 1;
    // Counted for every placement (analytics/QA read them), enforced only where the table sets `daily`.
    this.counters.daily[id] = (this.counters.daily[id] ?? 0) + 1;
    this.counters.last[id] = now;
    if (viaAd) this.counters.adsToday += 1;
    this.save();
  }

  /**
   * An ad was put in front of the player: spacing for every kind, the per-run offer budget for a rewarded
   * one (unless its `placement` is a home or shop offer, which sits outside any run).
   */
  noteAdShown(now: number, kind: 'rewarded' | 'interstitial', placement = ''): void {
    this.counters.lastAnyAdAt = now;
    if (kind === 'rewarded' && this.countsAsRunOffer(placement)) this.runOffers += 1;
    this.save();
  }

  /** QA helper: overwrite lifetime progress counters (skip the first-session / first-run guards). */
  patch(p: Partial<Pick<AdCounters, 'sessions' | 'runsBegun' | 'runsCompleted' | 'lastAnyAdAt'>>): void {
    Object.assign(this.counters, p);
    this.save();
  }

  /** Test/QA helper: forget everything except the current session. */
  reset(sessionId: string): void {
    this.run = {};
    this.runOffers = 0;
    this.dayEnd = 0;
    this.counters = emptyCounters();
    this.counters.sessions = 1;
    this.counters.sessionId = sessionId;
    this.save();
  }
}

export interface InterstitialContext {
  now: number;
  /** AdCounters.sessions: 1 = first session. */
  sessions: number;
  runsCompleted: number;
  /** Epoch ms of the last ad of any kind, 0 = never. */
  lastAnyAdAt: number;
  /** Result of the most recent run until the next beginRun(), or null. */
  lastRunResult: RunResult | null;
  adFree: boolean;
  /** capabilities.interstitialAds */
  platformSupports: boolean;
  /** capabilities.managesAdFrequency: the SDK is the timer, we add none. */
  platformThrottles: boolean;
  /** A modal (ad or purchase sheet) is open right now. */
  busy: boolean;
  /** adapter.ads.isAvailable('interstitial', ...) */
  platformReady: boolean;
}

export type InterstitialVerdict =
  | { ok: true }
  | {
      ok: false;
      why:
        | 'platform'
        | 'ad_free'
        | 'first_session'
        | 'few_runs'
        | 'after_defeat'
        | 'not_after_win'
        | 'gap'
        | 'busy'
        | 'unavailable';
    };

/**
 * Interstitial policy. Only on platforms that sell them (portals), only right after a victory, never in
 * the first session or before 3 completed runs, never to ad-free owners, never within 120 s of any other
 * ad unless the SDK throttles by itself.
 */
export function evaluateInterstitial(
  ctx: InterstitialContext,
  rules: { minRunsCompleted: number; minGapMs: number } = INTERSTITIAL_RULES,
): InterstitialVerdict {
  if (!ctx.platformSupports) return { ok: false, why: 'platform' };
  if (ctx.adFree) return { ok: false, why: 'ad_free' };
  if (ctx.sessions <= 1) return { ok: false, why: 'first_session' };
  if (ctx.runsCompleted < rules.minRunsCompleted) return { ok: false, why: 'few_runs' };
  if (ctx.lastRunResult === 'defeat') return { ok: false, why: 'after_defeat' };
  if (ctx.lastRunResult !== 'victory') return { ok: false, why: 'not_after_win' };
  if (!ctx.platformThrottles && ctx.lastAnyAdAt > 0 && ctx.now - ctx.lastAnyAdAt < rules.minGapMs) {
    return { ok: false, why: 'gap' };
  }
  if (ctx.busy) return { ok: false, why: 'busy' };
  if (!ctx.platformReady) return { ok: false, why: 'unavailable' };
  return { ok: true };
}
