import { game } from '@/core/game';
import type { FxTier } from './settings';

/** Cheapest last: a step down moves one entry to the right. */
const ORDER: readonly FxTier[] = ['high', 'mid', 'low'];

export interface GovernorOpts {
  /** Tier to start in. Default 'high'. */
  start?: FxTier;
  /** Length of the frame-time moving average, in frames. Default 120. */
  window?: number;
  /** Step down when the average stays above this many ms ... Default 20 (under 50 fps). */
  slowMs?: number;
  /** ... for this many seconds. Default 3. */
  slowSeconds?: number;
  /** Step up when the average stays below this many ms ... Default 14. */
  fastMs?: number;
  /** ... for this many seconds. Default 10. */
  fastSeconds?: number;
  /** A step up also needs this many seconds since the last change (hysteresis). Default 30. */
  upHold?: number;
}

/**
 * Adaptive quality governor (guide 6.6): watches an exponential moving average of the frame time and
 * steps the effect tier down one level after sustained slowness and back up after a long stretch of
 * headroom. Pure state machine: feed it real frame times, apply the tier it returns. Starts from a
 * 60 fps reading so a cold start never triggers a downgrade.
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
  private slowFor = 0;
  private fastFor = 0;
  private sinceChange = 0;

  constructor(o: GovernorOpts = {}) {
    this.tier = o.start ?? 'high';
    this.k = 2 / ((o.window ?? 120) + 1);
    this.slowMs = o.slowMs ?? 20;
    this.slowSeconds = o.slowSeconds ?? 3;
    this.fastMs = o.fastMs ?? 14;
    this.fastSeconds = o.fastSeconds ?? 10;
    this.upHold = o.upHold ?? 30;
  }

  /**
   * Account for one rendered frame.
   * @param seconds real (unscaled) frame time
   * @returns the new tier when this frame changed it, otherwise null
   */
  sample(seconds: number): FxTier | null {
    this.ema += (seconds * 1000 - this.ema) * this.k;
    this.sinceChange += seconds;

    this.slowFor = this.ema > this.slowMs ? this.slowFor + seconds : 0;
    this.fastFor = this.ema < this.fastMs ? this.fastFor + seconds : 0;

    const i = ORDER.indexOf(this.tier);
    if (this.slowFor >= this.slowSeconds && i < ORDER.length - 1) return this.change(ORDER[i + 1] as FxTier);
    if (this.fastFor >= this.fastSeconds && this.sinceChange >= this.upHold && i > 0) return this.change(ORDER[i - 1] as FxTier);
    return null;
  }

  /** Jump to a tier (restoring a saved choice, a settings screen) and restart the hysteresis clocks. */
  set(tier: FxTier): void {
    this.tier = tier;
    this.slowFor = this.fastFor = 0;
    this.sinceChange = 0;
  }

  private change(tier: FxTier): FxTier {
    this.set(tier);
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
    return ORDER.find((t) => t === v) ?? null;
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

export interface BoundGovernor {
  governor: QualityGovernor;
  dispose: () => void;
}

/**
 * Run a governor off the game loop. `apply` receives the starting tier (the saved one, if any) once
 * and then every change, so wire it to Fx.applyTier (and, if you like, the renderer resolution).
 * Changes are saved to localStorage so the next session starts in the tier this device settled in.
 */
export function bindQualityGovernor(apply: (tier: FxTier) => void, opts: GovernorOpts = {}): BoundGovernor {
  const governor = new QualityGovernor({ ...opts, start: loadFxTier() ?? opts.start });
  apply(governor.tier);
  const off = game.onUpdate((dt) => {
    const next = governor.sample(dt);
    if (next === null) return;
    saveFxTier(next);
    apply(next);
  });
  return { governor, dispose: off };
}
