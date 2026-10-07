/**
 * Global effect switches. Every preset reads these at call time, so a settings screen only has to
 * flip a field. Pure data: no Pixi import, so it is usable from unit tests.
 */
/** Damage-number density (guide 3.8): everything, only crits / big values / damage taken, or none. */
export type NumbersMode = 'off' | 'brief' | 'full';

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
  /** Which floating numbers are shown. 'brief' keeps only the important ones (priority 2+). */
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
  numbers: 'full',
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
