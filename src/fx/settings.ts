/**
 * Global effect switches. Every preset reads these at call time, so a settings screen only has to
 * flip a field. Pure data: no Pixi import, so it is usable from unit tests.
 */
export interface FxSettings {
  /** Multiplies every particle count (stochastic rounding). 0.25 = low-end phone, 1 = full. */
  quality: number;
  /** False removes every full-screen flash (photosensitivity); the colour/shake cues remain. */
  flashes: boolean;
  /** Shortens long motion, softens shake and flashes, stops looping pulses. Defaults to the OS flag. */
  reducedMotion: boolean;
}

/** Multipliers applied when reducedMotion is on (research guide 2.0.6, "Reduced" column). */
export const REDUCED = {
  shake: 0.35,
  flash: 0.35,
  confetti: 0.4,
  time: 0.7,
  hitStopMaxSeconds: 0.05,
} as const;

function systemPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export const fxSettings: FxSettings = {
  quality: 1,
  flashes: true,
  reducedMotion: systemPrefersReducedMotion(),
};

export function setFxSettings(patch: Partial<FxSettings>): void {
  if (patch.quality !== undefined) fxSettings.quality = Math.min(1, Math.max(0, patch.quality));
  if (patch.flashes !== undefined) fxSettings.flashes = patch.flashes;
  if (patch.reducedMotion !== undefined) fxSettings.reducedMotion = patch.reducedMotion;
}

/** Duration helper: long, purely decorative motion shrinks under reducedMotion. */
export function motionSeconds(seconds: number): number {
  return fxSettings.reducedMotion ? seconds * REDUCED.time : seconds;
}
