/**
 * Recipes: the v1.0 battle verbs (laser, molt, purr, awaken, wave call, sunbeam, hazard, splash,
 * zap, weaken, shield break). They share the combat tier, so each one is told apart by its material:
 * glass for shields, water for splashes, saw brass for the wave call, a fluttering low saw for the
 * purr. Levels inside a recipe are relative; the baker normalises to the category target.
 */
import type { SfxId } from './api';
import { bell, chime, sparkles, thump, tick, whoosh, type Recipe } from './recipe';
import { hz } from './theory';

export const BATTLE_RECIPES = {
  laser_on: {
    cat: 'combat',
    trim: -5,
    len: 0.6,
    ms: [150, 420],
    rule: { maxVoices: 2, minGap: 0.12, falloff: 0 },
    build(s) {
      // A cat toy switching on: a sine glides up with a shallow vibrato ("pew" that wobbles like a
      // laser dot), a triangle ghost a fifth above adds shine without edge, a switch tick opens it,
      // and two quiet pentatonic twinkles (G7, C8) are the sparkle.
      const e = s.echo(0.055, 0.35, 0.3, 7000);
      tick(s, 0, 3000, 0.008, 0.3, 2);
      s.tone({ f: 620, f2: 2100, sw: 0.1, dur: 0.17, v: 1, a: 0.006, vib: { rate: 22, cents: 30 }, send: { bus: e, amt: 0.45 } });
      s.tone({ w: 'triangle', f: 930, f2: 3150, sw: 0.1, dur: 0.12, v: 0.2, a: 0.006 });
      s.tone({ f: hz('G7'), at: 0.09, dur: 0.12, v: 0.2, s: 0.01, send: { bus: e, amt: 0.5 } });
      s.tone({ f: hz('C8'), at: 0.14, dur: 0.12, v: 0.15, s: 0.01, send: { bus: e, amt: 0.5 } });
    },
  },
  laser_off: {
    cat: 'hit',
    trim: -2,
    len: 0.16,
    ms: [50, 130],
    rule: { maxVoices: 2, minGap: 0.08, falloff: 0 },
    build(s) {
      // The mirror image of laser_on and half as long: a sine drops 1500 -> 520 Hz (power draining),
      // a triangle ghost an octave below rounds it off, and a dull tick closes the switch.
      s.tone({ f: 1500, f2: 520, sw: 0.06, dur: 0.09, v: 1, a: 0.003 });
      s.tone({ w: 'triangle', f: 760, f2: 270, sw: 0.06, dur: 0.08, v: 0.3, a: 0.003 });
      tick(s, 0, 2400, 0.007, 0.2, 1.5);
    },
  },
  molt: {
    cat: 'combat',
    trim: -3,
    len: 0.9,
    ms: [300, 700],
    rule: { maxVoices: 3, minGap: 0.1, falloff: 0 },
    build(s) {
      // Fluff = no transient: pink noise with a 35 ms attack through a closing low-pass is a soft
      // cloud rather than a hit, a quiet sine pad gives it body, a wide band of air sits on top, and
      // a two-note chime (G5 -> D6, a fifth up) says "new coat".
      const e = s.echo(0.08, 0.3, 0.28, 6000);
      s.noise({ kind: 'pink', dur: 0.22, v: 1, a: 0.035, d: 0.1, s: 0.15, r: 0.12, filter: { t: 'lowpass', f: 2600, f2: 450, sw: 0.2, q: 0.6 } });
      s.noise({ at: 0.02, dur: 0.16, v: 0.25, a: 0.03, s: 0.1, filter: { t: 'bandpass', f: 3200, q: 0.5 } });
      thump(s, 280, 150, 0.015, 0.14, 0.35, 0.09);
      chime(s, hz('G5'), 0.12, 0.3, 0.55, { bus: e, amt: 0.5 });
      chime(s, hz('D6'), 0.2, 0.34, 0.6, { bus: e, amt: 0.5 });
    },
  },
  purr: {
    cat: 'ui',
    trim: 0,
    len: 0.8,
    ms: [350, 700],
    rule: { maxVoices: 1, minGap: 0.4, falloff: 0 },
    build(s) {
      // Every layer is chopped by the same 25 Hz flutter, which is what a purr is. The body is a
      // detuned saw pair at 98 Hz low-passed warm (its upper harmonics keep it audible on a phone
      // speaker that cannot make 98 Hz), a triangle an octave up supplies the "mrr" vowel, and
      // band-passed pink noise is the breathy rasp. A slow vibrato and a soft 90 ms swell keep it a
      // gentle sound, never a motor.
      const trem = { rate: 25, depth: 0.78 };
      const env = { a: 0.09, d: 0.2, s: 0.9, r: 0.16 };
      s.tone({ w: 'sawtooth', f: 98, dur: 0.56, v: 0.55, ...env, uni: [-14, 11], vib: { rate: 4, cents: 18 }, filter: { t: 'lowpass', f: 520, q: 0.7 }, trem });
      s.tone({ w: 'triangle', f: 196, dur: 0.56, v: 0.35, ...env, vib: { rate: 4, cents: 18 }, trem });
      s.noise({ kind: 'pink', dur: 0.56, v: 0.5, a: 0.1, s: 0.9, r: 0.16, filter: { t: 'bandpass', f: 280, q: 0.9 }, trem });
    },
  },
  awaken: {
    cat: 'big',
    trim: 1,
    len: 1.75,
    ms: [1200, 1650],
    rule: { maxVoices: 1, minGap: 0.5, falloff: 0 },
    build(s) {
      // A harp-like glissando rolls up an octave and a half of C major (C4 ... E6) while a noise +
      // saw riser opens behind it; it lands at 0.4 s on a held, detuned saw chord with a sub
      // thump and a lowpassed noise burst (weight), then a bell cascade, twinkles and a high
      // fluttering air bed make the shimmer. Built on the summon_mythic vocabulary but rising as a
      // chord instead of dropping as a hit, and short enough to sit inside a fight.
      const rv = s.reverb(0.5, 0.3);
      const e = s.echo(0.1, 0.42, 0.32, 8000);
      whoosh(s, 350, 6000, 0, 0.38, 0.55, 2.2, 0.92);
      s.tone({ w: 'sawtooth', f: 130, f2: 523, sw: 0.38, dur: 0.4, v: 0.2, a: 0.12, uni: [-10, 10], filter: { t: 'lowpass', f: 500, f2: 4500, sw: 0.38 } });
      ['C4', 'E4', 'G4', 'C5', 'E5', 'G5', 'C6', 'E6'].forEach((n, k) => {
        const at = 0.06 + k * 0.042;
        chime(s, hz(n), at, 0.6, 0.6, { bus: rv, amt: 0.5 });
        if (k >= 4) bell(s, hz(n) * 2, at + 0.005, 0.5, 0.35, { bus: e, amt: 0.5 });
      });
      thump(s, 130, 40, 0.4, 0.55, 0.9, 0.3, 0.5);
      s.noise({ at: 0.4, dur: 0.3, v: 0.5, s: 0.01, filter: { t: 'lowpass', f: 6000, f2: 500, sw: 0.28 } });
      ['C3', 'G3', 'C4', 'E4', 'G4', 'B4', 'C5'].forEach((n) => {
        s.tone({ w: 'sawtooth', f: hz(n), at: 0.4, dur: 0.85, v: 0.07, a: 0.04, r: 0.4, uni: [-10, 10], filter: { t: 'lowpass', f: 2200, f2: 5200, sw: 0.5 }, send: { bus: rv, amt: 0.4 } });
      });
      ['C7', 'E7', 'G7', 'C8', 'E8'].forEach((n, k) => bell(s, hz(n), 0.42 + k * 0.05, 0.6, 0.4, { bus: e, amt: 0.5 }));
      sparkles(s, 0.5, 14, 0.7, [hz('C7'), hz('E7'), hz('G7'), hz('B6'), hz('D7'), hz('C8')], 0.28, 0.2, { bus: e, amt: 0.5 });
      s.noise({ at: 0.4, dur: 0.9, v: 0.18, a: 0.08, s: 0.1, r: 0.4, trem: { rate: 14, depth: 0.8 }, filter: { t: 'highpass', f: 7500 } });
    },
  },
  call_wave: {
    cat: 'combat',
    trim: -2,
    len: 0.9,
    ms: [250, 700],
    rule: { maxVoices: 1, minGap: 0.4, falloff: 0 },
    build(s) {
      // A bright brass "ta-TAA": detuned saws, lightly saturated for bite, through a low-pass that
      // blats open to 7 kHz in 50 ms (a real horn speaks with its top end first), a short G major
      // stab then a longer, higher B-D-G-B one, a breath of band-passed noise on each attack and a
      // bell ping for the shine. G major, so it sits on the battle track.
      const rv = s.reverb(0.4, 0.2);
      const horn = (notes: readonly string[], at: number, dur: number, v: number): void => {
        notes.forEach((n) => {
          s.tone({
            w: 'sawtooth', f: hz(n), at, dur, v, a: 0.012, d: dur * 0.3, s: 0.8, r: Math.min(0.14, dur * 0.4), uni: [-8, 8],
            sat: 0.25, filter: { t: 'lowpass', f: 900, f2: 7000, sw: 0.05 }, send: { bus: rv, amt: 0.3 },
          });
        });
      };
      horn(['G4', 'D5', 'G5'], 0, 0.11, 0.5);
      horn(['B4', 'D5', 'G5', 'B5'], 0.13, 0.36, 0.55);
      s.noise({ dur: 0.03, v: 0.4, a: 0.002, s: 0.02, filter: { t: 'bandpass', f: 2400, q: 1.2 } });
      s.noise({ at: 0.13, dur: 0.04, v: 0.4, a: 0.002, s: 0.02, filter: { t: 'bandpass', f: 2400, q: 1.2 } });
      bell(s, hz('G6'), 0.13, 0.3, 0.3, { bus: rv, amt: 0.4 });
    },
  },
  sunbeam: {
    cat: 'combat',
    trim: -4,
    len: 1.2,
    ms: [450, 1000],
    rule: { maxVoices: 2, minGap: 0.25, falloff: 0 },
    build(s) {
      // Warm light, not a bell strike: slow 35 ms attacks on an open C-G-E stack of sines (a wide
      // chorus on the root for warmth), a very slow vibrato, a breath of pink air that drifts down
      // from 5 kHz to 3 kHz, a long damped echo, and one high twinkle (B6) that arrives late.
      const e = s.echo(0.11, 0.4, 0.4, 5500);
      const rv = s.reverb(0.5, 0.3, 0.45);
      const vib = { rate: 4.5, cents: 10, delay: 0.1 };
      s.tone({ f: hz('C5'), dur: 0.8, v: 0.7, a: 0.035, d: 0.5, s: 0.12, r: 0.28, uni: [-5, 5], vib, send: { bus: rv, amt: 0.5 } });
      s.tone({ f: hz('G5'), at: 0.05, dur: 0.75, v: 0.5, a: 0.035, d: 0.5, s: 0.12, r: 0.28, vib, send: { bus: rv, amt: 0.5 } });
      s.tone({ f: hz('E6'), at: 0.1, dur: 0.7, v: 0.3, a: 0.04, d: 0.45, s: 0.1, r: 0.28, vib, send: { bus: e, amt: 0.5 } });
      s.tone({ w: 'triangle', f: hz('C4'), dur: 0.65, v: 0.25, a: 0.06, d: 0.4, s: 0.15, r: 0.25 });
      s.noise({ kind: 'pink', dur: 0.7, v: 0.22, a: 0.22, s: 0.2, r: 0.3, filter: { t: 'bandpass', f: 5200, f2: 3000, sw: 0.6, q: 0.7 } });
      bell(s, hz('B6'), 0.3, 0.4, 0.4, { bus: e, amt: 0.5 });
    },
  },
  hazard_warn: {
    cat: 'combat',
    trim: -3,
    len: 0.35,
    ms: [120, 300],
    rule: { maxVoices: 2, minGap: 0.15, falloff: 0 },
    build(s) {
      // Two short alert ticks, the second a minor third higher (B5 -> D6) so the pair reads as
      // "careful" and not as a UI click: a triangle body, a thin square edge behind a low-pass, an
      // octave pip and a woodblock tick on each. Far shorter than danger_alarm's soft beeps.
      [hz('B5'), hz('D6')].forEach((f, k) => {
        const at = k * 0.115;
        s.tone({ w: 'triangle', f, at, dur: 0.07, v: 0.85, a: 0.003, s: 0.02, r: 0.03 });
        s.tone({ w: 'square', f, at, dur: 0.05, v: 0.22, a: 0.003, filter: { t: 'lowpass', f: 2800 } });
        s.tone({ f: f * 2, at, dur: 0.045, v: 0.3, a: 0.002 });
        tick(s, at, 2600, 0.01, 0.35, 2);
      });
    },
  },
  splash: {
    cat: 'combat',
    trim: -3,
    len: 0.8,
    ms: [250, 650],
    variants: 2,
    rate: 0.05,
    rule: { maxVoices: 3, minGap: 0.08, falloff: 0.12 },
    build(s, v) {
      // Water = a slap, a plop and bubbles. A pink-noise slap whose band-pass sweeps up (the sheet
      // of water leaving the surface), a sine plop with a pitch drop, a short bright spray, and
      // seven random upward-gliding sine bubbles (the glide is what makes a bubble) over the tail.
      const p = v.j(0.07);
      s.noise({ kind: 'pink', dur: 0.3, v: 1, a: 0.006, d: 0.25, s: 0.02, filter: { t: 'bandpass', f: 500 * p, f2: 2600 * p, sw: 0.16, q: 0.9 } });
      thump(s, 340 * p, 120, 0, 0.14, 0.6, 0.08);
      s.noise({ dur: 0.12, v: 0.25, a: 0.004, s: 0.01, filter: { t: 'highpass', f: 4500 } });
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
    len: 0.3,
    ms: [60, 260],
    variants: 2,
    rate: 0.05,
    rule: { maxVoices: 4, minGap: 0.05, falloff: 0.15 },
    build(s, v) {
      // An electric crack: a 20 ms high-passed noise snap, a saw falling 1700 -> 200 Hz through a
      // resonant band-pass and chopped at 70 Hz (the buzz of an arc), a band-passed crackle chopped
      // at 110 Hz, and a small thump so the hit has body. Sharper and louder than shoot_lightning.
      const p = v.j(0.06);
      s.noise({ dur: 0.02, v: 1, a: 0.001, s: 0.01, filter: { t: 'highpass', f: 2800 } });
      s.tone({ w: 'sawtooth', f: 1700 * p, f2: 200 * p, sw: 0.09, dur: 0.12, v: 0.55, a: 0.002, trem: { rate: 70, depth: 0.85 }, filter: { t: 'bandpass', f: 1800 * p, f2: 500, sw: 0.1, q: 2.2 } });
      s.noise({ at: 0.02, dur: 0.12, v: 0.4, a: 0.002, s: 0.02, trem: { rate: 110, depth: 1 }, filter: { t: 'bandpass', f: 3500 * p, q: 1.5 } });
      thump(s, 220, 110, 0, 0.06, 0.35, 0.04);
    },
  },
  weaken: {
    cat: 'combat',
    trim: -4,
    len: 0.8,
    ms: [300, 700],
    rule: { maxVoices: 2, minGap: 0.15, falloff: 0 },
    build(s) {
      // A deflating "wah": a saw and a triangle slide 480 -> 230 Hz while a wide 7.5 Hz vibrato
      // (+-70 cents) and a 7.5 Hz amplitude wobble make it unsteady, the resonant low-pass droops
      // closed from 2.4 kHz to 420 Hz as if the strength drains out, over a falling breath of noise.
      // One long glide, where gamble_fail is two separate notes.
      const filter = { t: 'lowpass' as const, f: 2400, f2: 420, sw: 0.42, q: 3 };
      const vib = { rate: 7.5, cents: 70 };
      s.tone({ w: 'sawtooth', f: 480, f2: 230, sw: 0.45, dur: 0.5, v: 0.5, a: 0.02, s: 0.7, r: 0.1, vib, filter, trem: { rate: 7.5, depth: 0.5 } });
      s.tone({ w: 'triangle', f: 483, f2: 231, sw: 0.45, dur: 0.5, v: 0.45, a: 0.02, s: 0.7, r: 0.1, vib });
      s.noise({ kind: 'pink', dur: 0.3, v: 0.12, a: 0.02, s: 0.2, filter: { t: 'lowpass', f: 1200, f2: 300, sw: 0.3 } });
    },
  },
  shield_break: {
    cat: 'combat',
    trim: -2,
    len: 0.8,
    ms: [250, 700],
    variants: 2,
    rule: { maxVoices: 2, minGap: 0.1, falloff: 0 },
    build(s, v) {
      // Glass fails in a crack and then a fall of shards: a hard high-passed snap with a small knock
      // is the crack; fourteen short inharmonic FM pings at random pitches between 1.6 and 5.4 kHz,
      // spread over 0.3 s with falling levels, are the shards; a mid bell gives the glass a body
      // and a high rattle chopped at 45 Hz is the tinkling debris. Where freeze is three clean
      // falling notes, this is chaos.
      const p = v.j(0.05);
      const e = s.echo(0.05, 0.3, 0.3, 8000);
      s.noise({ dur: 0.02, v: 1, a: 0.001, s: 0.01, filter: { t: 'highpass', f: 1800 } });
      thump(s, 420, 160, 0, 0.09, 0.8, 0.05);
      for (let k = 0; k < 14; k++) {
        const at = 0.005 + Math.pow(k / 14, 1.3) * 0.32;
        const f = (1600 + s.rand() * 3800) * p;
        s.tone({ f, fm: { ratio: 2.76, idx: 1.1, idx2: 0, idxT: 0.04 }, at, dur: 0.05 + s.rand() * 0.09, v: 0.5 * (1 - k / 20), a: 0.001, s: 0.01, send: { bus: e, amt: 0.4 } });
      }
      bell(s, hz('A5') * p, 0.03, 0.4, 0.5, { bus: e, amt: 0.5 });
      s.noise({ at: 0.05, dur: 0.3, v: 0.1, a: 0.01, s: 0.05, trem: { rate: 45, depth: 0.9 }, filter: { t: 'highpass', f: 6000 } });
    },
  },
} satisfies Partial<Record<SfxId, Recipe>>;
