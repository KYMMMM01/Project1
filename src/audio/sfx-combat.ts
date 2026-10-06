/**
 * Recipes: combat, flow and gacha / gamble. Frequent sounds (shots, hits, deaths) are short, band
 * limited and baked in several variants; the big ones (boss, explosion, jackpot) stack layers.
 */
import type { SfxId } from './api';
import { bell, blip, chime, sparkles, thump, tick, whoosh, type Recipe } from './recipe';
import { hz } from './theory';

export const COMBAT_RECIPES: Partial<Record<SfxId, Recipe>> = {
  // ---------------------------------------------------------------- shots, one material each
  shoot_arrow: {
    cat: 'fire',
    len: 0.18,
    ms: [60, 200],
    variants: 3,
    rate: 0.05,
    build(s, v) {
      // Airy whip: a fast upward band-pass sweep of noise, a short string twang and a nock tick.
      const p = v.j(0.06);
      whoosh(s, 1500 * p, 5200 * p, 0, 0.1, 0.9, 1.8, 0.25);
      s.tone({ w: 'triangle', f: 300 * p, f2: 255 * p, sw: 0.04, dur: 0.06, v: 0.4 });
      tick(s, 0, 3200, 0.008, 0.45, 2);
    },
  },
  shoot_magic: {
    cat: 'fire',
    len: 0.24,
    ms: [80, 220],
    variants: 3,
    rate: 0.04,
    build(s, v) {
      // Sine chirp with vibrato = a "pew" that sparkles; an octave-up copy feeds a short echo.
      const p = v.j(0.05);
      const e = s.echo(0.045, 0.25, 0.25, 5500);
      s.tone({ f: 640 * p, f2: 1500 * p, sw: 0.09, dur: 0.13, v: 1, vib: { rate: 26, cents: 40 }, send: { bus: e, amt: 0.5 } });
      s.tone({ f: 1280 * p, f2: 3000 * p, sw: 0.09, dur: 0.1, v: 0.2, vib: { rate: 26, cents: 40 } });
    },
  },
  shoot_cannon: {
    cat: 'fire',
    trim: 3,
    len: 0.26,
    ms: [90, 220],
    variants: 3,
    rate: 0.04,
    build(s, v) {
      // Thump: a saturated sine drop for the barrel (harmonics keep it audible on phone speakers),
      // a mid "boom" triangle, and a lowpassed burst for the blast.
      const p = v.j(0.05);
      thump(s, 230 * p, 58, 0, 0.17, 0.8, 0.1, 0.6);
      s.tone({ w: 'triangle', f: 150 * p, f2: 70, sw: 0.1, dur: 0.15, v: 0.55 });
      s.noise({ dur: 0.1, v: 0.95, a: 0.002, s: 0.003, filter: { t: 'lowpass', f: 1500, f2: 350, sw: 0.09 } });
      tick(s, 0, 2200, 0.007, 0.35, 1);
    },
  },
  shoot_ice: {
    cat: 'fire',
    len: 0.16,
    ms: [50, 150],
    variants: 3,
    rate: 0.04,
    build(s, v) {
      // Glassy tick: a very short inharmonic FM bell plus a high partial and an icy noise tick.
      const p = v.j(0.05);
      s.tone({ f: 3136 * p, fm: { ratio: 2.4, idx: 1.6, idx2: 0, idxT: 0.05 }, dur: 0.11, v: 0.7, s: 0.01 });
      s.tone({ f: 4699 * p, dur: 0.05, v: 0.22 });
      tick(s, 0, 6500, 0.008, 0.55, 2);
    },
  },
  shoot_lightning: {
    cat: 'fire',
    len: 0.2,
    ms: [60, 200],
    variants: 3,
    rate: 0.04,
    build(s, v) {
      // Noisy zap: band-passed noise chopped at ~85 Hz (crackle) over a fast falling saw.
      const p = v.j(0.06);
      s.noise({ dur: 0.13, v: 1, a: 0.002, s: 0.02, trem: { rate: 85, depth: 0.9 }, filter: { t: 'bandpass', f: 3200 * p, f2: 800 * p, sw: 0.12, q: 3 } });
      s.tone({ w: 'sawtooth', f: 1100 * p, f2: 180, sw: 0.1, dur: 0.12, v: 0.32, filter: { t: 'lowpass', f: 2600 } });
      tick(s, 0, 5200, 0.006, 0.4, 2);
    },
  },
  shoot_poison: {
    cat: 'fire',
    len: 0.2,
    ms: [60, 200],
    variants: 3,
    rate: 0.04,
    build(s, v) {
      // Bubbly blip: two quick upward-gliding sine "bubbles" with a fast wobble and a wet noise puff.
      const p = v.j(0.06);
      s.tone({ f: 280 * p, f2: 720 * p, sw: 0.06, dur: 0.085, v: 1, a: 0.003, vib: { rate: 40, cents: 50 } });
      s.tone({ f: 360 * p, f2: 950 * p, sw: 0.05, at: 0.06, dur: 0.075, v: 0.7, a: 0.003 });
      s.noise({ dur: 0.05, v: 0.18, a: 0.003, s: 0.01, filter: { t: 'lowpass', f: 700 } });
    },
  },
  shoot_claw: {
    cat: 'fire',
    len: 0.18,
    ms: [50, 160],
    variants: 3,
    rate: 0.04,
    build(s, v) {
      // Fast swish: two overlapping high band-pass sweeps (two claws) over a short body.
      const p = v.j(0.06);
      whoosh(s, 2400 * p, 6500 * p, 0, 0.065, 0.9, 1.4, 0.3);
      whoosh(s, 3000 * p, 7000 * p, 0.045, 0.075, 0.8, 1.4, 0.3);
      s.tone({ w: 'triangle', f: 520 * p, f2: 260, sw: 0.05, dur: 0.06, v: 0.18 });
    },
  },

  // ---------------------------------------------------------------- impacts
  hit_light: {
    cat: 'hit',
    len: 0.1,
    ms: [45, 100],
    variants: 3,
    rate: 0.06,
    rule: { maxVoices: 5, minGap: 0.045, falloff: 0.2 },
    build(s, v) {
      // Must be pleasant at 15+/s: very short, band limited (no sub, no air), low level.
      const p = v.j(0.08);
      thump(s, 520 * p, 260 * p, 0, 0.07, 1, 0.04);
      s.noise({ dur: 0.024, v: 0.7, a: 0.001, s: 0.003, filter: { t: 'bandpass', f: 2200 * p, q: 1.1 } });
    },
  },
  hit_heavy: {
    cat: 'hit',
    trim: 4,
    len: 0.26,
    ms: [90, 220],
    variants: 3,
    rate: 0.05,
    rule: { maxVoices: 4, minGap: 0.06, falloff: 0.15 },
    build(s, v) {
      // Weight: low sine drop + triangle body, a mid noise slap and a click for definition.
      const p = v.j(0.06);
      thump(s, 260 * p, 70, 0, 0.16, 0.85, 0.09, 0.5);
      s.tone({ w: 'triangle', f: 190 * p, f2: 100, sw: 0.1, dur: 0.13, v: 0.6 });
      s.noise({ dur: 0.09, v: 1.0, a: 0.001, s: 0.003, filter: { t: 'lowpass', f: 2800, f2: 600, sw: 0.08 } });
      tick(s, 0, 1700, 0.01, 0.6, 1);
    },
  },
  crit: {
    cat: 'combat',
    trim: -4,
    len: 0.34,
    ms: [120, 260],
    variants: 2,
    rate: 0.03,
    rule: { maxVoices: 3, minGap: 0.09, falloff: 0.1 },
    build(s, v) {
      // Sharper transient (high-passed noise crack on top of the thump) + a bright bell ring at A6.
      const p = v.j(0.03);
      const e = s.echo(0.04, 0.4, 0.25, 7000);
      thump(s, 300, 130, 0, 0.08, 0.7, 0.04);
      s.noise({ dur: 0.014, v: 0.8, a: 0.001, s: 0.003, filter: { t: 'highpass', f: 3200 } });
      bell(s, hz('A6') * p, 0.005, 0.22, 0.8, { bus: e, amt: 0.5 });
      s.tone({ f: hz('A6') * 2 * p, at: 0.01, dur: 0.12, v: 0.2 });
    },
  },
  explosion: {
    cat: 'combat',
    trim: 3,
    len: 1.0,
    ms: [300, 900],
    variants: 2,
    rule: { maxVoices: 3, minGap: 0.08, falloff: 0.1 },
    build(s, v) {
      // Noise burst through a falling low-pass (fireball), brown rumble, sub sine drop, mid crackle.
      const p = v.j(0.08);
      s.noise({ dur: 0.75, v: 1, a: 0.004, s: 0.01, sat: 0.5, filter: { t: 'lowpass', f: 6500 * p, f2: 140, sw: 0.6, q: 0.8 } });
      s.noise({ kind: 'brown', dur: 0.6, v: 1.1, a: 0.01, s: 0.01, filter: { t: 'lowpass', f: 600, f2: 90, sw: 0.5 } });
      s.tone({ f: 95 * p, f2: 32, sw: 0.45, dur: 0.6, v: 1.1, a: 0.004 });
      s.tone({ w: 'triangle', f: 210 * p, f2: 60, sw: 0.3, dur: 0.3, v: 0.35 });
      s.noise({ dur: 0.01, v: 0.8, a: 0.001, s: 0.002, filter: { t: 'highpass', f: 2000 } });
    },
  },
  freeze: {
    cat: 'combat',
    trim: -4,
    len: 0.65,
    ms: [250, 560],
    build(s) {
      // Three glassy FM notes falling (D7 A6 E6) over a frosty high noise shimmer.
      const e = s.echo(0.06, 0.35, 0.3, 7000);
      ['D7', 'A6', 'E6'].forEach((n, k) => {
        s.tone({ f: hz(n), fm: { ratio: 2.7, idx: 1.2, idx2: 0, idxT: 0.2 }, at: k * 0.05, dur: 0.3, v: 0.5, s: 0.01, send: { bus: e, amt: 0.4 } });
      });
      s.noise({ at: 0.02, dur: 0.3, v: 0.22, a: 0.02, s: 0.05, trem: { rate: 30, depth: 0.7 }, filter: { t: 'highpass', f: 7000 } });
      whoosh(s, 4000, 7500, 0, 0.25, 0.18, 3, 0.4);
    },
  },
  stun: {
    cat: 'combat',
    trim: -3,
    len: 0.48,
    ms: [200, 420],
    build(s) {
      // "Bonk" then three dizzy tweets that fall in pitch with a woozy vibrato.
      s.tone({ w: 'triangle', f: 300, f2: 120, sw: 0.05, dur: 0.1, v: 1 });
      tick(s, 0, 1400, 0.01, 0.4, 1);
      [1500, 1300, 1100].forEach((f, k) => {
        s.tone({ f, f2: f * 0.7, sw: 0.07, at: 0.08 + k * 0.09, dur: 0.1 + k * 0.01, v: 0.5 - k * 0.04, vib: { rate: 20, cents: 80 } });
      });
    },
  },
  buff: {
    cat: 'combat',
    trim: -3,
    len: 0.65,
    ms: [250, 600],
    build(s) {
      // Power swell: rising triangle + soft saw, then three bright arrival blips (C6 E6 G6).
      const e = s.echo(0.07, 0.3, 0.25, 6500);
      s.tone({ w: 'triangle', f: 330, f2: 990, sw: 0.22, lin: true, dur: 0.3, v: 0.5, a: 0.04 });
      s.tone({ w: 'sawtooth', f: 165, f2: 495, sw: 0.22, lin: true, dur: 0.3, v: 0.16, a: 0.04, filter: { t: 'lowpass', f: 1800 } });
      ['C6', 'E6', 'G6'].forEach((n, k) => blip(s, hz(n), 0.16 + k * 0.06, 0.14, 0.7));
      sparkles(s, 0.26, 3, 0.16, [hz('C7'), hz('E7'), hz('G7')], 0.18, 0.12, { bus: e, amt: 0.4 });
    },
  },
  heal: {
    cat: 'combat',
    trim: -4,
    len: 0.8,
    ms: [300, 700],
    build(s) {
      // Warm and gentle: a slow vibrato sine glide up a fifth, a soft harp trill, a quiet shimmer.
      const e = s.echo(0.09, 0.35, 0.3, 5500);
      s.tone({ f: 523, f2: 784, sw: 0.25, dur: 0.36, v: 0.5, a: 0.03, vib: { rate: 6, cents: 20 } });
      ['G5', 'A5', 'C6', 'E6', 'G6'].forEach((n, k) => {
        chime(s, hz(n), 0.05 + k * 0.045, 0.28, 0.32, { bus: e, amt: 0.5 });
      });
      s.tone({ f: hz('C7'), at: 0.2, dur: 0.4, v: 0.15, a: 0.05, trem: { rate: 9, depth: 0.7 }, send: { bus: e, amt: 0.5 } });
    },
  },
  enemy_die: {
    cat: 'hit',
    trim: 3,
    len: 0.36,
    ms: [150, 340],
    variants: 3,
    rate: 0.08,
    rule: { maxVoices: 6, minGap: 0.035, falloff: 0.15 },
    build(s, v) {
      // A cute "poof": noise puff + a sine that falls 380 -> 110 Hz, with a small upper pop.
      const p = v.j(0.1);
      s.noise({ dur: 0.1, v: 0.8, a: 0.003, s: 0.01, filter: { t: 'bandpass', f: 1500 * p, q: 1.2 } });
      thump(s, 520 * p, 160 * p, 0, 0.22, 1, 0.14);
      s.tone({ f: 900 * p, f2: 400 * p, sw: 0.1, dur: 0.15, v: 0.3 });
    },
  },
  boss_warning: {
    cat: 'big',
    trim: -3,
    len: 1.25,
    ms: [850, 1250],
    build(s) {
      // Alarming but not painful: saw two-tone siren (C5 <-> G4) through a lowpass, three cycles,
      // each pulse backed by a 55 Hz sub so it is felt on speakers that cannot reproduce it.
      const filter = { t: 'lowpass' as const, f: 1800, q: 1 };
      for (let c = 0; c < 3; c++) {
        const t = c * 0.37;
        s.tone({ w: 'sawtooth', f: hz('C5'), at: t, dur: 0.19, v: 0.5, a: 0.012, s: 0.9, r: 0.03, uni: [7], filter });
        s.tone({ w: 'sawtooth', f: hz('G4'), at: t + 0.18, dur: 0.19, v: 0.5, a: 0.012, s: 0.9, r: 0.03, uni: [7], filter });
        s.tone({ f: 55, at: t, dur: 0.36, v: 0.4, a: 0.012, s: 0.7, r: 0.1 });
      }
    },
  },
  boss_roar: {
    cat: 'big',
    trim: -1,
    len: 1.5,
    ms: [800, 1450],
    build(s) {
      // Growl: three detuned saws falling 95 -> 52 Hz, chopped by a 34 Hz tremolo and saturated,
      // heard through parallel formant filters that glide like a vowel (ah -> oh), over a breath
      // of noise and an opening sub thump.
      const base = { w: 'sawtooth' as const, f: 95, f2: 52, sw: 1.1, dur: 1.3, a: 0.08, s: 0.7, r: 0.35, uni: [-14, 14, 25], sat: 0.6, trem: { rate: 34, depth: 0.55 } };
      s.tone({ ...base, v: 0.6, filter: { t: 'lowpass', f: 320 } });
      s.tone({ ...base, v: 0.9, filter: { t: 'bandpass', f: 450, f2: 800, sw: 0.55, q: 4 } });
      s.tone({ ...base, v: 0.65, filter: { t: 'bandpass', f: 1100, f2: 1800, sw: 0.55, q: 5 } });
      s.noise({ at: 0.05, dur: 1.15, v: 0.22, a: 0.1, s: 0.3, filter: { t: 'bandpass', f: 800, f2: 420, sw: 1.0, q: 1 }, trem: { rate: 22, depth: 0.6 } });
      thump(s, 70, 38, 0, 0.5, 0.5, 0.3, 0.4);
    },
  },
  boss_die: {
    cat: 'big',
    trim: 0,
    len: 2.2,
    ms: [1000, 1950],
    stereo: true,
    build(s) {
      // A collapsing explosion: a huge falling-low-pass blast with a sub, three smaller secondary
      // blasts, a saw that sinks from 420 to 38 Hz through a closing filter, and a debris crackle.
      s.noise({ dur: 1.3, v: 1, a: 0.005, s: 0.01, sat: 0.5, filter: { t: 'lowpass', f: 7000, f2: 110, sw: 1.0, q: 0.8 } });
      s.tone({ f: 85, f2: 28, sw: 0.9, dur: 1.2, v: 0.8, a: 0.004, sat: 0.4 });
      [0.22, 0.45, 0.7].forEach((t, k) => {
        s.noise({ at: t, dur: 0.35, v: 0.8 - k * 0.1, a: 0.003, s: 0.01, pan: k % 2 ? 0.5 : -0.5, filter: { t: 'lowpass', f: 4500, f2: 250, sw: 0.3 } });
        thump(s, 180, 55, t, 0.3, 0.5 - k * 0.08, 0.2, 0.4);
      });
      s.tone({ w: 'sawtooth', f: 420, f2: 38, sw: 1.5, dur: 1.65, v: 0.3, a: 0.05, sat: 0.3, filter: { t: 'lowpass', f: 3000, f2: 150, sw: 1.5 } });
      s.noise({ at: 0.1, dur: 1.5, v: 0.15, a: 0.05, s: 0.02, trem: { rate: 22, depth: 0.9 }, filter: { t: 'bandpass', f: 3000, q: 0.8 } });
    },
  },

  // ---------------------------------------------------------------- flow
  wave_start: {
    cat: 'combat',
    trim: -3,
    len: 0.9,
    ms: [400, 850],
    build(s) {
      // Horn: two saws a fifth apart (A3 + E4) with a gentle swell, lowpassed warm, over a short whoosh.
      const filter = { t: 'lowpass' as const, f: 1500 };
      s.tone({ w: 'sawtooth', f: 220, at: 0.02, dur: 0.52, v: 0.6, a: 0.045, s: 0.9, r: 0.18, uni: [-6, 6], filter });
      s.tone({ w: 'sawtooth', f: 330, at: 0.02, dur: 0.52, v: 0.45, a: 0.045, s: 0.9, r: 0.18, uni: [-6, 6], filter });
      s.tone({ f: 440, at: 0.02, dur: 0.5, v: 0.2, a: 0.05, s: 0.9, r: 0.18 });
      whoosh(s, 300, 2200, 0, 0.35, 0.3, 1, 0.5);
    },
  },
  wave_clear: {
    cat: 'reward',
    trim: 1,
    len: 0.9,
    ms: [400, 820],
    build(s) {
      // Three rising notes 60 ms apart (C5 E5 G5), then a held C-major chime chord with a twinkle.
      const e = s.echo(0.09, 0.35, 0.3, 6500);
      ['C5', 'E5', 'G5'].forEach((n, k) => blip(s, hz(n), k * 0.06, 0.13, 0.8));
      ['C5', 'E5', 'G5', 'C6'].forEach((n) => chime(s, hz(n), 0.18, 0.5, 0.5, { bus: e, amt: 0.5 }));
      sparkles(s, 0.24, 4, 0.2, [hz('E7'), hz('G7'), hz('C7')], 0.16, 0.14, { bus: e, amt: 0.4 });
    },
  },
  danger_alarm: {
    cat: 'combat',
    trim: -3,
    len: 0.45,
    ms: [200, 400],
    build(s) {
      // Two soft beeps (triangle + sub-octave sine), lowpassed: a warning, not a scream.
      const filter = { t: 'lowpass' as const, f: 2000 };
      for (const t of [0, 0.17]) {
        s.tone({ w: 'triangle', f: 740, at: t, dur: 0.11, v: 0.7, a: 0.008, s: 0.8, r: 0.035, filter });
        s.tone({ f: 370, at: t, dur: 0.11, v: 0.4, a: 0.008, s: 0.8, r: 0.035 });
      }
    },
  },
  countdown_tick: {
    cat: 'ui',
    trim: 1,
    len: 0.12,
    ms: [40, 110],
    build(s) {
      // Woodblock-ish tick: a short sine at E6 with a noise click.
      s.tone({ f: 1320, dur: 0.06, v: 0.8, a: 0.002, s: 0.005 });
      tick(s, 0, 2400, 0.01, 0.7, 2);
    },
  },
  whoosh: {
    cat: 'combat',
    trim: -6,
    len: 0.5,
    ms: [150, 420],
    build(s) {
      // Pink noise through a rising-then-closing band-pass for a soft passing-by, with a faint tone glide.
      s.noise({ kind: 'pink', dur: 0.36, v: 1, a: 0.14, d: 0, s: 1, r: 0.2, filter: { t: 'bandpass', f: 350, f2: 2600, sw: 0.3, q: 0.9 } });
      s.tone({ f: 160, f2: 480, sw: 0.3, dur: 0.3, v: 0.12, a: 0.1 });
    },
  },
  relic_pick: {
    cat: 'reward',
    trim: 1,
    len: 1.0,
    ms: [350, 850],
    build(s) {
      // Mystical: two FM bells (G5, D6) in an echo, an upward glide, and a high shimmer.
      const e = s.echo(0.09, 0.4, 0.32, 6500);
      s.tone({ f: hz('G5'), fm: { ratio: 2, idx: 1.2, idx2: 0, idxT: 0.4 }, dur: 0.5, v: 0.8, send: { bus: e, amt: 0.5 } });
      s.tone({ f: hz('D6'), fm: { ratio: 2, idx: 1.2, idx2: 0, idxT: 0.4 }, at: 0.1, dur: 0.55, v: 0.7, send: { bus: e, amt: 0.5 } });
      s.tone({ f: 400, f2: 1600, sw: 0.2, dur: 0.25, v: 0.18, a: 0.05 });
      sparkles(s, 0.16, 4, 0.25, [hz('D7'), hz('G7'), hz('B6')], 0.18, 0.16, { bus: e, amt: 0.5 });
    },
  },

  // ---------------------------------------------------------------- gacha / gamble
  chest_shake: {
    cat: 'combat',
    trim: -4,
    len: 0.6,
    ms: [250, 520],
    build(s) {
      // A rattling box: five wooden knocks (band-passed noise + low sine), alternating, plus a faint coin jingle.
      [0, 0.07, 0.15, 0.22, 0.3].forEach((t, k) => {
        s.noise({ at: t, dur: 0.04, v: 0.8, a: 0.001, s: 0.005, filter: { t: 'bandpass', f: 700 + (k % 2) * 400, q: 4 } });
        thump(s, 260 - (k % 2) * 50, 160, t, 0.055, 0.3, 0.03);
      });
      s.noise({ at: 0.05, dur: 0.3, v: 0.08, a: 0.04, s: 0.1, trem: { rate: 26, depth: 1 }, filter: { t: 'highpass', f: 5500 } });
    },
  },
  chest_open: {
    cat: 'big',
    trim: -4,
    len: 1.6,
    ms: [600, 1300],
    stereo: true,
    build(s) {
      // Creak (vibrato saw through a rising formant), then a thump-and-puff burst and a sparkling
      // C-major bloom: arpeggio of chimes over a soft saw chord, with twinkles.
      const e = s.echo(0.09, 0.4, 0.3, 7000);
      s.tone({ w: 'sawtooth', f: 90, f2: 210, sw: 0.25, dur: 0.3, v: 0.45, a: 0.04, vib: { rate: 9, cents: 60 }, filter: { t: 'bandpass', f: 500, f2: 1100, sw: 0.25, q: 6 } });
      thump(s, 200, 60, 0.3, 0.25, 1, 0.1);
      s.noise({ at: 0.3, dur: 0.16, v: 0.6, s: 0.01, filter: { t: 'bandpass', f: 3000, f2: 500, sw: 0.15, q: 0.8 } });
      ['C6', 'E6', 'G6', 'C7'].forEach((n, k) => chime(s, hz(n), 0.32 + k * 0.06, 0.6, 0.55, { bus: e, amt: 0.5 }));
      ['C5', 'E5', 'G5'].forEach((n, k) => {
        s.tone({ w: 'sawtooth', f: hz(n), at: 0.36, dur: 0.65, v: 0.1, a: 0.04, uni: [-8, 8], filter: { t: 'lowpass', f: 3000 }, pan: (k - 1) * 0.4 });
      });
      sparkles(s, 0.42, 8, 0.55, [hz('E7'), hz('G7'), hz('C7'), hz('D7'), hz('A6')], 0.2, 0.18, { bus: e, amt: 0.5 });
    },
  },
  card_flip: {
    cat: 'ui',
    len: 0.2,
    ms: [60, 140],
    build(s) {
      // Paper flip: a quick high noise swish followed by a soft settle tick.
      whoosh(s, 1800, 6000, 0, 0.06, 0.6, 0.9, 0.4);
      tick(s, 0.055, 2200, 0.01, 0.6, 1.2);
      thump(s, 300, 200, 0.055, 0.05, 0.3, 0.03);
    },
  },
  reel_tick: {
    cat: 'ui',
    len: 0.09,
    ms: [40, 80],
    build(s) {
      // Tiny wooden tick: a short high sine drop and a tight band-passed click.
      s.tone({ f: 1750, f2: 1350, sw: 0.02, dur: 0.06, v: 0.8, a: 0.001, s: 0.005 });
      tick(s, 0, 2600, 0.01, 0.7, 3);
    },
  },
  reel_stop: {
    cat: 'ui',
    trim: 2,
    len: 0.2,
    ms: [70, 150],
    build(s) {
      // Thunk: sine drop, a triangle wood knock and a dull lowpassed noise slap.
      thump(s, 240, 100, 0, 0.12, 0.9, 0.06, 0.4);
      s.tone({ w: 'triangle', f: 480, f2: 330, sw: 0.03, dur: 0.055, v: 0.55 });
      s.noise({ dur: 0.035, v: 0.5, a: 0.001, s: 0.005, filter: { t: 'lowpass', f: 900 } });
    },
  },
  jackpot: {
    cat: 'big',
    trim: -2,
    len: 2.1,
    ms: [1100, 1950],
    stereo: true,
    build(s) {
      // Rising 7-note arpeggio, a coin shower of 22 panned blips over a metallic rattle bed, a sub hit
      // and a bright supersaw chord with bell and echo.
      const e = s.echo(0.1, 0.42, 0.3, 7500);
      ['C5', 'E5', 'G5', 'C6', 'E6', 'G6', 'C7'].forEach((n, k) => blip(s, hz(n), k * 0.06, 0.14, 0.7));
      bell(s, hz('C7'), 0.42, 0.6, 0.5, { bus: e, amt: 0.5 });
      const pool = ['E6', 'G6', 'A6', 'C7', 'D7', 'E7'];
      for (let k = 0; k < 22; k++) {
        const t = 0.35 + k * 0.052 + s.rand() * 0.03;
        const f = hz(pool[Math.floor(s.rand() * pool.length)] as string);
        s.tone({ w: 'triangle', f, at: t, dur: 0.1, v: Math.max(0.15, 0.55 - k * 0.015), a: 0.002, s: 0.015, pan: (s.rand() - 0.5) * 1.2 });
      }
      s.noise({ at: 0.35, dur: 1.1, v: 0.1, a: 0.05, s: 0.2, r: 0.5, trem: { rate: 28, depth: 1 }, filter: { t: 'highpass', f: 6000 } });
      thump(s, 110, 50, 0.42, 0.3, 0.8, 0.15);
      ['C5', 'E5', 'G5', 'C6'].forEach((n, k) => {
        s.tone({ w: 'sawtooth', f: hz(n), at: 0.42, dur: 0.9, v: 0.09, a: 0.03, uni: [-9, 9], filter: { t: 'lowpass', f: 3500 }, pan: (k - 1.5) * 0.3, send: { bus: e, amt: 0.4 } });
      });
    },
  },
  gamble_fail: {
    cat: 'combat',
    trim: -3,
    len: 0.7,
    ms: [300, 620],
    build(s) {
      // "Wah-wah": a soft saw + triangle whose lowpass opens and closes on each note (the wah),
      // E4 then C4 sagging toward A3.
      const wah = (f: number, f2: number, at: number, dur: number, open: number) => {
        const filter = { t: 'lowpass' as const, f: 350, f2: open, sw: dur * 0.5, q: 2.5 };
        s.tone({ w: 'sawtooth', f, f2, sw: dur, at, dur, v: 0.5, a: 0.02, s: 0.7, r: 0.06, vib: { rate: 5, cents: 25, delay: 0.1 }, filter });
        s.tone({ w: 'triangle', f, f2, sw: dur, at, dur, v: 0.4, a: 0.02, s: 0.7, r: 0.06 });
      };
      wah(hz('E4'), hz('D#4'), 0, 0.22, 1700);
      wah(hz('C4'), hz('A3'), 0.25, 0.38, 1400);
    },
  },
};
