/**
 * Global effect switches. Every preset reads these at call time, so a settings screen only has to
 * flip a field. Pure data: no Pixi import, so it is usable from unit tests.
 */
/** Damage-number level: `brief` (the calm default), `full`, or `off`. What each one shows is `NUMBER_LEVELS`. */
export type NumbersMode = 'off' | 'brief' | 'full';

/**
 * What a damage-number level shows. Every level obeys the placement rules (a number never sits on an enemy, a cat or the HUD) and
 * the crowd rule (a budget per screen region and per frame, the larger numbers first); the levels only change how much they allow.
 * Shares are of the target's full health, summed over one merge window (about 0.3 s) of hits on it.
 */
export interface NumberLevel {
  /** The smallest merged hit worth a number on an ordinary enemy, and on an elite or a boss. */
  hitShare: number;
  heavyShare: number;
  /** The smallest damage-over-time tick worth a number (burn, poison, bleed); Infinity = never. */
  tickShare: number;
  /** Whether what a shield soaked gets a number. */
  soak: boolean;
  /** Whether heals and gold get one. */
  extras: boolean;
  /** Ordinary numbers alive in one screen region and on the whole screen, and new ones accepted per frame. */
  plainRegion: number;
  plainAll: number;
  plainFrame: number;
  /** The same for the big numbers (a crit, a killing blow, a boss's heavy hit, damage taken). */
  bigRegion: number;
  bigAll: number;
  bigFrame: number;
}

export const NUMBER_LEVELS: Readonly<Record<NumbersMode, NumberLevel>> = {
  off: { hitShare: Infinity, heavyShare: Infinity, tickShare: Infinity, soak: false, extras: false, plainRegion: 0, plainAll: 0, plainFrame: 0, bigRegion: 0, bigAll: 0, bigFrame: 0 },
  brief: { hitShare: 0.06, heavyShare: 0.01, tickShare: Infinity, soak: false, extras: false, plainRegion: 1, plainAll: 4, plainFrame: 1, bigRegion: 1, bigAll: 3, bigFrame: 2 },
  full: { hitShare: 0, heavyShare: 0, tickShare: 0.02, soak: true, extras: true, plainRegion: 2, plainAll: 8, plainFrame: 2, bigRegion: 2, bigAll: 5, bigFrame: 3 },
};

/** Device quality tier (guide 6.2). The governor moves between them; a settings screen may pin one. */
export type FxTier = 'high' | 'mid' | 'low';

export interface FxSettings {
  /** Device tier: live-particle and floating-number caps plus how much the big set-pieces emit. */
  tier: FxTier;
  /** Let the frame-time governor move `tier` by itself (and remember where the device settled). */
  autoTier: boolean;
  /** Player-facing multiplier on every particle count (stochastic rounding). 1 = as designed. */
  quality: number;
  /** False removes every full-screen flash (photosensitivity); the colour/shake cues remain. */
  flashes: boolean;
  /** Shortens long motion, softens shake and flashes, stops looping pulses. Defaults to the OS flag. */
  reducedMotion: boolean;
  /** Which floating numbers are shown (`NUMBER_LEVELS`). */
  numbers: NumbersMode;
}

/** Multipliers applied when reducedMotion is on (research guide 2.0.6, "Reduced" column). */
export const REDUCED = {
  shake: 0.35,
  flash: 0.35,
  confetti: 0.4,
  time: 0.7,
  hitStopMaxSeconds: 0.05,
} as const;

export interface FxTierSpec {
  /** Live particles allowed at once. */
  particles: number;
  /** Floating numbers allowed at once. */
  numbers: number;
  /** Count multiplier for big set-pieces (priority 2+ bursts) and looping emitters (guide 6.2 "cut-in particle multiplier"). */
  scale: number;
  /** Screen shake multiplier (guide 6.2: Low shakes at 0.7). */
  shake: number;
}

/** Budgets decided for the product: High 400 / 40, Mid (default) 250 / 24, Low 120 / 12. */
export const FX_TIERS: Readonly<Record<FxTier, FxTierSpec>> = {
  high: { particles: 400, numbers: 40, scale: 1, shake: 1 },
  mid: { particles: 250, numbers: 24, scale: 0.7, shake: 1 },
  low: { particles: 120, numbers: 12, scale: 0.4, shake: 0.7 },
};

/** Best first; a governor step down moves one entry to the right. */
export const FX_TIER_ORDER: readonly FxTier[] = ['high', 'mid', 'low'];

export const fxSettings: FxSettings = {
  tier: 'mid',
  autoTier: true,
  quality: 1,
  flashes: true,
  reducedMotion: false,
  numbers: 'brief',
};

const tierListeners = new Set<(tier: FxTier) => void>();

/**
 * Be told whenever the tier changes, by the governor or by hand: the core can lower the renderer
 * resolution on 'low' (guide 6.6 lists it before the effect budgets), a settings screen can refresh.
 * Returns the unsubscribe function.
 */
export function onFxTierChange(fn: (tier: FxTier) => void): () => void {
  tierListeners.add(fn);
  return () => void tierListeners.delete(fn);
}

export function setFxSettings(patch: Partial<FxSettings>): void {
  if (patch.tier !== undefined && FX_TIERS[patch.tier] !== undefined && patch.tier !== fxSettings.tier) {
    fxSettings.tier = patch.tier;
    for (const fn of tierListeners) fn(patch.tier);
  }
  if (patch.autoTier !== undefined) fxSettings.autoTier = patch.autoTier;
  if (patch.quality !== undefined) fxSettings.quality = Math.min(1, Math.max(0, patch.quality));
  if (patch.flashes !== undefined) fxSettings.flashes = patch.flashes;
  if (patch.reducedMotion !== undefined) fxSettings.reducedMotion = patch.reducedMotion;
  if (patch.numbers !== undefined) fxSettings.numbers = patch.numbers;
}

/** Duration helper: long, purely decorative motion shrinks under reducedMotion. */
export function motionSeconds(seconds: number): number {
  return fxSettings.reducedMotion ? seconds * REDUCED.time : seconds;
}

/** Set-piece count multiplier of the current tier. */
export function tierScale(): number {
  return FX_TIERS[fxSettings.tier].scale;
}

/**
 * Count multiplier for a burst of priority `prio`: the player's quality setting, and for priority 2+
 * (crits, merges, reveals, boss moments) also the tier. Small priority 0-1 hits keep their full
 * count on every tier; the tier's particle cap and the priority fill limits throttle them instead.
 */
export function countScale(prio: number): number {
  return prio >= 2 ? fxSettings.quality * tierScale() : fxSettings.quality;
}
