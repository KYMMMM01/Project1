/**
 * Stingers: 1-2 s composed phrases baked in stereo like any other sound. They are played over a
 * ducked music bed; `duck` gives how deep the bed dips for each one.
 */
import type { StingerId } from './api';
import { bell, blip, chime, sparkles, thump, whoosh, type Recipe } from './recipe';
import type { Synth, Send } from './synth';
import { hz } from './theory';

/** Warm brass: detuned saws through a lowpass that opens on the attack (a real horn "blats" in). */
function brass(s: Synth, note: string, at: number, dur: number, v: number, send?: { bus: Send; amt: number }, pan = 0): void {
  s.tone({
    w: 'sawtooth',
    f: hz(note),
    at,
    dur,
    v,
    a: 0.02,
    s: 0.75,
    r: Math.min(0.2, dur * 0.4),
    uni: [-7, 7],
    pan,
    send,
    filter: { t: 'lowpass', f: 900, f2: 3200, sw: 0.09 },
  });
}

export const STINGER_RECIPES: Record<StingerId, Recipe> = {
  victory: {
    cat: 'stinger',
    len: 2.8,
    ms: [1400, 2300],
    stereo: true,
    build(s) {
      // C-major fanfare: a quick G-C-E-G brass climb, then the full chord lands with timpani,
      // a cymbal wash, a bell arpeggio and a twinkle tail.
      const rv = s.reverb(0.9, 0.25);
      ['G4', 'C5', 'E5'].forEach((n, k) => brass(s, n, k * 0.12, 0.13, 0.5, { bus: rv, amt: 0.3 }));
      brass(s, 'G5', 0.36, 0.22, 0.55, { bus: rv, amt: 0.3 });
      thump(s, 100, 55, 0, 0.35, 0.9, 0.2);
      thump(s, 100, 52, 0.6, 0.5, 1, 0.3);
      ['C4', 'G4', 'C5', 'E5', 'G5'].forEach((n, k) => brass(s, n, 0.6, 1.2, 0.34, { bus: rv, amt: 0.35 }, (k - 2) * 0.25));
      s.noise({ at: 0.6, dur: 1.4, v: 0.2, a: 0.01, s: 0.08, filter: { t: 'highpass', f: 6000 } });
      ['C6', 'E6', 'G6', 'C7'].forEach((n, k) => chime(s, hz(n), 0.62 + k * 0.07, 0.75, 0.4, { bus: rv, amt: 0.5 }));
      sparkles(s, 0.9, 10, 0.8, [hz('E7'), hz('G7'), hz('C7'), hz('D7'), hz('A6')], 0.17, 0.2, { bus: rv, amt: 0.5 });
    },
  },
  defeat: {
    cat: 'stinger',
    trim: -3,
    len: 2.5,
    ms: [1200, 2200],
    stereo: true,
    build(s) {
      // A gentle sigh, never a buzzer: triangle E4 -> D4 -> B3 through a 1.4 kHz lowpass with slow
      // vibrato, over a soft minor pad and a falling breath of noise.
      const rv = s.reverb(0.9, 0.3, 0.4);
      const filter = { t: 'lowpass' as const, f: 1400 };
      const vib = { rate: 5, cents: 25, delay: 0.15 };
      s.tone({ w: 'triangle', f: hz('E5'), at: 0, dur: 0.42, v: 1, a: 0.02, s: 0.8, r: 0.08, vib, filter, send: { bus: rv, amt: 0.4 } });
      s.tone({ w: 'triangle', f: hz('D5'), at: 0.4, dur: 0.42, v: 1, a: 0.02, s: 0.8, r: 0.08, vib, filter, send: { bus: rv, amt: 0.4 } });
      s.tone({ w: 'triangle', f: hz('B4'), at: 0.8, dur: 1.2, v: 1, a: 0.02, s: 0.35, r: 0.4, vib, filter, send: { bus: rv, amt: 0.4 } });
      s.tone({ f: 165, at: 0, dur: 1.9, v: 0.22, a: 0.3, s: 0.6, r: 0.6 });
      ['E4', 'G4', 'B4'].forEach((n, k) => {
        s.tone({ w: 'triangle', f: hz(n), at: 0.1, dur: 1.8, v: 0.15, a: 0.25, s: 0.6, r: 0.6, filter: { t: 'lowpass', f: 900 }, pan: (k - 1) * 0.4 });
      });
      s.noise({ kind: 'pink', at: 0.8, dur: 0.9, v: 0.08, a: 0.1, s: 0.3, filter: { t: 'lowpass', f: 1500, f2: 300, sw: 0.9 } });
    },
  },
  boss_intro: {
    cat: 'stinger',
    trim: -1,
    len: 2.9,
    ms: [1500, 2200],
    stereo: true,
    build(s) {
      // Dread then impact: a sub that sinks, a swelling D-minor/tritone saw pad, a rising noise
      // riser and cold bell hits; at 1.0 s a saturated blast, sub thump and a brass D-minor stab.
      const rv = s.reverb(1.0, 0.3, 0.4);
      s.tone({ f: 60, f2: 28, sw: 1.0, dur: 1.3, v: 0.5, a: 0.2, s: 0.5, sat: 0.4 });
      ['D2', 'A2', 'F3', 'G#2'].forEach((n, k) => {
        s.tone({ w: 'sawtooth', f: hz(n), at: 0, dur: 1.15, v: 0.2, a: 0.8, s: 1, r: 0.15, uni: [-10, 10], filter: { t: 'lowpass', f: 400, f2: 1400, sw: 1.0 }, pan: (k - 1.5) * 0.3 });
      });
      whoosh(s, 200, 3000, 0, 1.0, 0.7, 2, 0.9);
      s.noise({ kind: 'brown', at: 0, dur: 2.0, v: 0.3, a: 0.3, s: 0.3, filter: { t: 'lowpass', f: 260 } });
      bell(s, hz('D4'), 0.5, 0.7, 0.3, { bus: rv, amt: 0.5 });
      bell(s, hz('G#4'), 0.78, 0.6, 0.3, { bus: rv, amt: 0.5 });
      s.noise({ at: 1.0, dur: 0.6, v: 0.9, s: 0.01, sat: 0.5, filter: { t: 'lowpass', f: 5000, f2: 300, sw: 0.5 } });
      thump(s, 80, 30, 1.0, 0.9, 0.9, 0.5, 0.5);
      ['D3', 'F3', 'A3', 'D4'].forEach((n, k) => {
        s.tone({ w: 'sawtooth', f: hz(n), at: 1.02, dur: 0.95, v: 0.3, a: 0.02, s: 0.5, r: 0.45, uni: [-9, 9], filter: { t: 'lowpass', f: 1800, f2: 700, sw: 0.7 }, pan: (k - 1.5) * 0.3, send: { bus: rv, amt: 0.35 } });
      });
    },
  },
  mythic: {
    cat: 'stinger',
    trim: 1,
    len: 2.6,
    ms: [1600, 2200],
    stereo: true,
    build(s) {
      // The summon fantasy at full size: noise + saw riser, a sub drop with a saturated burst and a
      // G6 metal ping, a C-G-C supersaw pad swelling open, a C-E-G-C chime arpeggio and a high shimmer.
      const rv = s.reverb(0.7, 0.35);
      const e = s.echo(0.1, 0.35, 0.3, 8000);
      whoosh(s, 300, 6000, 0, 0.5, 0.9, 2, 0.9);
      s.tone({ w: 'sawtooth', f: 110, f2: 440, sw: 0.5, dur: 0.55, v: 0.3, a: 0.15, filter: { t: 'lowpass', f: 400, f2: 5000, sw: 0.5 } });
      thump(s, 70, 30, 0.5, 0.8, 1.1, 0.5, 0.5);
      s.noise({ at: 0.5, dur: 0.5, v: 0.85, s: 0.01, sat: 0.5, filter: { t: 'lowpass', f: 5000, f2: 300, sw: 0.5 } });
      bell(s, hz('G6'), 0.5, 0.9, 0.5, { bus: rv, amt: 0.5 });
      ['C3', 'G3', 'C4'].forEach((n, k) => {
        s.tone({ w: 'sawtooth', f: hz(n), at: 0.45, dur: 1.4, v: 0.2, a: 0.3, s: 0.9, r: 0.5, uni: [-12, 12], filter: { t: 'lowpass', f: 900, f2: 2200, sw: 1.0 }, pan: (k - 1) * 0.35, send: { bus: rv, amt: 0.4 } });
      });
      ['C6', 'E6', 'G6', 'C7'].forEach((n, k) => chime(s, hz(n), 0.6 + k * 0.12, 0.75, 0.5, { bus: e, amt: 0.5 }));
      sparkles(s, 0.95, 10, 0.8, [hz('E7'), hz('G7'), hz('C7'), hz('D7'), hz('B6')], 0.17, 0.2, { bus: e, amt: 0.5 });
    },
  },
  level_up: {
    cat: 'stinger',
    trim: -2,
    len: 1.9,
    ms: [1000, 1700],
    stereo: true,
    build(s) {
      // Triumphant rise: C5 E5 G5 in quick brass, a sustained C6 over a C-major chord, bells on top.
      const rv = s.reverb(0.7, 0.25);
      ['C5', 'E5', 'G5'].forEach((n, k) => brass(s, n, k * 0.1, 0.12, 0.5, { bus: rv, amt: 0.3 }));
      brass(s, 'C6', 0.3, 0.8, 0.5, { bus: rv, amt: 0.35 });
      ['C5', 'E5', 'G5'].forEach((n, k) => brass(s, n, 0.3, 0.8, 0.25, { bus: rv, amt: 0.35 }, (k - 1) * 0.3));
      ['C6', 'E6', 'G6'].forEach((n, k) => chime(s, hz(n), 0.3 + k * 0.06, 0.7, 0.4, { bus: rv, amt: 0.5 }));
      s.noise({ at: 0.3, dur: 0.6, v: 0.14, a: 0.01, s: 0.06, filter: { t: 'highpass', f: 7000 } });
      sparkles(s, 0.4, 6, 0.5, [hz('E7'), hz('G7'), hz('C7')], 0.16, 0.18, { bus: rv, amt: 0.5 });
    },
  },
  jackpot: {
    cat: 'stinger',
    trim: 0,
    len: 3.0,
    ms: [1500, 2250],
    stereo: true,
    build(s) {
      // A rising 8-note run, a coin shower of 36 panned blips over a rattle bed, a big C-major
      // chord with sub and cymbal at 0.55 s, and a final bell run.
      const rv = s.reverb(0.9, 0.3);
      ['C5', 'E5', 'G5', 'C6', 'E6', 'G6', 'C7', 'E7'].forEach((n, k) => blip(s, hz(n), k * 0.065, 0.15, 0.7));
      for (let k = 0; k < 36; k++) {
        const t = 0.3 + (k / 36) * 1.5 + s.rand() * 0.03;
        const pool = ['E6', 'G6', 'A6', 'C7', 'D7', 'E7'];
        s.tone({ w: 'triangle', f: hz(pool[Math.floor(s.rand() * pool.length)] as string), at: t, dur: 0.11, v: Math.max(0.12, 0.5 - k * 0.01), a: 0.002, s: 0.015, pan: (s.rand() - 0.5) * 1.4 });
      }
      s.noise({ at: 0.3, dur: 1.6, v: 0.1, a: 0.05, s: 0.2, r: 0.6, trem: { rate: 26, depth: 1 }, filter: { t: 'highpass', f: 6000 } });
      thump(s, 110, 50, 0.55, 0.45, 1, 0.25);
      ['C4', 'G4', 'C5', 'E5', 'G5'].forEach((n, k) => brass(s, n, 0.55, 1.0, 0.3, { bus: rv, amt: 0.35 }, (k - 2) * 0.25));
      s.noise({ at: 0.55, dur: 1.2, v: 0.18, a: 0.01, s: 0.08, filter: { t: 'highpass', f: 6000 } });
      ['G6', 'C7', 'E7'].forEach((n, k) => bell(s, hz(n), 1.3 + k * 0.1, 0.6, 0.35, { bus: rv, amt: 0.5 }));
    },
  },
};

/** How deep (0..1) the music bed dips under each stinger; the engine adds the phrase length. */
export const STINGER_DUCK: Record<StingerId, number> = {
  victory: 0.6,
  defeat: 0.55,
  boss_intro: 0.7,
  mythic: 0.75,
  level_up: 0.5,
  jackpot: 0.65,
};
