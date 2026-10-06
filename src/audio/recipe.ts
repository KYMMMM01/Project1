/**
 * Recipe vocabulary: what a sound definition looks like, the loudness targets per category, and a
 * small kit of reusable voices (bell, blip, thump, whoosh...) the individual recipes are built from.
 */
import type { Send, Synth } from './synth';
import type { VoiceRule } from './voices';

/** Loudness tier. Normalisation brings every baked buffer to its tier's target (UI < combat < big). */
export type Cat = 'ui' | 'reward' | 'fire' | 'hit' | 'combat' | 'big' | 'stinger';

export const CAT_TARGET: Record<Cat, { peak: number; rms: number }> = {
  ui: { peak: 0.23, rms: 0.04 },
  reward: { peak: 0.38, rms: 0.06 },
  fire: { peak: 0.2, rms: 0.028 },
  hit: { peak: 0.26, rms: 0.034 },
  combat: { peak: 0.46, rms: 0.075 },
  big: { peak: 0.7, rms: 0.115 },
  stinger: { peak: 0.74, rms: 0.12 },
};

export interface Variant {
  /** Multiplicative jitter around 1 (1 +/- amount) for variants 1+, exactly 1 for variant 0 (the nominal design). */
  j(amount: number): number;
}

export interface Recipe {
  cat: Cat;
  /** Offline render length in seconds, including reverb / echo tails. */
  len: number;
  /** Pre-rendered variants (frequent ids use 3 so repeats do not machine-gun). */
  variants?: number;
  /** Acceptable audible duration range in ms; the quality report flags anything outside it. */
  ms: readonly [number, number];
  /** Low-pass (Hz) applied to the finished render: rapid-fire ids keep hiss out of the 4-8 kHz region. */
  lp?: number;
  /** Extra level in dB on top of the category target, used to order escalating sounds. */
  trim?: number;
  /** Per-play playbackRate randomisation (+/- fraction), for ids heard many times per second. */
  rate?: number;
  rule?: Partial<VoiceRule>;
  build(s: Synth, v: Variant): void;
}

/** Partials above this are dropped: inaudible to most adults and they alias on 44.1 kHz devices. */
const PARTIAL_LIMIT = 16000;

/** Soft glassy bell: a fundamental plus the inharmonic 2.76x / 5.4x partials of a struck bar. */
export function bell(s: Synth, f: number, at: number, dur: number, v = 1, send?: { bus: Send; amt: number }): void {
  s.tone({ f, at, dur, v, a: 0.002, s: 0.01, send });
  if (f * 2.76 < PARTIAL_LIMIT) s.tone({ f: f * 2.76, at, dur: dur * 0.55, v: v * 0.3, a: 0.002, s: 0.01 });
  if (f * 5.4 < PARTIAL_LIMIT) s.tone({ f: f * 5.4, at, dur: dur * 0.3, v: v * 0.12, a: 0.002, s: 0.01 });
}

/** Warm chime: sine with a quiet octave and twelfth, for friendly (not metallic) rewards. */
export function chime(s: Synth, f: number, at: number, dur: number, v = 1, send?: { bus: Send; amt: number }): void {
  s.tone({ f, at, dur, v, a: 0.003, s: 0.01, send });
  if (f * 2 < PARTIAL_LIMIT) s.tone({ f: f * 2, at, dur: dur * 0.7, v: v * 0.28, a: 0.003, s: 0.01 });
  if (f * 3 < PARTIAL_LIMIT) s.tone({ f: f * 3, at, dur: dur * 0.45, v: v * 0.1, a: 0.003, s: 0.01 });
}

/** Round bright blip (coin / UI note): triangle for body plus a sine an octave up for shine. */
export function blip(s: Synth, f: number, at: number, dur: number, v = 1, f2?: number): void {
  s.tone({ w: 'triangle', f, f2, sw: dur * 0.3, at, dur, v, a: 0.002, s: 0.015 });
  s.tone({ f: f * 2, f2: f2 ? f2 * 2 : undefined, sw: dur * 0.3, at, dur: dur * 0.8, v: v * 0.3, a: 0.002, s: 0.015 });
}

/** Sine drop: the body of thumps, pops and taps. */
export function thump(s: Synth, f0: number, f1: number, at: number, dur: number, v = 1, sw = dur * 0.4, sat = 0): void {
  // `sat` adds odd harmonics so the low drop stays audible on phone speakers that cannot reproduce it.
  s.tone({ f: f0, f2: f1, sw, at, dur, v, a: 0.002, s: 0.004, r: Math.min(0.03, dur * 0.3), sat: sat || undefined });
}

/** Band-passed noise sweep with a smooth swell: whooshes, risers, swishes. */
export function whoosh(
  s: Synth,
  f0: number,
  f1: number,
  at: number,
  dur: number,
  v = 1,
  q = 1.2,
  peakAt = 0.4,
): void {
  s.noise({
    at,
    dur,
    v,
    a: dur * peakAt,
    d: 0,
    s: 1,
    r: dur * (1 - peakAt),
    filter: { t: 'bandpass', f: f0, f2: f1, sw: dur, q },
  });
}

/** Tiny band-passed noise tick: the "touch" transient of clicks, ticks and knocks. */
export function tick(s: Synth, at: number, f: number, dur = 0.012, v = 1, q = 1.5): void {
  s.noise({ at, dur, v, a: 0.001, s: 0.002, r: dur * 0.4, filter: { t: 'bandpass', f, q } });
}

/** Randomly placed high sine twinkles, quantised to a pentatonic set so they stay pretty. */
export function sparkles(
  s: Synth,
  at: number,
  count: number,
  span: number,
  freqs: readonly number[],
  v: number,
  dur = 0.12,
  send?: { bus: Send; amt: number },
): void {
  for (let k = 0; k < count; k++) {
    const t = at + (k / Math.max(1, count - 1)) * span + (s.rand() - 0.5) * (span / count) * 0.6;
    const f = freqs[Math.floor(s.rand() * freqs.length)] as number;
    s.tone({ f, at: Math.max(at, t), dur, v: v * (0.6 + s.rand() * 0.4), a: 0.002, s: 0.01, send });
  }
}
