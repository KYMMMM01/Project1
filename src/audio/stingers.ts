/**
 * Stingers: 1-2 s composed phrases baked like any other sound (mono: six stereo phrases would alone
 * take 4 MB of decoded memory, and phone speakers fold them to mono anyway). They are played over a
 * ducked music bed; `duck` gives how deep the bed dips for each one. Like the SFX they are made of
 * mallets, plucked strings, a stamp and paper: a warm tune for a win, a soft sigh for a loss.
 */
import type { StingerId } from './api';
import { bell, kalimba, mallet, pluck, puff, shake, stamp, thump, type Recipe } from './recipe';
import { hz } from './theory';

export const STINGER_RECIPES: Record<StingerId, Recipe> = {
  victory: {
    cat: 'stinger',
    len: 2.0,
    ms: [1100, 1800],
    build(s) {
      // A warm little tune in C major: a marimba climb (G4 C5 E5 G5) lands at 0.5 s on the stamp and a full chord
      // (C5 E5 G5 C6) over a low plucked C and a hand bell, a kalimba tune (E6 D6 C6) rings out above it, and a shake of
      // paper and a puff of confetti finish the picture.
      const e = s.echo(0.08, 0.25, 0.25, 5000);
      ['G4', 'C5', 'E5', 'G5'].forEach((n, k) => mallet(s, hz(n), k * 0.11, 0.3, 0.7 + k * 0.05));
      stamp(s, 0.5, 1, 130);
      ['C5', 'E5', 'G5', 'C6'].forEach((n) => mallet(s, hz(n), 0.5, 0.9, 0.7, { bus: e, amt: 0.3 }));
      pluck(s, hz('C3'), 0.5, 0.7, 0.8);
      bell(s, hz('G6'), 0.52, 0.8, 0.4, { bus: e, amt: 0.3 });
      ['E6', 'D6', 'C6'].forEach((n, k) => kalimba(s, hz(n), 0.7 + k * 0.16, 0.4, 0.5, { bus: e, amt: 0.3 }));
      shake(s, 0.5, 0.6, 0.6);
      puff(s, 0.5, 0.5, 0.4, 3600, 1400);
    },
  },
  defeat: {
    cat: 'stinger',
    trim: -3,
    len: 2.0,
    ms: [1000, 1800],
    build(s) {
      // A gentle sigh, never a punishment: three soft marimba notes falling (E5 D5 B4) over a warm triangle bed (E4 G4 B4,
      // low-passed at 900 Hz, a slow swell), a low plucked E and a fading breath of paper. No tremolo, no dissonance.
      const e = s.echo(0.09, 0.25, 0.25, 3500);
      mallet(s, hz('E5'), 0, 0.42, 1, { bus: e, amt: 0.3 });
      mallet(s, hz('D5'), 0.4, 0.42, 1, { bus: e, amt: 0.3 });
      mallet(s, hz('B4'), 0.8, 1, 1, { bus: e, amt: 0.3 });
      ['E4', 'G4', 'B4'].forEach((n) => {
        s.tone({ w: 'triangle', f: hz(n), at: 0.1, dur: 1.5, v: 0.15, a: 0.25, s: 0.6, r: 0.5, filter: { t: 'lowpass', f: 900 } });
      });
      pluck(s, hz('E3'), 0, 1.2, 0.5);
      s.noise({ kind: 'pink', at: 0.8, dur: 0.8, v: 0.08, a: 0.1, s: 0.3, filter: { t: 'lowpass', f: 1500, f2: 300, sw: 0.8 } });
    },
  },
  boss_intro: {
    cat: 'stinger',
    trim: -1,
    len: 2.0,
    ms: [1200, 1900],
    build(s) {
      // Dread, then weight, all felt and wood: a low mallet roll that speeds up and swells for a second, two cold bell tings
      // (D5 and the tritone below it), then one huge hit with a low plucked D and a D-minor marimba chord (D3 F3 A3 D4).
      const e = s.echo(0.09, 0.25, 0.25, 3500);
      let t = 0;
      for (let k = 0; k < 13; k++) {
        thump(s, 118, 82, t, 0.14, 0.3 + k * 0.05, 0.06, 0.5);
        t += 0.085 - k * 0.003;
      }
      bell(s, hz('D5'), 0.5, 0.6, 0.25, { bus: e, amt: 0.3 });
      bell(s, hz('G#4'), 0.78, 0.6, 0.25, { bus: e, amt: 0.3 });
      thump(s, 80, 30, 1, 0.8, 1, 0.5, 0.5);
      ['D3', 'F3', 'A3', 'D4'].forEach((n) => mallet(s, hz(n), 1.02, 0.7, 0.8, { bus: e, amt: 0.25 }));
      pluck(s, hz('D3'), 1, 0.7, 0.9);
    },
  },
  mythic: {
    cat: 'stinger',
    trim: -3,
    len: 1.9,
    ms: [1100, 1700],
    build(s) {
      // The halo after the awakening: the awaken sound has already struck the chord, so this one has no attack of its own. A
      // quiet marimba roll alternating C6 and G5 swells and fades, a low plucked C holds under it, hand bells and kalimba
      // tines fall through the C-major pentatonic set and a shake of paper drifts across.
      const e = s.echo(0.09, 0.3, 0.3, 5000);
      for (let k = 0; k < 12; k++) mallet(s, hz(k % 2 ? 'G5' : 'C6'), 0.15 + k * 0.07, 0.3, 0.2 + 0.04 * Math.min(k, 8) - 0.02 * Math.max(0, k - 8));
      pluck(s, hz('C3'), 0.2, 1, 0.5);
      ['G6', 'C7', 'E7', 'G7', 'E7', 'C7'].forEach((n, k) => bell(s, hz(n), 0.5 + k * 0.14, 0.6, 0.35, { bus: e, amt: 0.3 }));
      ['E6', 'G6', 'C7', 'E7'].forEach((n, k) => kalimba(s, hz(n), 0.7 + k * 0.12, 0.35, 0.3, { bus: e, amt: 0.3 }));
      shake(s, 0.2, 0.4, 0.9);
    },
  },
  level_up: {
    cat: 'stinger',
    trim: -2,
    len: 1.6,
    ms: [1000, 1500],
    build(s) {
      // Triumphant but small: the stamp, a marimba climb (C5 E5 G5), a held C6 over a C-major chord and bells above it.
      const e = s.echo(0.08, 0.25, 0.25, 5000);
      stamp(s, 0, 0.8);
      ['C5', 'E5', 'G5'].forEach((n, k) => mallet(s, hz(n), 0.1 + k * 0.09, 0.25, 0.8));
      ['C5', 'E5', 'G5', 'C6'].forEach((n) => mallet(s, hz(n), 0.4, 0.8, 0.7, { bus: e, amt: 0.3 }));
      ['G6', 'C7', 'E7'].forEach((n, k) => bell(s, hz(n), 0.42 + k * 0.1, 0.6, 0.3, { bus: e, amt: 0.3 }));
      kalimba(s, hz('E6'), 0.6, 0.5, 0.4, { bus: e, amt: 0.3 });
      shake(s, 0.4, 0.4, 0.5);
    },
  },
  jackpot: {
    cat: 'stinger',
    len: 2.0,
    ms: [1100, 1800],
    build(s) {
      // A confetti cannon: a marimba run of eight notes (C5 up to E7), a shower of twenty kalimba tines falling in the
      // pentatonic set, a stamp at 0.55 s and a rolled chord of hand bells, with a cloud of confetti under it.
      const e = s.echo(0.09, 0.28, 0.28, 5000);
      ['C5', 'E5', 'G5', 'C6', 'E6', 'G6', 'C7', 'E7'].forEach((n, k) => mallet(s, hz(n), k * 0.065, 0.3, 0.7));
      const pool = ['E6', 'G6', 'A6', 'C7', 'D7', 'E7'];
      for (let k = 0; k < 20; k++) {
        kalimba(s, hz(pool[Math.floor(s.rand() * pool.length)] as string), 0.3 + (k / 20) * 1.1 + s.rand() * 0.03, 0.2, Math.max(0.12, 0.5 - k * 0.02));
      }
      stamp(s, 0.55, 1);
      ['C6', 'E6', 'G6'].forEach((n, k) => bell(s, hz(n), 0.58 + k * 0.05, 0.8, 0.4, { bus: e, amt: 0.3 }));
      puff(s, 0.55, 0.7, 0.4, 3600, 1400);
    },
  },
};

/** Cut-off (Hz) the music is low-passed to while a stinger plays: a defeat should feel muffled, not just quieter. */
export const STINGER_MUFFLE: Partial<Record<StingerId, number>> = { defeat: 400 };

/** How deep (0..1) the music bed dips under each stinger; the engine adds the phrase length. */
export const STINGER_DUCK: Record<StingerId, number> = {
  victory: 0.6,
  defeat: 0.55,
  boss_intro: 0.7,
  mythic: 0.75,
  level_up: 0.5,
  jackpot: 0.65,
};
