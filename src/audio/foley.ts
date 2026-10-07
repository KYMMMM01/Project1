/**
 * Foley kit for the weapon and enemy sounds: the small physical events a toy fight is made of (a blade's bite, a wooden
 * clack, a rubber snap, a string's twang, a spring, a pop). Every function writes a few voices into a Synth at `at` seconds
 * and stays inside the world of paper, wood, cork, tin, felt and glass: sines and triangles with a pitch sweep, band-passed
 * noise, a couple of inharmonic partials. No saw, no square, no additive shimmer.
 *
 * Levels: `v` means the same loudness for a tone and for noise here. Band-passed noise carries about a tenth of the power of a
 * sine with the same gain (the filter throws most of it away), so every noise voice of this kit is lifted by `AIR`; without it a
 * swish under a body thud would be inaudible and a cast would sound like a hum.
 */
import type { NoiseOpts, Send, Synth } from './synth';
import { paper, puff, shake, thump, tick, whoosh } from './recipe';

type Wet = { bus: Send; amt: number };

/** Gain that makes a band-passed noise voice as loud as a sine with the same `v`. */
const AIR = 3.5;

/** A noise voice with its level corrected by `AIR`. */
export function air(s: Synth, o: NoiseOpts): void {
  s.noise({ ...o, v: (o.v ?? 1) * AIR });
}

/** A sheet of air moving: pink noise sweeping a band from `f0` to `f1` (the existing `whoosh`, level corrected). */
export function swish(s: Synth, f0: number, f1: number, at: number, dur: number, v = 1, q = 0.8, peakAt = 0.4): void {
  whoosh(s, f0, f1, at, dur, v * AIR, q, peakAt);
}

/** A soft cloud of dust, powder or confetti (the existing `puff`, level corrected). */
export function dust(s: Synth, at: number, dur: number, v: number, f0: number, f1: number): void {
  puff(s, at, dur, v * AIR, f0, f1);
}

/** A fingertip on paper (the existing `paper`, level corrected). */
export function grain(s: Synth, at: number, f: number, v = 1, dur = 0.028): void {
  paper(s, at, f, v * AIR, dur);
}

/** A tiny band-passed tick (the existing `tick`, level corrected). */
export function rap(s: Synth, at: number, f: number, dur = 0.012, v = 1, q = 1.5): void {
  tick(s, at, f, dur, v * AIR, q);
}

/** A rattle of small loose things: noise in a band with a soft swell (the existing `shake`, level corrected). */
export function rattle(s: Synth, at: number, v = 1, dur = 0.07, f = 5000): void {
  shake(s, at, v * AIR, dur, f);
}

/** The bite of a contact: a 2-6 kHz noise snap of about 10 ms. It is what makes a hit read as a hit instead of a pat. */
export function snap(s: Synth, at: number, v = 1, f = 3400, dur = 0.014): void {
  air(s, { at, dur, v, a: 0.001, d: dur * 0.8, s: 0.01, filter: [{ t: 'highpass', f: f * 0.55 }, { t: 'bandpass', f, q: 0.8 }] });
}

/** The weight under a contact: a sine drop through 80-200 Hz with a little saturation so a phone speaker still plays it. */
export function body(s: Synth, at: number, f0: number, f1: number, dur: number, v = 1, sat = 0.3): void {
  thump(s, f0, f1, at, dur, v, dur * 0.45, sat);
}

/** A wooden clack: the bar's fundamental, its second mode (2.72x) dying first, and the dull click of the grain. */
export function clack(s: Synth, at: number, f: number, v = 1, dur = 0.05): void {
  s.tone({ f, at, dur, v, a: 0.002, d: dur * 0.8, s: 0.01 });
  s.tone({ f: f * 2.72, at, dur: dur * 0.5, v: v * 0.5, a: 0.002, s: 0.01 });
  rap(s, at, f * 3.4, 0.01, v * 0.35, 1.1);
}

/** Struck tin or glass: a pure ping, one inharmonic partial that dies first and a hard little tick. */
export function tink(s: Synth, at: number, f: number, dur: number, v = 1, send?: Wet): void {
  s.tone({ f, at, dur, v, a: 0.002, d: dur * 0.9, s: 0.01, send });
  s.tone({ f: f * 2.32, at, dur: dur * 0.35, v: v * 0.22, a: 0.002, s: 0.01 });
  rap(s, at, f * 1.8, 0.006, v * 0.2, 1.2);
}

/** A thin whistle (an arrow, a blade in the air): a sine sweep with a narrow breath of noise riding on it. */
export function whistle(s: Synth, at: number, f0: number, f1: number, dur: number, v = 1): void {
  s.tone({ f: f0, f2: f1, sw: dur, at, dur, v: v * 0.6, a: dur * 0.3, d: dur * 0.6, s: 0.05 });
  air(s, { kind: 'pink', at, dur, v: v * 0.4, a: dur * 0.3, d: dur * 0.5, s: 0.05, filter: { t: 'bandpass', f: f0, f2: f1, sw: dur, q: 5 } });
}

/** A spring or a rubber band: a sine gliding from `f0` to `f1` under a fast wobble. */
export function boing(s: Synth, at: number, f0: number, f1: number, dur: number, v = 1, wobble = 22, cents = 60): void {
  s.tone({ f: f0, f2: f1, sw: dur * 0.6, at, dur, v, a: 0.003, d: dur * 0.9, s: 0.01, vib: { rate: wobble, cents } });
}

/** A bubble (or a drip): a sine that glides up an octave and a bit in a few ms and rings down. */
export function bubble(s: Synth, at: number, f: number, v = 1, dur = 0.07): void {
  s.tone({ f, f2: f * 2.2, sw: dur * 0.7, at, dur, v, a: 0.003, d: dur * 0.9, s: 0.01 });
}

/** Crumpling, fizz, embers: band-passed noise chopped at `rate` Hz, optionally gliding from `f` to `f2`. */
export function crackle(s: Synth, at: number, dur: number, f: number, v = 1, rate = 60, f2?: number): void {
  air(s, { at, dur, v, a: 0.004, d: dur * 0.8, s: 0.02, trem: { rate, depth: 0.9 }, filter: { t: 'bandpass', f, f2, sw: dur * 0.8, q: 1 } });
}

/** A wet slap: band-passed noise sliding down while it fades, with a sine plop under it. */
export function squelch(s: Synth, at: number, dur: number, f0: number, f1: number, v = 1): void {
  air(s, { at, dur, v, a: 0.006, d: dur * 0.85, s: 0.02, trem: { rate: 28, depth: 0.7 }, filter: { t: 'bandpass', f: f0, f2: f1, sw: dur * 0.85, q: 1.2 } });
  s.tone({ f: f0 * 0.3, f2: f1 * 0.4, sw: dur * 0.5, at, dur: dur * 0.6, v: v * 0.5, a: 0.003, d: dur * 0.5, s: 0.01 });
}
