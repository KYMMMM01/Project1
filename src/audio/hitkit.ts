/**
 * The layers a hit is built from, a step above the foley kit: what a contact needs to read as a CONTACT on a phone's speaker. A phone plays almost nothing
 * under 250 Hz, so the weight of a blow cannot be a low sine alone; and a blow whose first millisecond is a soft 500 Hz swell is a pat, not a hit. So a hit here is
 * three things in a fixed order of time:
 *
 *   crack   0 to 10 ms   a burst of noise in the 2.5 to 7 kHz band: the touch itself, what makes the ear say "it hit something"
 *   thud    0 to 90 ms   a pitched drop whose harmonics (a saturator makes them) sit at 300 to 1200 Hz, where the phone can play them
 *   voice   0 to 150 ms  what the thing is made of: a wooden bar, a tin plate, a pane of glass, a pan (the recipe's own, with a recording under it where one helps)
 *
 * Every function writes voices into a `Synth` at `at` seconds and stays inside the world of the game (paper, wood, cork, tin, felt and glass).
 */
import { air } from './foley';
import { thump } from './recipe';
import type { SampleOpts, Synth } from './synth';

/**
 * The touch: noise in a band around `f` (2.5 to 6 kHz for a hit), a plateau of `dur` (about 16 ms) that starts in 2 ms and lets go in half of `dur`. The plateau, not a
 * spike that dies away at once, is what lets the band carry a share of the first 20 ms next to a body (a spike of the same peak would have to be five times as loud and
 * would push the rest of the sound down by the normaliser): measured, a level of 0.7 to 1 gives 6 to 13 % of the first 20 ms between 2.5 and 6 kHz.
 */
export function crack(s: Synth, at: number, v = 1, f = 3200, dur = 0.016): void {
  air(s, { at, dur, v, a: 0.002, d: dur * 0.25, s: 0.4, r: dur * 0.5, filter: [{ t: 'highpass', f: f * 0.58 }, { t: 'bandpass', f, q: 0.65 }] });
}

/**
 * The weight: a sine dropping from `f0` to `f1`, driven so that its harmonics reach the phone. `sat` is how hard (0.3 a pat, 0.8 a slam); the high-pass
 * before the saturator takes the part of the sine under `hp` away first, so the harmonics are made of the middle of the drop and not of the sub.
 */
export function thud(s: Synth, at: number, f0: number, f1: number, dur: number, v = 1, sat = 0.5, hp = 0): void {
  if (hp <= 0) {
    thump(s, f0, f1, at, dur, v, dur * 0.4, sat);
    return;
  }
  s.tone({ f: f0, f2: f1, sw: dur * 0.4, at, dur, v, a: 0.002, d: dur * 0.9, s: 0.01, sat, filter: { t: 'highpass', f: hp, q: 0.6 } });
}

/** A tap on a soft thing (leather, felt, cork, a paper tube): noise in a band, as long as `dur` (20 to 40 ms). */
export function tap(s: Synth, at: number, f: number, v = 1, dur = 0.03, q = 0.8): void {
  air(s, { at, dur, v, a: 0.002, d: dur * 0.7, s: 0.01, filter: { t: 'bandpass', f, q } });
}

/**
 * A struck bar of metal or glass: the fundamental and the inharmonic partials of a thin bar (2.32x, 3.9x and 5.4x are close to what a plate or a
 * cup rings with), each dying faster than the one under it. `dur` is the ring of the fundamental.
 */
export function ring(s: Synth, at: number, f: number, dur: number, v = 1): void {
  s.tone({ f, at, dur, v, a: 0.002, d: dur * 0.9, s: 0.01 });
  s.tone({ f: f * 2.32, at, dur: dur * 0.5, v: v * 0.38, a: 0.002, s: 0.01 });
  s.tone({ f: f * 3.9, at, dur: dur * 0.3, v: v * 0.2, a: 0.002, s: 0.01 });
  s.tone({ f: f * 5.4, at, dur: dur * 0.18, v: v * 0.1, a: 0.002, s: 0.01 });
}

/** A recorded layer, if it is loaded (a recipe is a whole sound without it): a thin wrapper that keeps the call sites short. */
export function rec(s: Synth, id: string, o: SampleOpts): void {
  s.sample(id, o);
}

/** Recorded layers of the CC0 packs (docs/licenses/sounds.md): `<pack>/<file>`. */
export const IMPACT_FILE = (name: string): string => `impact-sounds/${name}`;
export const RPG_FILE = (name: string): string => `rpg-audio/${name}`;
