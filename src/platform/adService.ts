/**
 * AdService: the only thing gameplay code talks to for ads.
 *
 *  - pauses the game and mutes audio before an ad and restores both in `finally` (plus a 90 s watchdog
 *    for an SDK that never answers);
 *  - grants NOTHING itself: it reports 'rewarded' only on the adapter's completion signal and the caller
 *    pays out;
 *  - enforces the per-placement limits and global rules of docs/기획서_GDD.md section 8.2 and the
 *    interstitial policy (adPolicy.ts);
 *  - owners of the ad-free Butler Pass get 'rewarded' immediately, without an ad, for the placements the
 *    pass covers (result_double, free_chest, patrol_double); the placement caps still count;
 *  - keeps a rewarded ad preloaded (run start, after every show) on platforms that need it, and answers
 *    canOffer() false while none is ready.
 *
 * Pure with respect to the DOM and to game/audio: those arrive through the injected ModalGate.
 */
import {
  AdLimiter,
  INTERSTITIAL_RULES,
  REWARDED_RULES,
  createMemoryPersistence,
  evaluateInterstitial,
  isAdFreePlacement,
  isPlacement,
  type AdCounters,
  type AdPersistence,
  type InterstitialVerdict,
} from './adPolicy';
import type { Analytics } from './analytics';
import type { ModalGate } from './modal';
import type { AdKind, AdResult, PlatformAdapter, RunResult } from './types';
import { errorMessage } from './util';

export type RewardedOutcome = 'rewarded' | 'dismissed' | 'unavailable' | 'capped';

export type OfferReason =
  | 'ok'
  | 'unknown_placement'
  | 'first_run'
  | 'run_cap'
  | 'daily_cap'
  | 'cooldown'
  | 'offer_cap'
  | 'day_cap'
  | 'gap'
  | 'busy'
  | 'platform'
  | 'unavailable';

export interface PlacementStatus {
  placement: string;
  canOffer: boolean;
  reason: OfferReason;
  /** Rewards left under the placement's own caps, per run and per day (Infinity = unlimited). The global rules show up in `reason`. */
  remaining: number;
  perRunLeft: number;
  dailyLeft: number;
  /** ms until the placement cooldown or the 90 s gap between ads ends, whichever is later. */
  cooldownMs: number;
}

/** Reasons that mean "a limit was reached" (showRewarded answers 'capped'); every other block is 'unavailable'. */
const CAP_REASONS: ReadonlySet<OfferReason> = new Set<OfferReason>([
  'run_cap',
  'daily_cap',
  'cooldown',
  'offer_cap',
  'day_cap',
  'gap',
]);

export const AD_WATCHDOG_MS = 90_000;

export interface AdServiceDeps {
  getAdapter(): PlatformAdapter;
  modal: ModalGate;
  analytics: Pick<Analytics, 'track'>;
  persistence?: AdPersistence;
  /** Wall clock, epoch ms. */
  now?: () => number;
  watchdogMs?: number;
  /** Identifies this app session for the first-session rule. */
  sessionId?: string;
}

export class AdService {
  private readonly limiter: AdLimiter;
  private readonly now: () => number;
  private readonly watchdogMs: number;
  private readonly sessionId: string;
  private adFreeOwned = false;
  private lastRunResult: RunResult | null = null;

  constructor(private readonly deps: AdServiceDeps) {
    this.now = deps.now ?? Date.now;
    this.watchdogMs = deps.watchdogMs ?? AD_WATCHDOG_MS;
    this.sessionId = deps.sessionId ?? `s${this.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const persistence = deps.persistence ?? createMemoryPersistence();
    this.limiter = new AdLimiter(persistence);
    this.limiter.attach(persistence, this.sessionId);
  }

  // ----- configuration ---------------------------------------------------------------------

  /** Keep counters in another store (the meta layer's profile). Counters are re-read from it. */
  attachPersistence(p: AdPersistence): void {
    this.limiter.attach(p, this.sessionId);
  }

  /**
   * The player owns the ad-free Butler Pass: result_double, free_chest and patrol_double pay out at once
   * (revive, pre_run_snack and relic_reroll still need an ad), interstitials never show.
   */
  setAdFree(owned: boolean): void {
    this.adFreeOwned = owned;
  }

  get adFree(): boolean {
    return this.adFreeOwned;
  }

  /** A modal (ad or purchase sheet) is open right now. */
  get busy(): boolean {
    return this.deps.modal.busy;
  }

  get counters(): Readonly<AdCounters> {
    return this.limiter.counters;
  }

  // ----- run lifecycle ---------------------------------------------------------------------

  /**
   * Start a run: resets every per-run limit and preloads the next rewarded ad. Call when the player
   * taps Start, BEFORE offering pre_run_snack, so the snack counts toward this run's budget.
   */
  beginRun(): void {
    this.lastRunResult = null;
    this.limiter.beginRun();
    this.safePreload('rewarded');
  }

  /**
   * End the current run. 'victory' and 'defeat' count as completed runs; 'abandon' does not. Only a
   * 'victory' opens the door for an interstitial, until the next beginRun().
   */
  endRun(result: RunResult): void {
    this.lastRunResult = result;
    if (result !== 'abandon') this.limiter.completeRun();
  }

  // ----- queries ---------------------------------------------------------------------------

  /** A real ad is shown for this placement (false: the Butler Pass pays out without one). */
  private needsAd(placement: string): boolean {
    return !(this.adFreeOwned && isAdFreePlacement(placement));
  }

  /** Why an offer is blocked, or 'ok'. Allocation-free: UI code may poll it every frame. */
  private reason(placement: string, now: number): OfferReason {
    if (!isPlacement(placement)) return 'unknown_placement';
    if (this.limiter.counters.runsBegun < REWARDED_RULES.minRunsBegun) return 'first_run';
    const needsAd = this.needsAd(placement);
    const verdict = this.limiter.verdict(placement, now, needsAd);
    if (verdict !== 'ok') return verdict;
    if (this.deps.modal.busy) return 'busy';
    if (needsAd) {
      const adapter = this.deps.getAdapter();
      if (!adapter.capabilities.rewardedAds) return 'platform';
      if (!adReady(adapter, 'rewarded', placement)) return 'unavailable';
    }
    return 'ok';
  }

  status(placement: string): PlacementStatus {
    const now = this.now();
    const reason = this.reason(placement, now);
    if (!isPlacement(placement)) {
      return { placement, canOffer: false, reason, remaining: 0, perRunLeft: Infinity, dailyLeft: Infinity, cooldownMs: 0 };
    }
    const needsAd = this.needsAd(placement);
    const perRunLeft = this.limiter.perRunLeft(placement);
    const dailyLeft = this.limiter.dailyLeft(placement, now);
    return {
      placement,
      canOffer: reason === 'ok',
      reason,
      remaining: Math.min(perRunLeft, dailyLeft),
      perRunLeft,
      dailyLeft,
      cooldownMs: Math.max(this.limiter.cooldownMs(placement, now), needsAd ? this.limiter.gapMs(now) : 0),
    };
  }

  /**
   * Should the UI show / enable the offer for this placement right now? False while no ad is ready on
   * platforms that need a preload. Synchronous, never throws, allocation-free.
   */
  canOffer(placement: string): boolean {
    return this.reason(placement, this.now()) === 'ok';
  }

  /** Rewards left for this placement under its own per-run / daily caps. Infinity = unlimited. */
  remaining(placement: string): number {
    return this.status(placement).remaining;
  }

  canShowInterstitial(): InterstitialVerdict {
    const now = this.now();
    const c = this.limiter.counters;
    const adapter = this.deps.getAdapter();
    return evaluateInterstitial(
      {
        now,
        sessions: c.sessions,
        runsCompleted: c.runsCompleted,
        lastAnyAdAt: this.limiter.lastAnyAdAt(now),
        lastRunResult: this.lastRunResult,
        adFree: this.adFreeOwned,
        platformSupports: adapter.capabilities.interstitialAds,
        platformThrottles: adapter.capabilities.managesAdFrequency,
        busy: this.deps.modal.busy,
        platformReady: adReady(adapter, 'interstitial', 'interstitial'),
      },
      INTERSTITIAL_RULES,
    );
  }

  // ----- showing ads -----------------------------------------------------------------------

  /**
   * Offer a rewarded ad. Resolves 'rewarded' only when the adapter reports its completion signal
   * (or, for Butler Pass owners on the covered placements, immediately). The caller grants the reward;
   * this method never does.
   */
  async showRewarded(placement: string): Promise<RewardedOutcome> {
    const adFree = this.adFreeOwned && isAdFreePlacement(placement);
    this.deps.analytics.track('ad_offer', { kind: 'rewarded', placement, ad_free: adFree });
    return this.rewardedFlow(placement, adFree);
  }

  private async rewardedFlow(placement: string, adFree: boolean): Promise<RewardedOutcome> {
    const started = this.now();
    const done = (outcome: RewardedOutcome, why?: string): RewardedOutcome => {
      this.deps.analytics.track('ad_result', {
        kind: 'rewarded',
        placement,
        outcome,
        why,
        ad_free: adFree,
        ms: this.now() - started,
      });
      return outcome;
    };

    const reason = this.reason(placement, started);
    if (reason !== 'ok') return done(CAP_REASONS.has(reason) ? 'capped' : 'unavailable', reason);

    if (adFree) {
      // No ad plays, so no ad is rationed: only the placement's own caps count.
      this.limiter.recordGrant(placement, started, false);
      return done('rewarded', 'ad_free');
    }

    const result = await this.runAd('rewarded', placement);
    if (result.shown) this.limiter.noteAdShown(this.now(), 'rewarded', placement);
    this.safePreload('rewarded');

    if (result.shown && result.rewarded === true) {
      // Count at the moment we report the reward: the caller is about to grant it.
      this.limiter.recordGrant(placement, this.now(), true);
      return done('rewarded');
    }
    if (result.shown) return done('dismissed', result.error);
    return done('unavailable', result.error ?? 'not_shown');
  }

  /**
   * Show an interstitial at a natural break. Resolves true when an ad was actually shown. `reason`
   * names the break (e.g. 'run_end') and is passed to the adapter as the placement.
   */
  async showInterstitial(reason: string): Promise<boolean> {
    this.deps.analytics.track('ad_offer', { kind: 'interstitial', placement: reason, ad_free: this.adFreeOwned });
    const started = this.now();
    const verdict = this.canShowInterstitial();
    if (!verdict.ok) {
      this.deps.analytics.track('ad_result', {
        kind: 'interstitial',
        placement: reason,
        outcome: 'blocked',
        why: verdict.why,
        ms: 0,
      });
      return false;
    }
    const result = await this.runAd('interstitial', reason);
    if (result.shown) this.limiter.noteAdShown(this.now(), 'interstitial');
    this.safePreload('interstitial');
    this.deps.analytics.track('ad_result', {
      kind: 'interstitial',
      placement: reason,
      outcome: result.shown ? 'shown' : 'unavailable',
      why: result.error,
      ms: this.now() - started,
    });
    return result.shown;
  }

  /** Preload both ad kinds (boot calls this once; AdService re-preloads at run start and after every show). */
  warm(): void {
    this.safePreload('rewarded');
    this.safePreload('interstitial');
  }

  /** QA/dev only: set lifetime progress, e.g. { sessions: 2, runsBegun: 2, runsCompleted: 3 } skips the FTUE guards. */
  qaSetProgress(p: Partial<Pick<AdCounters, 'sessions' | 'runsBegun' | 'runsCompleted' | 'lastAnyAdAt'>>): void {
    this.limiter.patch(p);
  }

  /** QA: forget counters (keeps the session). */
  resetCounters(): void {
    this.limiter.reset(this.sessionId);
    this.lastRunResult = null;
  }

  // ----- internals -------------------------------------------------------------------------

  /**
   * One ad request, fenced by the modal gate: pause + mute first, restore in `finally`, 90 s watchdog.
   * Never rejects and never leaves the game paused.
   */
  private async runAd(kind: AdKind, placement: string): Promise<AdResult> {
    const lease = this.deps.modal.acquire(`ad:${kind}:${placement}`);
    if (!lease) return { shown: false, error: 'busy' };
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const adapter = this.deps.getAdapter();
      const request: Promise<AdResult> = Promise.resolve()
        .then(() => adapter.ads.show(kind, placement))
        .then(normalizeResult, (e: unknown) => ({ shown: false, error: errorMessage(e) }));
      const watchdog = new Promise<AdResult>((resolve) => {
        timer = setTimeout(() => resolve({ shown: false, error: 'timeout' }), this.watchdogMs);
      });
      return await Promise.race([request, watchdog]);
    } catch (e) {
      return { shown: false, error: errorMessage(e) };
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      lease.release();
    }
  }

  private safePreload(kind: AdKind): void {
    try {
      this.deps.getAdapter().ads.preload(kind, '*');
    } catch {
      /* preload is best effort */
    }
  }
}

function normalizeResult(r: AdResult | undefined): AdResult {
  if (!r || typeof r !== 'object') return { shown: false, error: 'bad_result' };
  const shown = r.shown === true;
  return { shown, rewarded: shown && r.rewarded === true, error: r.error };
}

/** The adapter's readiness check, which may throw. Written without a closure: canOffer() is polled every frame. */
function adReady(adapter: PlatformAdapter, kind: AdKind, placement: string): boolean {
  try {
    return adapter.ads.isAvailable(kind, placement) === true;
  } catch {
    return false;
  }
}
