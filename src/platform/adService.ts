/**
 * AdService: the only thing gameplay code talks to for ads.
 *
 *  - pauses the game and mutes audio before an ad and restores both in `finally` (plus a 90 s watchdog
 *    for an SDK that never answers);
 *  - grants NOTHING itself: it reports 'rewarded' only on the adapter's completion signal and the caller
 *    pays out;
 *  - enforces per-placement limits (docs/명세_메타.md section 8) and the interstitial policy;
 *  - ad-free owners get 'rewarded' immediately, without an ad, still counted against the caps.
 *
 * Pure with respect to the DOM and to game/audio: those arrive through the injected ModalGate.
 */
import {
  AD_PLACEMENT_IDS,
  AdLimiter,
  INTERSTITIAL_RULES,
  REWARDED_RULES,
  createMemoryPersistence,
  evaluateInterstitial,
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
  | 'busy'
  | 'platform'
  | 'unavailable';

export interface PlacementStatus {
  placement: string;
  canOffer: boolean;
  reason: OfferReason;
  /** Rewards left under the tighter of the per-run and daily limits (Infinity = unlimited). */
  remaining: number;
  perRunLeft: number;
  dailyLeft: number;
  cooldownMs: number;
}

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
  private interstitialsThisSession = 0;

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

  /** The player owns the ad-free pass: rewarded offers pay out at once, interstitials never show. */
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

  /** Start a run: resets every per-run limit. Call when a battle begins. */
  beginRun(): void {
    this.lastRunResult = null;
    this.limiter.beginRun();
  }

  /**
   * End the current run. 'victory' and 'defeat' count as completed runs; 'abandon' does not. A
   * 'defeat' blocks interstitials until the next beginRun().
   */
  endRun(result: RunResult): void {
    this.lastRunResult = result;
    if (result !== 'abandon') this.limiter.completeRun();
  }

  // ----- queries ---------------------------------------------------------------------------

  status(placement: string): PlacementStatus {
    const now = this.now();
    const base = { placement, perRunLeft: Infinity, dailyLeft: Infinity, cooldownMs: 0, remaining: 0 };
    const out = (reason: OfferReason, extra: Partial<PlacementStatus> = {}): PlacementStatus => ({
      ...base,
      ...extra,
      reason,
      canOffer: reason === 'ok',
    });
    if (!isPlacement(placement)) return out('unknown_placement');

    const rem = this.limiter.remaining(placement, now);
    const parts = {
      perRunLeft: rem.perRun,
      dailyLeft: rem.daily,
      cooldownMs: rem.cooldownMs,
      remaining: Math.min(rem.perRun, rem.daily),
    };
    if (this.limiter.counters.runsBegun < REWARDED_RULES.minRunsBegun) return out('first_run', parts);
    if (rem.perRun <= 0) return out('run_cap', parts);
    if (rem.daily <= 0) return out('daily_cap', parts);
    if (rem.cooldownMs > 0) return out('cooldown', parts);
    if (this.deps.modal.busy) return out('busy', parts);
    if (!this.adFreeOwned) {
      const adapter = this.deps.getAdapter();
      if (!adapter.capabilities.rewardedAds) return out('platform', parts);
      if (!safeBool(() => adapter.ads.isAvailable('rewarded', placement))) return out('unavailable', parts);
    }
    return out('ok', parts);
  }

  /** Should the UI show / enable the offer for this placement right now? */
  canOffer(placement: string): boolean {
    return this.status(placement).canOffer;
  }

  /** Rewards left for this placement (the tighter of per-run and daily). Infinity = unlimited. */
  remaining(placement: string): number {
    return this.status(placement).remaining;
  }

  canShowInterstitial(): InterstitialVerdict {
    const now = this.now();
    const c = this.limiter.counters;
    // A last-ad time in the future means the clock moved back: re-anchor to now.
    if (c.lastAnyAdAt > now) this.limiter.noteAdShown(now);
    const adapter = this.deps.getAdapter();
    return evaluateInterstitial(
      {
        now,
        sessions: c.sessions,
        runsCompleted: c.runsCompleted,
        lastAnyAdAt: c.lastAnyAdAt,
        lastRunResult: this.lastRunResult,
        adFree: this.adFreeOwned,
        platformSupports: adapter.capabilities.interstitialAds,
        platformReady: safeBool(() => adapter.ads.isAvailable('interstitial', 'interstitial')),
        shownThisSession: this.interstitialsThisSession,
      },
      INTERSTITIAL_RULES,
    );
  }

  // ----- showing ads -----------------------------------------------------------------------

  /**
   * Offer a rewarded ad. Resolves 'rewarded' only when the adapter reports its completion signal
   * (or, for ad-free owners, immediately). The caller grants the reward; this method never does.
   */
  async showRewarded(placement: string): Promise<RewardedOutcome> {
    const adFree = this.adFreeOwned;
    this.deps.analytics.track('ad_offer', { kind: 'rewarded', placement, ad_free: adFree });
    const outcome = await this.rewardedFlow(placement, adFree);
    return outcome;
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

    const st = this.status(placement);
    if (!st.canOffer) {
      if (st.reason === 'run_cap' || st.reason === 'daily_cap' || st.reason === 'cooldown') {
        return done('capped', st.reason);
      }
      return done('unavailable', st.reason);
    }

    if (adFree) {
      this.limiter.recordGrant(placement, this.now());
      return done('rewarded', 'ad_free');
    }

    const result = await this.runAd('rewarded', placement);
    if (result.shown) this.limiter.noteAdShown(this.now());
    this.safePreload('rewarded', placement);

    if (result.shown && result.rewarded === true) {
      // Count at the moment we report the reward: the caller is about to grant it.
      this.limiter.recordGrant(placement, this.now());
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
    if (result.shown) {
      this.limiter.noteAdShown(this.now());
      this.interstitialsThisSession++;
    }
    this.safePreload('interstitial', reason);
    this.deps.analytics.track('ad_result', {
      kind: 'interstitial',
      placement: reason,
      outcome: result.shown ? 'shown' : 'unavailable',
      why: result.error,
      ms: this.now() - started,
    });
    return result.shown;
  }

  /** Ask the adapter to preload every ad we may need (call once after boot; AdService re-preloads after each ad). */
  warm(): void {
    for (const id of AD_PLACEMENT_IDS) this.safePreload('rewarded', id);
    this.safePreload('interstitial', 'interstitial');
  }

  /** QA: forget counters (keeps the session). */
  resetCounters(): void {
    this.limiter.reset(this.sessionId);
    this.lastRunResult = null;
    this.interstitialsThisSession = 0;
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

  private safePreload(kind: AdKind, placement: string): void {
    try {
      this.deps.getAdapter().ads.preload(kind, placement);
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

function safeBool(fn: () => boolean): boolean {
  try {
    return fn() === true;
  } catch {
    return false;
  }
}
