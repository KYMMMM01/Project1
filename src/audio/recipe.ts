/**
 * Recipe vocabulary: what a sound definition looks like, the loudness target of every family, and the
 * kit of material voices the recipes are built from. The game is cut paper on a wooden floor, so a
 * sound is a material: a paper grain (band-passed noise) is a touch, a felt pat is a landing, a wooden
 * knock is a refusal, a rubber stamp is a claim, a sticker pop is a small pitched glide, and notes come
 * from mallets and plucked strings (marimba, kalimba, ukulele), never from raw saw waves.
 */
import type { Send, Synth } from './synth';
import type { VoiceRule } from './voices';

/**
 * Loudness family. Normalisation brings every baked buffer to its family's target: UI is the quietest,
 * shots and hits stay a texture under the rest, rewards and the big battle moments are the loudest.
 */
export type Cat = 'ui' | 'tick' | 'fire' | 'hit' | 'swing' | 'impact' | 'foe' | 'combat' | 'reward' | 'big' | 'finale' | 'stinger';

export const CAT_TARGET: Record<Cat, { peak: number; rms: number }> = {
  ui: { peak: 0.2, rms: 0.034 },
  tick: { peak: 0.24, rms: 0.038 },
  fire: { peak: 0.2, rms: 0.028 },
  hit: { peak: 0.3, rms: 0.04 },
  // The weapon sounds are the heart of the game, so they sit above the UI and the old shots: a release is the lighter half
  // of a pair, the impact the louder, what an enemy is made of sits between, and a boss's last breath is a big moment.
  swing: { peak: 0.22, rms: 0.034 },
  foe: { peak: 0.25, rms: 0.037 },
  impact: { peak: 0.28, rms: 0.042 },
  combat: { peak: 0.4, rms: 0.062 },
  reward: { peak: 0.46, rms: 0.075 },
  finale: { peak: 0.5, rms: 0.08 },
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
  /** Pre-rendered variants (frequent ids use 2 to 3 so repeats do not machine-gun). */
  variants?: number;
  /** Acceptable audible duration range in ms; the quality report flags anything outside it. */
  ms: readonly [number, number];
  /** Low-pass (Hz) applied to the finished render: rapid-fire ids keep hiss out of the 4-8 kHz region. */
  lp?: number;
  /** Extra level in dB on top of the category target, used to order escalating sounds. */
  trim?: number;
  /** Per-play playbackRate randomisation (+/- fraction), for ids heard many times per second. */
  rate?: number;
  /** Highest playStep climb in semitones: noise-based ticks turn shrill when a ladder lifts them two octaves. */
  climb?: number;
  /** Music dip the engine starts together with this sound: the awakening takes the room for a moment. */
  duck?: { depth: number; seconds: number };
  /**
   * Combat voice priority (0 default): when the cap on simultaneous combat voices is full, a sound may take the place of the
   * oldest voice of equal or lower priority, and at 2 and above it also skips the per-window thinning. 1 heavy hits, 2 crits,
   * killing blows and deaths, 3 a boss's death.
   */
  prio?: number;
  rule?: Partial<VoiceRule>;
  build(s: Synth, v: Variant): void;
}

/** Partials above this are dropped: inaudible to most adults and they alias on 44.1 kHz devices. */
const PARTIAL_LIMIT = 16000;

type Wet = { bus: Send; amt: number };

/** Sine drop: the body of pats, thuds and pops. */
export function thump(s: Synth, f0: number, f1: number, at: number, dur: number, v = 1, sw = dur * 0.4, sat = 0): void {
  // `sat` adds odd harmonics so the low drop stays audible on phone speakers that cannot reproduce it.
  s.tone({ f: f0, f2: f1, sw, at, dur, v, a: 0.002, s: 0.004, r: Math.min(0.03, dur * 0.3), sat: sat || undefined });
}

/** Band-passed noise sweep with a smooth swell: a sheet sliding over wood, a page turning, a card passing. */
export function whoosh(s: Synth, f0: number, f1: number, at: number, dur: number, v = 1, q = 0.8, peakAt = 0.4): void {
  // Pink noise falls 3 dB per octave, which is what keeps paper "shff" instead of "tsss"; the high-pass under the band
  // stops its low-end skirt from turning the swish into a rumble that a phone speaker cannot play anyway.
  const filter = [{ t: 'highpass' as const, f: Math.min(f0, f1) * 0.6 }, { t: 'bandpass' as const, f: f0, f2: f1, sw: dur, q }];
  s.noise({ kind: 'pink', at, dur, v, a: dur * peakAt, d: 0, s: 1, r: dur * (1 - peakAt), filter });
}

/** Tiny band-passed noise tick: the "touch" transient of a click, a knock or a mallet. */
export function tick(s: Synth, at: number, f: number, dur = 0.012, v = 1, q = 1.5): void {
  s.noise({ at, dur, v, a: 0.001, s: 0.002, r: dur * 0.4, filter: { t: 'bandpass', f, q } });
}

/** A fingertip on a sheet of paper: a short band-passed noise grain with a 2 ms attack and no pitch. */
export function paper(s: Synth, at: number, f: number, v = 1, dur = 0.028): void {
  s.noise({ at, dur, v, a: 0.002, d: dur * 0.7, s: 0.01, r: dur * 0.3, filter: { t: 'bandpass', f, q: 0.7 } });
}

/** A soft cloud of paper or confetti: pink noise whose band drifts down while it fades. */
export function puff(s: Synth, at: number, dur = 0.12, v = 1, f0 = 3200, f1 = 1300): void {
  const filter = [{ t: 'highpass' as const, f: Math.min(f0, f1) * 0.6 }, { t: 'bandpass' as const, f: f0, f2: f1, sw: dur, q: 0.6 }];
  s.noise({ kind: 'pink', at, dur, v, a: 0.008, d: dur * 0.7, s: 0.02, r: dur * 0.3, filter });
}

/** Wooden block: a sine at the block's pitch sagging a little (`sag` 1 holds it), a hollow partial that dies first, a dull click. */
export function knock(s: Synth, f: number, at: number, v = 1, dur = 0.07, sag = 0.82): void {
  s.tone({ f, f2: f * sag, sw: dur * 0.5, at, dur, v, a: 0.002, d: dur * 0.85, s: 0.01 });
  s.tone({ f: f * 2.4, at, dur: dur * 0.4, v: v * 0.25, a: 0.002, s: 0.01 });
  tick(s, at, f * 3, 0.012, v * 0.4, 1.2);
}

/** Rubber stamp on a pad: a dull low thud, a soft puff of the pad, and a small paper slap 18 ms behind. */
export function stamp(s: Synth, at: number, v = 1, f = 150): void {
  thump(s, f, f * 0.45, at, 0.11, v, 0.06, 0.4);
  s.noise({ at, dur: 0.05, v: v * 0.5, a: 0.002, s: 0.01, filter: { t: 'lowpass', f: 900 } });
  s.noise({ at: at + 0.018, dur: 0.03, v: v * 0.35, a: 0.002, s: 0.01, filter: { t: 'bandpass', f: 2300, q: 0.9 } });
}

/** Sticker pop: a sine that glides up a minor third in 22 ms (the peel) and rings down, with a faint octave and a peel tick. */
export function pop(s: Synth, f: number, at: number, v = 1, dur = 0.12): void {
  s.tone({ f: f * 0.84, f2: f, sw: 0.022, at, dur, v, a: 0.002, d: dur * 0.9, s: 0.01 });
  s.tone({ f: f * 2, at: at + 0.004, dur: dur * 0.35, v: v * 0.16, a: 0.002, s: 0.01 });
  s.noise({ at, dur: 0.012, v: v * 0.2, a: 0.001, s: 0.01, filter: { t: 'bandpass', f: 3200, q: 0.8 } });
}

/** Marimba bar: the fundamental rings, the 4th partial (the bar's wood) dies in 60 ms, a felt-mallet knock opens it. */
export function mallet(s: Synth, f: number, at: number, dur: number, v = 1, send?: Wet): void {
  s.tone({ f, at, dur, v, a: 0.002, d: dur * 0.9, s: 0.02, send });
  if (f * 4 < PARTIAL_LIMIT) s.tone({ f: f * 4, at, dur: Math.min(dur * 0.3, 0.07), v: v * 0.2, a: 0.002, s: 0.01 });
  s.noise({ at, dur: 0.01, v: v * 0.14, a: 0.001, s: 0.01, filter: { t: 'lowpass', f: 2400 } });
}

/** Kalimba tine on its wooden box: a pure fundamental, a short inharmonic ping at 5.4x, a hollow tick of the board. */
export function kalimba(s: Synth, f: number, at: number, dur: number, v = 1, send?: Wet): void {
  s.tone({ f, at, dur, v, a: 0.002, d: dur * 0.9, s: 0.02, send });
  if (f * 5.4 < PARTIAL_LIMIT) s.tone({ f: f * 5.4, at, dur: 0.05, v: v * 0.12, a: 0.002, s: 0.01 });
  tick(s, at, 1400, 0.008, v * 0.12, 1);
}

/** Nylon string (a ukulele): a triangle whose low-pass closes as the string settles, its octave, a fingertip tick. */
export function pluck(s: Synth, f: number, at: number, dur: number, v = 1, send?: Wet): void {
  s.tone({ w: 'triangle', f, at, dur, v, a: 0.003, d: dur * 0.9, s: 0.02, filter: { t: 'lowpass', f: f * 5, f2: f * 1.4, sw: dur * 0.5, q: 0.5 }, send });
  s.tone({ f: f * 2, at, dur: dur * 0.4, v: v * 0.2, a: 0.002, s: 0.01 });
  tick(s, at, 2000, 0.008, v * 0.12, 0.8);
}

/** Paper shaker: band-passed noise with a gentle swell, so it brushes instead of clicking. */
export function shake(s: Synth, at: number, v = 1, dur = 0.07, f = 5000): void {
  s.noise({ at, dur, v, a: 0.012, d: dur * 0.7, s: 0.02, filter: { t: 'bandpass', f, q: 0.9 } });
}

/** Small hand bell: a sine with the quiet inharmonic partials of a struck bar, short and dry enough not to shimmer. */
export function bell(s: Synth, f: number, at: number, dur: number, v = 1, send?: Wet): void {
  s.tone({ f, at, dur, v, a: 0.002, s: 0.01, send });
  if (f * 2.76 < PARTIAL_LIMIT) s.tone({ f: f * 2.76, at, dur: dur * 0.4, v: v * 0.18, a: 0.002, s: 0.01 });
  if (f * 5.4 < PARTIAL_LIMIT) s.tone({ f: f * 5.4, at, dur: dur * 0.18, v: v * 0.05, a: 0.002, s: 0.01 });
}
