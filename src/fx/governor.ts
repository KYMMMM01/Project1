import { game } from '@/core/game';
import { FX_TIER_ORDER, fxSettings, setFxSettings, type FxTier } from './settings';

export interface GovernorOpts {
  /** Tier to start in. Default 'mid'. */
  start?: FxTier;
  /** Length of the frame-time moving average, in frames. Default 60 (about a second): a crowded wave must show in it before the player has felt it for long. */
  window?: number;
  /** Step down when the average stays above this many ms ... Default 19 (under 53 fps: a 60 Hz screen already drops frames). */
  slowMs?: number;
  /** ... for this many seconds. Default 1.5. */
  slowSeconds?: number;
  /**
   * Step up when the average stays below this many ms ... Default 17.5. A 60 Hz display never
   * delivers frames faster than 16.7 ms, so the guide's 14 ms could only ever fire on 90/120 Hz
   * screens; 17.5 reads "holds the display's 60 fps".
   */
  fastMs?: number;
  /** ... for this many seconds. Default 10. */
  fastSeconds?: number;
  /** A step up also needs this many seconds since the last change (hysteresis). Default 30. */
  upHold?: number;
  /**
   * A step down this soon after a step up proves the higher tier is not sustainable on this device,
   * and the governor stops climbing back into it. Default 3 x upHold.
   */
  retryWindow?: number;
}

/**
 * Adaptive quality governor (guide 6.6): watches an exponential moving average of the frame time and
 * steps the effect tier down one level after sustained slowness and back up after a long stretch of
 * headroom. Pure state machine: feed it real frame times, apply the tier it returns. Starts from a
 * 60 fps reading so a cold start never triggers a downgrade.
 *
 * It cannot oscillate: a step up needs 10 s of headroom and 30 s since the last change, and when the
 * climb is followed by a step down within `retryWindow` that higher tier is struck off for the rest
 * of the session. Every tier pair therefore flips at most once.
 */
export class QualityGovernor {
  tier: FxTier;
  /** Moving average of the frame time in ms. */
  ema = 1000 / 60;
  private readonly k: number;
  private readonly slowMs: number;
  private readonly slowSeconds: number;
  private readonly fastMs: number;
  private readonly fastSeconds: number;
  private readonly upHold: number;
  private readonly retryWindow: number;
  private slowFor = 0;
  private fastFor = 0;
  private sinceChange = 0;
  private sinceUp = Infinity;
  /** Index into FX_TIER_ORDER of the best tier it may still climb to. */
  private best = 0;

  constructor(o: GovernorOpts = {}) {
    this.tier = o.start ?? 'mid';
    this.k = 2 / ((o.window ?? 60) + 1);
    this.slowMs = o.slowMs ?? 19;
    this.slowSeconds = o.slowSeconds ?? 1.5;
    this.fastMs = o.fastMs ?? 17.5;
    this.fastSeconds = o.fastSeconds ?? 10;
    this.upHold = o.upHold ?? 30;
    this.retryWindow = o.retryWindow ?? this.upHold * 3;
  }

  /** The best tier this governor is still willing to climb to. */
  get ceiling(): FxTier {
    return FX_TIER_ORDER[this.best] as FxTier;
  }

  /**
   * Account for one rendered frame.
   * @param seconds real (unscaled) frame time
   * @returns the new tier when this frame changed it, otherwise null
   */
  sample(seconds: number): FxTier | null {
    this.ema += (seconds * 1000 - this.ema) * this.k;
    this.sinceChange += seconds;
    this.sinceUp += seconds;

    this.slowFor = this.ema > this.slowMs ? this.slowFor + seconds : 0;
    this.fastFor = this.ema < this.fastMs ? this.fastFor + seconds : 0;

    const i = FX_TIER_ORDER.indexOf(this.tier);
    if (this.slowFor >= this.slowSeconds && i < FX_TIER_ORDER.length - 1) {
      if (this.sinceUp < this.retryWindow) this.best = i + 1;
      return this.move(FX_TIER_ORDER[i + 1] as FxTier);
    }
    if (this.fastFor >= this.fastSeconds && this.sinceChange >= this.upHold && i > this.best) {
      this.sinceUp = 0;
      return this.move(FX_TIER_ORDER[i - 1] as FxTier);
    }
    return null;
  }

  /** Jump to a tier (restoring a saved choice, a settings screen) and forget everything learnt so far. */
  set(tier: FxTier): void {
    this.move(tier);
    this.best = 0;
    this.sinceUp = Infinity;
  }

  private move(tier: FxTier): FxTier {
    this.tier = tier;
    this.slowFor = this.fastFor = 0;
    this.sinceChange = 0;
    // The old average describes the old tier; judge the new one on its own frames.
    this.ema = 1000 / 60;
    return tier;
  }
}

const STORAGE_KEY = 'fx.tier';

interface TierStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStore(): TierStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Accessing localStorage throws when site data is blocked.
    return null;
  }
}

/** The tier saved by a previous session, or null (none saved, storage blocked or unreadable). */
export function loadFxTier(store: TierStore | null = defaultStore()): FxTier | null {
  try {
    const v = store?.getItem(STORAGE_KEY) ?? null;
    return FX_TIER_ORDER.find((t) => t === v) ?? null;
  } catch {
    return null;
  }
}

export function saveFxTier(tier: FxTier, store: TierStore | null = defaultStore()): void {
  try {
    store?.setItem(STORAGE_KEY, tier);
  } catch {
    // Persisting a quality choice is a convenience, never a requirement.
  }
}

/** A frame this long is a stall (tab switch, background throttling, a GC pause), not load the effects caused. */
const STALL_SECONDS = 0.25;

interface Running {
  governor: QualityGovernor;
  off: () => void;
}

let running: Running | null = null;

/**
 * Start the one game-wide governor (idempotent; every Fx does this on creation). It reads the real
 * frame time from the game loop and writes the result to `fxSettings.tier`, which every Fx picks up
 * on its next update. The tier a device settled in is saved, so the next session starts there.
 * Inert while `fxSettings.autoTier` is false; a tier set by hand meanwhile is adopted, not fought.
 * Stalled frames (over 250 ms, e.g. a throttled background tab) are ignored, not counted as slow.
 */
export function startFxGovernor(opts: GovernorOpts = {}): QualityGovernor {
  if (running) return running.governor;
  if (fxSettings.autoTier) {
    const saved = loadFxTier();
    if (saved) setFxSettings({ tier: saved });
  }
  const governor = new QualityGovernor({ ...opts, start: fxSettings.tier });
  const off = game.onUpdate((dt) => {
    if (!fxSettings.autoTier) return;
    // The game clamps `dt` to 50 ms; the ticker's own delta tells a slow frame from a stalled one.
    const frame = game.app ? game.app.ticker.deltaMS / 1000 : dt;
    if (frame > STALL_SECONDS) return;
    if (governor.tier !== fxSettings.tier) governor.set(fxSettings.tier);
    const next = governor.sample(frame);
    if (next === null) return;
    setFxSettings({ tier: next });
    saveFxTier(next);
  });
  running = { governor, off };
  return governor;
}

export function stopFxGovernor(): void {
  running?.off();
  running = null;
}
