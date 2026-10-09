/**
 * The shared parts of the music kits: a felt kick, a brush snare, a paper shaker, a marimba, a nylon pluck, a kalimba tine, an upright bass
 * and the track-specific percussion and ornaments (pots, bubbles, clock ticks, birds, coins). Every part is a few oscillators and a band of
 * noise written into one `Synth` voice; nothing here is a raw saw, a square or a distorted lead.
 */
import { midiToHz } from './theory';
import type { Synth } from './synth';

const f = midiToHz;

/** Felt-beater kick on a soft drum: a sine drop with just enough saturation for a phone speaker, and no click. */
export function kick(s: Synth, vel: number, f0: number, f1: number, len: number): void {
  s.tone({ f: f0, f2: f1, sw: 0.07, dur: len, v: vel, a: 0.004, s: 0.003, r: 0.05, sat: 0.3 });
  s.noise({ dur: 0.02, v: vel * 0.12, a: 0.004, s: 0.01, filter: { t: 'lowpass', f: 1200 } });
}

/** A brush on a cardboard box: a band-passed paper rustle and a short wooden body, no snare wires. */
export function snare(s: Synth, vel: number, body: number, bright: number): void {
  s.noise({ dur: 0.14, v: vel * 0.6, a: 0.002, s: 0.006, filter: [{ t: 'highpass', f: 600 }, { t: 'bandpass', f: bright, q: 0.7 }] });
  s.tone({ w: 'triangle', f: body, f2: body * 0.75, sw: 0.05, dur: 0.09, v: vel * 0.5, a: 0.002, s: 0.01 });
}

/** Paper shaker: band-passed noise with a 6 ms swell, so it brushes instead of ticking. */
export function hat(s: Synth, vel: number, dur: number, centre: number): void {
  s.noise({ dur, v: vel * 0.35, a: 0.006, d: dur * 0.7, s: 0.02, filter: { t: 'bandpass', f: centre, q: 0.9 } });
}

/** A felt mallet on a wooden box, a fifth-ish below the key: low enough to be a drum, mid enough for a phone to play. */
export function tom(s: Synth, vel: number, midi: number): void {
  const base = f(midi - 12);
  s.tone({ f: base * 1.35, f2: base, sw: 0.07, dur: 0.28, v: vel, a: 0.003, s: 0.004, sat: 0.2 });
  s.noise({ dur: 0.02, v: vel * 0.2, a: 0.001, s: 0.01, filter: { t: 'bandpass', f: 1000, q: 1 } });
}

/** A bell tree in the key's pentatonic set run quickly upward under a swell of paper: the soft cymbal. */
export function crash(s: Synth, vel: number, len: number, midis: readonly number[]): void {
  s.noise({ kind: 'pink', dur: len, v: vel * 0.22, a: 0.04, d: len * 0.8, s: 0.02, filter: { t: 'bandpass', f: 3500, q: 0.6 } });
  midis.forEach((m, k) => s.tone({ f: f(m), at: k * 0.035, dur: len * 0.7, v: vel * 0.07, a: 0.002, s: 0.01 }));
}

/** Marimba bar: the fundamental rings, the 4th partial (the bar's wood) dies fast, a felt knock opens it. */
export function marimba(s: Synth, fr: number, vel: number, dur: number, tail: number): void {
  s.tone({ f: fr, dur: dur + tail, v: vel, a: 0.004, d: dur + tail - 0.1, s: 0.06, r: 0.3 });
  s.tone({ f: fr * 4, dur: Math.min(dur * 0.3, 0.07) + 0.03, v: vel * 0.2, a: 0.003, s: 0.01 });
  s.noise({ dur: 0.01, v: vel * 0.1, a: 0.002, s: 0.01, filter: { t: 'lowpass', f: 2400 } });
}

/** Nylon-string pluck: a triangle whose low-pass closes as the string settles. */
export function pluck(s: Synth, fr: number, vel: number, dur: number): void {
  s.tone({ w: 'triangle', f: fr, dur, v: vel, a: 0.003, d: dur - 0.05, s: 0.03, r: 0.05, filter: { t: 'lowpass', f: fr * 5, f2: fr * 1.5, sw: 0.16, q: 0.5 } });
}

/** Kalimba tine: a pure fundamental and a short ping at 5.4x. */
export function tine(s: Synth, fr: number, vel: number, dur: number): void {
  s.tone({ f: fr, dur, v: vel, a: 0.003, d: dur - 0.02, s: 0.02, r: 0.02 });
  s.tone({ f: fr * 5.4, dur: 0.04, v: vel * 0.1, a: 0.002, s: 0.01 });
}

/** Upright bass: a soft sine with a little saturation (so a phone speaker finds the harmonics), its octave, a mid-range finger tick. */
export function upright(s: Synth, fr: number, vel: number, dur: number, hold: number): void {
  s.tone({ f: fr, dur: dur + 0.06, v: vel * 0.3, a: 0.006, d: dur * hold, s: 0.3, r: 0.05, sat: 0.35, filter: { t: 'lowpass', f: 800 } });
  s.tone({ w: 'triangle', f: fr * 2, dur: dur * 0.5 + 0.04, v: vel * 0.2, a: 0.004, s: 0.02, filter: { t: 'lowpass', f: 1200 } });
  s.noise({ dur: 0.02, v: vel * 0.25, a: 0.003, s: 0.01, filter: { t: 'bandpass', f: 900, q: 1 } });
}


/** A ukulele strum: every string a nylon pluck `gap` seconds apart, with a quiet octave on each. */
export function ukulele(s: Synth, notes: readonly number[], vel: number, dur: number, gap = 0.012): void {
  notes.forEach((n, k) => {
    const fr = f(n);
    const at = k * gap;
    s.tone({ w: 'triangle', f: fr, at, dur: dur + 0.2, v: vel * 0.26, a: 0.003, d: dur * 0.9 + 0.1, s: 0.05, r: 0.15, filter: { t: 'lowpass', f: fr * 5, f2: fr * 1.6, sw: 0.25, q: 0.5 } });
    s.tone({ f: fr * 2, at, dur: 0.15, v: vel * 0.04, a: 0.002, s: 0.01 });
  });
}

/** Muted upright: the same bass with a short hold and a darker triangle on top, a palm on the strings. */
export function mutedBass(s: Synth, fr: number, vel: number, dur: number): void {
  upright(s, fr, vel * 0.85, dur, 0.15);
  s.tone({ w: 'triangle', f: fr, dur: dur + 0.04, v: vel * 0.2, a: 0.003, d: 0.06, s: 0.2, r: 0.03, filter: { t: 'lowpass', f: 900, f2: 300, sw: 0.07 } });
}

/** A wooden tick of a clock or a claves: a short pitched tok with a click on top. */
export function tick(s: Synth, vel: number, hz: number): void {
  s.tone({ f: hz, f2: hz * 0.87, sw: 0.02, dur: 0.05, v: vel * 0.3, a: 0.002, s: 0.01 });
  s.noise({ dur: 0.04, v: vel * 0.3, a: 0.001, s: 0.01, filter: { t: 'bandpass', f: hz * 1.7, q: 3 } });
}

/** A pot lid or a pan struck with a spoon: three partials that die at different speeds, and a tap of noise. */
export function clank(s: Synth, vel: number, hz: number): void {
  s.tone({ f: hz, dur: 0.22, v: vel * 0.26, a: 0.002, s: 0.01 });
  s.tone({ f: hz * 2.32, dur: 0.12, v: vel * 0.13, a: 0.002, s: 0.01 });
  s.tone({ f: hz * 3.9, dur: 0.06, v: vel * 0.06, a: 0.002, s: 0.01 });
  s.noise({ dur: 0.02, v: vel * 0.12, a: 0.001, s: 0.01, filter: { t: 'bandpass', f: 2200, q: 1.5 } });
}

/** A spoon on a cup, or a coin on a coin: a short bright tink (`at` seconds into the voice). */
export function tink(s: Synth, vel: number, hz: number, at = 0): void {
  s.tone({ f: hz, at, dur: 0.14, v: vel * 0.2, a: 0.002, s: 0.01 });
  s.tone({ f: hz * 2.76, at, dur: 0.05, v: vel * 0.07, a: 0.002, s: 0.01 });
}

/** A bubble: a round sine that bends up as it rises through the water (`at` seconds into the voice). */
export function bloop(s: Synth, vel: number, hz: number, at = 0): void {
  s.tone({ f: hz * 0.72, f2: hz * 1.22, sw: 0.05, at, dur: 0.12, v: vel * 0.3, a: 0.004, d: 0.1, s: 0.02, filter: { t: 'lowpass', f: 2400 } });
}

/** A drip: a short plink that bends down, with a hint of ring. */
export function plink(s: Synth, vel: number, hz: number): void {
  s.tone({ f: hz * 1.12, f2: hz, sw: 0.03, dur: 0.16, v: vel * 0.22, a: 0.002, s: 0.01 });
  s.tone({ f: hz * 2.01, dur: 0.06, v: vel * 0.05, a: 0.002, s: 0.01 });
}

/** A water-drop pluck: a kalimba tine whose pitch pops up into the note, with a long soft tail. */
export function drop(s: Synth, fr: number, vel: number, dur: number): void {
  s.tone({ f: fr * 0.95, f2: fr, sw: 0.02, dur: dur + 0.15, v: vel, a: 0.003, d: dur + 0.1, s: 0.02, r: 0.05 });
  s.tone({ f: fr * 3, dur: 0.05, v: vel * 0.08, a: 0.002, s: 0.01 });
}

/** A harp string: a triangle pluck doubled eight cents apart, so the long tail shimmers like water. */
export function harp(s: Synth, fr: number, vel: number, dur: number): void {
  s.tone({ w: 'triangle', f: fr, uni: [8], dur: dur + 0.25, v: vel, a: 0.003, d: dur + 0.2, s: 0.03, r: 0.05, filter: { t: 'lowpass', f: fr * 4.5, f2: fr * 1.4, sw: 0.4, q: 0.5 } });
}

/** A flute: a breathy sine with a slow attack and a late, shy vibrato; the second harmonic is barely there. */
export function flute(s: Synth, fr: number, vel: number, dur: number): void {
  const len = dur + 0.1;
  s.tone({ f: fr, dur: len, v: vel * 0.34, a: 0.045, d: 0.15, s: 0.75, r: 0.1, vib: { rate: 5.3, cents: 14, delay: 0.16 } });
  s.tone({ f: fr * 2, dur: len, v: vel * 0.04, a: 0.06, d: 0.15, s: 0.7, r: 0.1 });
  s.noise({ kind: 'pink', dur: len, v: vel * 0.06, a: 0.04, d: 0.15, s: 0.6, r: 0.08, filter: { t: 'bandpass', f: fr * 2.5, q: 1.2 } });
}

/** A little bird: `chirps` short sines, each gliding up and settling, a notch higher every time. */
export function bird(s: Synth, vel: number, hz: number, chirps: number): void {
  for (let k = 0; k < chirps; k++) {
    const fr = hz * (1 + 0.07 * k);
    s.tone({ f: fr, f2: fr * 1.2, sw: 0.03, at: k * 0.075, dur: 0.07, v: vel * 0.2, a: 0.006, d: 0.05, s: 0.1, r: 0.02, filter: { t: 'lowpass', f: 4200 } });
  }
}

/** A coin: a bell sine with its inharmonic partial, shorter and shinier than a kalimba tine. */
export function coin(s: Synth, fr: number, vel: number, dur: number): void {
  s.tone({ f: fr, dur: dur + 0.1, v: vel * 0.5, a: 0.002, d: dur + 0.07, s: 0.02, r: 0.03 });
  s.tone({ f: fr * 2.756, dur: 0.1, v: vel * 0.12, a: 0.002, s: 0.01 });
}

/** Three kalimba tines in a rising fifth-and-octave run, 40 ms apart: a sparkle. */
export function sparkle(s: Synth, vel: number, fr: number): void {
  [1, 1.5, 2].forEach((ratio, k) => s.tone({ f: fr * ratio, at: k * 0.04, dur: 0.22, v: vel * 0.22, a: 0.002, d: 0.2, s: 0.02, r: 0.02 }));
}
