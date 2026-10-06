/**
 * Recipes: the battle verbs (laser, molt, purr, awaken, wave call, sunbeam, hazard, splash, fizz, weaken,
 * shield break). They share the combat family, so each one is told apart by its material: a marimba
 * pair for the laser toy, a puff of fluff for the molt, a stamp and a mallet chord for the awakening, a
 * pair of wooden knocks for a hazard, water for splashes, cellophane for the fizz. Levels inside a
 * recipe are relative; the baker normalises to the family target.
 */
import type { SfxId } from './api';
import { bell, kalimba, knock, mallet, paper, pluck, puff, shake, stamp, thump, whoosh, type Recipe } from './recipe';
import { hz } from './theory';

export const BATTLE_RECIPES = {
  laser_on: {
    cat: 'combat',
    trim: -4,
    len: 0.35,
    ms: [100, 330],
    rule: { maxVoices: 2, minGap: 0.12, falloff: 0 },
    build(s) {
      // A cat toy switching on: the wooden tick of the switch, then two small marimba notes climbing (D6, A6) in a tiny
      // echo, like a dot hopping onto the floor.
      const e = s.echo(0.05, 0.2, 0.22, 4500);
      knock(s, 1100, 0, 0.6, 0.03);
      mallet(s, hz('D6'), 0.03, 0.15, 0.9, { bus: e, amt: 0.35 });
      mallet(s, hz('A6'), 0.09, 0.2, 1, { bus: e, amt: 0.35 });
    },
  },
  laser_off: {
    cat: 'hit',
    trim: -2,
    len: 0.16,
    ms: [40, 130],
    rule: { maxVoices: 2, minGap: 0.08, falloff: 0 },
    build(s) {
      // The mirror image, half as long: a dull tick and one marimba note sagging a fourth (A5 to E5) as the dot goes out.
      knock(s, 700, 0, 0.5, 0.03);
      s.tone({ f: hz('A5'), f2: hz('E5'), sw: 0.07, at: 0.01, dur: 0.1, v: 1, a: 0.003, d: 0.09, s: 0.02 });
    },
  },
  molt: {
    cat: 'combat',
    trim: -3,
    len: 0.7,
    ms: [250, 650],
    rule: { maxVoices: 3, minGap: 0.1, falloff: 0 },
    build(s) {
      // Fluff = no transient: pink noise with a 35 ms attack through a closing low-pass is a soft cloud rather than a hit,
      // a felt pat gives it body, and two kalimba tines (G5 to D6, a fifth up) say "new coat".
      const e = s.echo(0.07, 0.2, 0.22, 4500);
      s.noise({ kind: 'pink', dur: 0.22, v: 1, a: 0.035, d: 0.1, s: 0.15, r: 0.12, filter: { t: 'lowpass', f: 2600, f2: 450, sw: 0.2, q: 0.6 } });
      thump(s, 280, 150, 0.015, 0.14, 0.35, 0.09);
      kalimba(s, hz('G5'), 0.12, 0.28, 0.6, { bus: e, amt: 0.3 });
      kalimba(s, hz('D6'), 0.2, 0.32, 0.65, { bus: e, amt: 0.3 });
    },
  },
  purr: {
    cat: 'ui',
    trim: 0,
    len: 0.8,
    ms: [350, 700],
    rule: { maxVoices: 1, minGap: 0.4, falloff: 0 },
    build(s) {
      // Every layer is chopped by the same 25 Hz flutter, which is what a purr is. The body is a detuned triangle pair at
      // 98 Hz, saturated a little and low-passed warm (its upper harmonics keep it audible on a phone speaker that cannot
      // make 98 Hz), a triangle an octave up supplies the "mrr" vowel, and band-passed pink noise is the breathy rasp. A
      // slow vibrato and a soft 90 ms swell keep it a gentle sound, never a motor.
      const trem = { rate: 25, depth: 0.78 };
      const env = { a: 0.09, d: 0.2, s: 0.9, r: 0.16 };
      s.tone({ w: 'triangle', f: 98, dur: 0.56, v: 0.7, ...env, uni: [-14, 11], sat: 0.5, vib: { rate: 4, cents: 18 }, filter: { t: 'lowpass', f: 520, q: 0.7 }, trem });
      s.tone({ w: 'triangle', f: 196, dur: 0.56, v: 0.35, ...env, vib: { rate: 4, cents: 18 }, trem });
      s.noise({ kind: 'pink', dur: 0.56, v: 0.5, a: 0.1, s: 0.9, r: 0.16, filter: { t: 'bandpass', f: 280, q: 0.9 }, trem });
    },
  },
  awaken: {
    cat: 'big',
    trim: 2.5,
    len: 1.55,
    ms: [1100, 1500],
    duck: { depth: 0.55, seconds: 1.3 },
    rule: { maxVoices: 1, minGap: 0.5, falloff: 0 },
    build(s) {
      // A mallet roll climbs an octave and a half of C major (C4 to E6) behind a rising swish of paper, lands at 0.4 s on
      // the big stamp, a full marimba chord (C5 E5 G5 C6) over a low plucked C and a hand bell, and a proud two-note
      // "ta-daa" (G5 to C6) closes the figure. All wood, felt and paper, and short enough to sit inside a fight.
      const e = s.echo(0.08, 0.25, 0.25, 5000);
      whoosh(s, 400, 3500, 0, 0.38, 0.45, 0.8, 0.92);
      ['C4', 'E4', 'G4', 'C5', 'E5', 'G5', 'C6', 'E6'].forEach((n, k) => mallet(s, hz(n), 0.04 + k * 0.044, 0.35, 0.55 + k * 0.03, k >= 5 ? { bus: e, amt: 0.3 } : undefined));
      stamp(s, 0.4, 0.6, 150);
      ['C5', 'E5', 'G5', 'C6'].forEach((n) => mallet(s, hz(n), 0.4, 0.8, 0.9, { bus: e, amt: 0.3 }));
      pluck(s, hz('C3'), 0.4, 0.6, 0.7);
      bell(s, hz('G6'), 0.42, 0.7, 0.45, { bus: e, amt: 0.35 });
      mallet(s, hz('G5'), 0.62, 0.25, 0.8);
      mallet(s, hz('C6'), 0.74, 0.7, 1, { bus: e, amt: 0.3 });
      ['E6', 'G6', 'C7'].forEach((n, k) => kalimba(s, hz(n), 0.82 + k * 0.07, 0.3, 0.35));
      puff(s, 0.4, 0.4, 0.5, 3800, 1400);
      shake(s, 0.45, 0.5, 0.5);
    },
  },
  call_wave: {
    cat: 'combat',
    trim: -2,
    len: 0.7,
    ms: [250, 650],
    rule: { maxVoices: 1, minGap: 0.4, falloff: 0 },
    build(s) {
      // "Ta-TAA", the player calling the wave: a short marimba stab (G4 D5) and a longer, higher one (G4 D5 G5 B5) with a
      // stamp under it and a bell on top. Brighter and more definite than the plain wave_start pair, G major so it sits
      // on the battle track.
      const e = s.echo(0.07, 0.22, 0.22, 4500);
      ['G4', 'D5'].forEach((n) => mallet(s, hz(n), 0, 0.14, 0.7));
      ['G4', 'D5', 'G5', 'B5'].forEach((n) => mallet(s, hz(n), 0.13, 0.4, 0.8, { bus: e, amt: 0.3 }));
      stamp(s, 0.13, 0.6, 160);
      bell(s, hz('G6'), 0.13, 0.35, 0.35, { bus: e, amt: 0.3 });
    },
  },
  sunbeam: {
    cat: 'combat',
    trim: -4,
    len: 0.9,
    ms: [350, 850],
    rule: { maxVoices: 2, minGap: 0.25, falloff: 0 },
    build(s) {
      // Warm light, not a bell strike: a slow 35 ms swell on an open C-G-E stack of sines (a wide chorus on the root for
      // warmth) and a triangle underneath, a very slow vibrato, a breath of pink air drifting down from 5 kHz to 3 kHz, a
      // short soft echo and one high twinkle (B6) that arrives late. The warmth comes from the swell, not from a long tail.
      const e = s.echo(0.08, 0.2, 0.25, 4500);
      const vib = { rate: 4.5, cents: 10, delay: 0.1 };
      s.tone({ f: hz('C5'), dur: 0.7, v: 0.7, a: 0.035, d: 0.45, s: 0.12, r: 0.25, uni: [-5, 5], vib, send: { bus: e, amt: 0.4 } });
      s.tone({ f: hz('G5'), at: 0.05, dur: 0.65, v: 0.5, a: 0.035, d: 0.45, s: 0.12, r: 0.25, vib, send: { bus: e, amt: 0.4 } });
      s.tone({ f: hz('E6'), at: 0.1, dur: 0.6, v: 0.3, a: 0.04, d: 0.4, s: 0.1, r: 0.25, vib, send: { bus: e, amt: 0.4 } });
      s.tone({ w: 'triangle', f: hz('C4'), dur: 0.55, v: 0.25, a: 0.06, d: 0.35, s: 0.15, r: 0.2 });
      s.noise({ kind: 'pink', dur: 0.6, v: 0.22, a: 0.2, s: 0.2, r: 0.25, filter: { t: 'bandpass', f: 5000, f2: 3000, sw: 0.5, q: 0.7 } });
      bell(s, hz('B6'), 0.28, 0.35, 0.35, { bus: e, amt: 0.4 });
    },
  },
  hazard_warn: {
    cat: 'combat',
    trim: -3,
    len: 0.3,
    ms: [100, 280],
    rule: { maxVoices: 2, minGap: 0.15, falloff: 0 },
    build(s) {
      // A clear but friendly two-note knock: two wooden blocks, the second a fourth higher (A5 then D6), each with a quiet
      // octave pip. The pitch holds steady (no sag) so the pair reads as two notes, and it is far shorter than the
      // danger heartbeat so nobody mistakes one for the other.
      [hz('A5'), hz('D6')].forEach((f, k) => {
        const at = k * 0.115;
        knock(s, f, at, 0.9, 0.08, 0.98);
        s.tone({ f: f * 2, at, dur: 0.045, v: 0.2, a: 0.002, s: 0.01 });
      });
    },
  },
  splash: {
    cat: 'combat',
    trim: -3,
    len: 0.6,
    ms: [200, 600],
    variants: 2,
    rate: 0.05,
    rule: { maxVoices: 3, minGap: 0.08, falloff: 0.12 },
    build(s, v) {
      // Water on paper = a slap, a plop and bubbles. A pink-noise slap whose band-pass sweeps up (the sheet of water leaving
      // the surface), a sine plop with a pitch drop, a short soft spray (band-passed at 3 kHz, not a hiss) and seven random
      // upward-gliding sine bubbles over the tail (the glide is what makes a bubble).
      const p = v.j(0.07);
      s.noise({ kind: 'pink', dur: 0.3, v: 1, a: 0.006, d: 0.25, s: 0.02, filter: { t: 'bandpass', f: 500 * p, f2: 2400 * p, sw: 0.16, q: 0.9 } });
      thump(s, 340 * p, 120, 0, 0.14, 0.6, 0.08);
      s.noise({ dur: 0.12, v: 0.2, a: 0.004, s: 0.01, filter: { t: 'bandpass', f: 3200, q: 0.7 } });
      for (let k = 0; k < 7; k++) {
        const at = 0.05 + s.rand() * 0.33;
        const f = (550 + s.rand() * 900) * p;
        s.tone({ f, f2: f * 1.7, sw: 0.035, at, dur: 0.07, v: 0.22 + s.rand() * 0.2, a: 0.004 });
      }
    },
  },
  zap: {
    cat: 'combat',
    trim: -4,
    len: 0.2,
    ms: [50, 190],
    lp: 5000,
    variants: 3,
    rate: 0.06,
    rule: { maxVoices: 4, minGap: 0.05, falloff: 0.15 },
    build(s, v) {
      // A fizz, for magic hits and a lightning bolt alike: cellophane crackle (band-passed noise chopped at 90 Hz and falling
      // from 3.2 to 1.4 kHz), a soft sine pop that rises a fourth and a small felt pat so the hit has body.
      const p = v.j(0.06);
      s.noise({ dur: 0.1, v: 1, a: 0.003, s: 0.02, trem: { rate: 90, depth: 0.85 }, filter: { t: 'bandpass', f: 3200 * p, f2: 1400 * p, sw: 0.09, q: 1.4 } });
      s.tone({ f: 700 * p, f2: 930 * p, sw: 0.04, dur: 0.09, v: 0.5, a: 0.003, d: 0.08, s: 0.02 });
      thump(s, 260, 130, 0, 0.05, 0.3, 0.03);
    },
  },
  weaken: {
    cat: 'combat',
    trim: -4,
    len: 0.6,
    ms: [250, 650],
    rule: { maxVoices: 2, minGap: 0.15, falloff: 0 },
    build(s) {
      // A gentle deflating "wuh": a triangle and a sine slide 480 to 230 Hz while a wide 7.5 Hz vibrato (+-70 cents) and a
      // 7.5 Hz amplitude wobble make it unsteady, the low-pass droops closed from 2.4 kHz to 420 Hz as if the strength drains
      // out, over a falling breath of noise. One long glide, where gamble_fail is two separate notes.
      const filter = { t: 'lowpass' as const, f: 2400, f2: 420, sw: 0.42, q: 1.5 };
      const vib = { rate: 7.5, cents: 70 };
      s.tone({ w: 'triangle', f: 480, f2: 230, sw: 0.45, dur: 0.5, v: 0.6, a: 0.02, s: 0.7, r: 0.1, vib, filter, trem: { rate: 7.5, depth: 0.5 } });
      s.tone({ f: 483, f2: 231, sw: 0.45, dur: 0.5, v: 0.4, a: 0.02, s: 0.7, r: 0.1, vib });
      s.noise({ kind: 'pink', dur: 0.3, v: 0.12, a: 0.02, s: 0.2, filter: { t: 'lowpass', f: 1200, f2: 300, sw: 0.3 } });
    },
  },
  shield_break: {
    cat: 'combat',
    trim: -2,
    len: 0.5,
    ms: [200, 500],
    variants: 2,
    rule: { maxVoices: 2, minGap: 0.1, falloff: 0 },
    build(s, v) {
      // A paper shield tears and its pieces fall: a hard paper crack (a band-passed snap at 2.2 kHz), a felt knock, eight little
      // wooden pings between 1.2 and 3.2 kHz falling over 0.3 s with falling levels, and a mid marimba tone for the body.
      // Where freeze is three clean falling tines, this is a scatter.
      const p = v.j(0.05);
      s.noise({ dur: 0.02, v: 1, a: 0.001, s: 0.01, filter: { t: 'bandpass', f: 2200, q: 0.7 } });
      thump(s, 420, 160, 0, 0.09, 0.8, 0.05);
      for (let k = 0; k < 8; k++) {
        const at = 0.01 + Math.pow(k / 8, 1.3) * 0.28;
        const f = (1200 + s.rand() * 2000) * p;
        s.tone({ f, at, dur: 0.05 + s.rand() * 0.07, v: 0.5 * (1 - k / 12), a: 0.002, s: 0.01 });
      }
      mallet(s, hz('A5') * p, 0.03, 0.3, 0.5);
      paper(s, 0.05, 2600, 0.2, 0.04);
    },
  },
} satisfies Partial<Record<SfxId, Recipe>>;
