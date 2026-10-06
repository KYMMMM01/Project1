/** Pure settings maps (no engine imports) so they can be unit tested. */
export type ShakeMode = 'full' | 'reduced' | 'off';

export const SHAKE_MODES: readonly ShakeMode[] = ['full', 'reduced', 'off'];

/** Multiplier on every screen-shake offset: full, the reduced-motion 0.35 of the guide, none. */
export function shakeScaleOf(mode: ShakeMode): number {
  return mode === 'full' ? 1 : mode === 'reduced' ? 0.35 : 0;
}

/** Snap a slider value to the steps the audio buses expose (tenths). */
export function volumeStep(v: number): number {
  return Math.round(Math.min(1, Math.max(0, v)) * 10) / 10;
}
