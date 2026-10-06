/**
 * Ad policy: the per-placement table from docs/명세_메타.md section 8, the counters behind it, and
 * the interstitial policy. Everything here is pure (no DOM, no SDK, no timers) so it is unit-testable
 * in node. AdService wires it to a platform adapter.
 */
import type { RunResult } from './types';

export interface PlacementRule {
  /** Max rewards per run; reset by beginRun(). */
  perRun?: number;
  /** Max rewards per local calendar day. */
  daily?: number;
  /** Minimum seconds between two rewards on this placement. */
  cooldownSec?: number;
}

export const AD_PLACEMENT_IDS = [
  'revive',
  'double_reward',
  'relic_reroll',
  'start_boost',
  'free_chest',
  'patrol_double',
  'shop_refresh',
] as const;

export type AdPlacementId = (typeof AD_PLACEMENT_IDS)[number];

/** Mirrors docs/명세_메타.md section 8 ("하루 상한 / 쿨다운" table). `--` cells are simply absent. */
export const AD_PLACEMENTS: Readonly<Record<AdPlacementId, Readonly<PlacementRule>>> = {
  revive: { perRun: 1 },
  double_reward: { perRun: 1 },
  relic_reroll: { perRun: 1 },
  start_boost: { perRun: 1 },
  free_chest: { daily: 4 },
  patrol_double: { daily: 3 },
  shop_refresh: { daily: 2 },
};

export function isPlacement(id: string): id is AdPlacementId {
  return Object.prototype.hasOwnProperty.call(AD_PLACEMENTS, id);
}

/** Rewarded offers (docs/명세_메타.md section 8: "첫 판에는 어떤 광고 제안도 보이지 않는다"). */
export const REWARDED_RULES = {
  /** The player must have started this many runs: offers begin with the second run. */
  minRunsBegun: 2,
} as const;

/** Interstitial policy (GDD 8.2, research B-2). */
export const INTERSTITIAL_RULES = {
  /** Completed (victory or defeat) runs required first. */
  minRunsCompleted: 3,
  /** Minimum gap since the last ad of ANY kind. */
  minGapMs: 120_000,
  /**
   * Per-session cap. research B-2 suggests 2-3; portal SDKs already throttle themselves, so this is
   * unlimited by default and exists as a knob.
   */
  maxPerSession: Number.POSITIVE_INFINITY,
} as const;

export interface AdCounters {
  v: 1;
  /** Local date 'YYYY-MM-DD' the `daily` counts belong to. */
  day: string;
  /** Rewards granted today, by placement. */
  daily: Record<string, number>;
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

export type LimitVerdict = 'ok' | 'run_cap' | 'daily_cap' | 'cooldown';

export interface LimitRemaining {
  /** Rewards left this run (Infinity when the placement has no per-run limit). */
  perRun: number;
  /** Rewards left today (Infinity when unlimited). */
  daily: number;
  /** ms until the cooldown ends (0 = none). */
  cooldownMs: number;
}

/**
 * Per-placement caps, per-run reset, daily rollover and cooldowns, on top of an injected persistence.
 * Daily rollover only moves FORWARD: a clock rolled back to an earlier date never refunds the caps
 * (docs/명세_메타.md section 9).
 */
export class AdLimiter {
  counters: AdCounters;
  private persistence: AdPersistence;
  private run: Record<string, number> = {};

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
    const today = localDateKey(now);
    if (today > this.counters.day) {
      this.counters.day = today;
      this.counters.daily = {};
      this.save();
    }
  }

  beginRun(): void {
    this.run = {};
    this.counters.runsBegun += 1;
    this.save();
  }

  completeRun(): void {
    this.counters.runsCompleted += 1;
    this.save();
  }

  private rule(id: string): Readonly<PlacementRule> {
    return this.rules[id] ?? {};
  }

  remaining(id: string, now: number): LimitRemaining {
    this.rollover(now);
    const rule = this.rule(id);
    const perRun = rule.perRun === undefined ? Infinity : Math.max(0, rule.perRun - (this.run[id] ?? 0));
    const daily = rule.daily === undefined ? Infinity : Math.max(0, rule.daily - (this.counters.daily[id] ?? 0));
    let cooldownMs = 0;
    if (rule.cooldownSec !== undefined) {
      const last = this.counters.last[id];
      if (last !== undefined) {
        // A last-reward time in the future means the clock moved back: wait one full cooldown from now.
        const elapsed = last > now ? 0 : now - last;
        cooldownMs = Math.max(0, rule.cooldownSec * 1000 - elapsed);
      }
    }
    return { perRun, daily, cooldownMs };
  }

  check(id: string, now: number): LimitVerdict {
    const r = this.remaining(id, now);
    if (r.perRun <= 0) return 'run_cap';
    if (r.daily <= 0) return 'daily_cap';
    if (r.cooldownMs > 0) return 'cooldown';
    return 'ok';
  }

  /** Count one granted reward. */
  recordGrant(id: string, now: number): void {
    this.rollover(now);
    this.run[id] = (this.run[id] ?? 0) + 1;
    // Counted for every placement (analytics/QA read them), enforced only where the table sets `daily`.
    this.counters.daily[id] = (this.counters.daily[id] ?? 0) + 1;
    this.counters.last[id] = now;
    this.save();
  }

  /** An ad of any kind was shown (interstitial spacing). */
  noteAdShown(now: number): void {
    this.counters.lastAnyAdAt = now;
    this.save();
  }

  /** Test/QA helper: forget everything except the current session. */
  reset(sessionId: string): void {
    this.run = {};
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
  /** adapter.ads.isAvailable('interstitial', ...) */
  platformReady: boolean;
  /** Interstitials already shown in this session. */
  shownThisSession: number;
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
        | 'gap'
        | 'session_cap'
        | 'unavailable';
    };

/**
 * Interstitial policy. Never: on a platform without them, for an ad-free owner, in the first session,
 * before 3 completed runs, right after a defeat, within 120 s of any other ad, past the session cap.
 */
export function evaluateInterstitial(
  ctx: InterstitialContext,
  rules: { minRunsCompleted: number; minGapMs: number; maxPerSession: number } = INTERSTITIAL_RULES,
): InterstitialVerdict {
  if (!ctx.platformSupports) return { ok: false, why: 'platform' };
  if (ctx.adFree) return { ok: false, why: 'ad_free' };
  if (ctx.sessions <= 1) return { ok: false, why: 'first_session' };
  if (ctx.runsCompleted < rules.minRunsCompleted) return { ok: false, why: 'few_runs' };
  if (ctx.lastRunResult === 'defeat') return { ok: false, why: 'after_defeat' };
  if (ctx.lastAnyAdAt > 0) {
    const gap = ctx.now - ctx.lastAnyAdAt;
    if (gap < rules.minGapMs) return { ok: false, why: 'gap' };
  }
  if (ctx.shownThisSession >= rules.maxPerSession) return { ok: false, why: 'session_cap' };
  if (!ctx.platformReady) return { ok: false, why: 'unavailable' };
  return { ok: true };
}
