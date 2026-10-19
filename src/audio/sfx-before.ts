/**
 * The sounds as they were before the hit-sound pass of 2026-10-19 ("지금" on the sound board). The recipes below are the old ones word for word under
 * the new names `old_<id>`; they exist so that the owner can hear "지금" and "새것" side by side on `?scene=sounds` (`src/soundboard/next.ts`). They are
 * `legacy`: the game never plays them, they are not baked ahead, not part of any family, check or budget, and they go when the owner has chosen.
 */
import type { SfxId } from './api';
import { air, body, boing, bubble, clack, crackle, dust, grain, rap, snap, swish, tink, whistle } from './foley';
import { bell, knock, pluck, thump, type Recipe } from './recipe';
import { RANK_TRIM } from './sfx-cats';
import { foe } from './sfx-foes';
import { hz } from './theory';

// The two helpers of the old recipes as they were (their voice rules too: the board's "×5 · 3배속" of an old sound must stack as it did).
interface Spec {
  rank: 0 | 1 | 2 | 3 | 4;
  len: number;
  ms: readonly [number, number];
  gap?: number;
  prio?: number;
  lp?: number;
  db?: number;
  build: Recipe['build'];
}

function swing(o: Spec): Recipe {
  return {
    cat: 'swing',
    trim: RANK_TRIM[o.rank] + (o.db ?? 0),
    len: o.len,
    ms: o.ms,
    lp: o.lp ?? 6500,
    variants: 3,
    rate: 0.05,
    prio: o.prio,
    rule: { maxVoices: 2, minGap: o.gap ?? 0.08, falloff: 0.12 },
    build: o.build,
  };
}

function impact(o: Spec): Recipe {
  return {
    cat: 'impact',
    trim: RANK_TRIM[o.rank] + (o.db ?? 0),
    len: o.len,
    ms: o.ms,
    lp: o.lp ?? 6500,
    variants: 3,
    rate: 0.04,
    prio: o.prio,
    rule: { maxVoices: 3, minGap: o.gap ?? 0.05, falloff: 0.15 },
    build: o.build,
  };
}

const RAW = {
  // ---------------------------------------------------------------- the cats' releases and impacts (as they were)
  old_atk_w_paw: swing({
    rank: 0,
    len: 0.14,
    ms: [30, 140],
    gap: 0.06,
    build(s, v) {
      // A boxer's jab: a quick narrow whiff of paper-thin air and the little pat of the glove at the end of the arm.
      const p = v.j(0.06);
      swish(s, 1500 * p, 3300 * p, 0, 0.05, 1, 1.1, 0.35);
      body(s, 0.045, 270 * p, 170, 0.045, 0.7, 0.1);
    },
  }),
  old_atk_w_sword: swing({
    rank: 1,
    len: 0.18,
    ms: [50, 180],
    build(s, v) {
      // A wooden sword: a longer swish than the jab with a hollow wooden hum under it, and a small clack as the swing ends.
      const p = v.j(0.06);
      swish(s, 900 * p, 2800 * p, 0, 0.1, 1, 1, 0.4);
      s.tone({ w: 'triangle', f: 180 * p, f2: 125 * p, sw: 0.08, dur: 0.11, v: 0.12, a: 0.03, filter: { t: 'lowpass', f: 900 } });
      clack(s, 0.105, 520 * p, 0.4, 0.03);
    },
  }),
  old_atk_w_viking: swing({
    rank: 2,
    len: 0.26,
    ms: [90, 260],
    gap: 0.1,
    build(s, v) {
      // A heavy axe: a wide slow swish that peaks late, a low hum of moved air under it and a dull thump as the head comes round.
      const p = v.j(0.06);
      swish(s, 380 * p, 1500 * p, 0, 0.17, 1.1, 0.7, 0.55);
      s.tone({ f: 110 * p, f2: 72 * p, sw: 0.14, dur: 0.18, v: 0.14, a: 0.06, d: 0.1, s: 0.2, filter: { t: 'lowpass', f: 600 } });
      body(s, 0.16, 120 * p, 80, 0.07, 0.25, 0.1);
    },
  }),
  old_atk_w_samurai: swing({
    rank: 3,
    db: 2.5,
    len: 0.16,
    ms: [50, 160],
    lp: 7500,
    build(s, v) {
      // A katana leaving its sheath: a thin fast "shing", a narrow noise band that rises through 2 to 4 kHz, and the blade's own ring.
      const p = v.j(0.05);
      air(s, { dur: 0.065, v: 1, a: 0.012, d: 0.04, s: 0.02, filter: [{ t: 'highpass', f: 1400 }, { t: 'bandpass', f: 2300 * p, f2: 4300 * p, sw: 0.05, q: 2.2 }] });
      s.tone({ f: 2640 * p, f2: 2900 * p, sw: 0.05, at: 0.012, dur: 0.12, v: 0.22, a: 0.004, d: 0.1, s: 0.01 });
      body(s, 0.01, 190 * p, 130, 0.06, 0.18, 0.1);
    },
  }),
  old_atk_w_tiger: swing({
    rank: 4,
    len: 0.34,
    ms: [120, 340],
    gap: 0.12,
    build(s, v) {
      // A polearm: the widest whoosh in the game, a deep wind under it and a dull knock of the shaft at the end of the swing.
      const p = v.j(0.06);
      swish(s, 260 * p, 1300 * p, 0, 0.22, 1.2, 0.6, 0.6);
      air(s, { kind: 'brown', dur: 0.22, v: 0.5, a: 0.08, d: 0.12, s: 0.1, filter: { t: 'lowpass', f: 520 } });
      body(s, 0.14, 100 * p, 60, 0.1, 0.3, 0.3);
      knock(s, 280 * p, 0.17, 0.3, 0.05);
    },
  }),
  old_atk_r_sling: swing({
    rank: 0,
    len: 0.13,
    ms: [25, 130],
    gap: 0.07,
    build(s, v) {
      // A slingshot: the rubber snaps forward (a fast downward glide with a tick) and the pebble hisses away.
      const p = v.j(0.06);
      s.tone({ f: 980 * p, f2: 210 * p, sw: 0.03, dur: 0.07, v: 1, a: 0.002, d: 0.06, s: 0.01 });
      rap(s, 0, 2600 * p, 0.01, 0.5, 1.2);
      s.tone({ f: 1500 * p, f2: 2200 * p, sw: 0.05, at: 0.02, dur: 0.07, v: 0.12, a: 0.015, d: 0.05, s: 0.02 });
    },
  }),
  old_atk_r_archer: swing({
    rank: 1,
    len: 0.24,
    ms: [80, 240],
    gap: 0.09,
    build(s, v) {
      // A bow: the string's twang (a triangle with a closing low-pass sagging a little) and its octave, then the arrow's whistle.
      const p = v.j(0.05);
      s.tone({ w: 'triangle', f: 196 * p, f2: 188 * p, sw: 0.1, dur: 0.18, v: 0.8, a: 0.002, d: 0.17, s: 0.01, filter: { t: 'lowpass', f: 1800, f2: 400, sw: 0.14, q: 1.2 } });
      s.tone({ f: 392 * p, f2: 380 * p, sw: 0.08, dur: 0.1, v: 0.3, a: 0.002, d: 0.09, s: 0.01 });
      rap(s, 0, 1800, 0.01, 0.4, 1);
      whistle(s, 0.03, 2700 * p, 1900 * p, 0.09, 0.4);
    },
  }),
  old_atk_r_ninja: swing({
    rank: 2,
    db: 2.5,
    len: 0.18,
    ms: [50, 180],
    lp: 7500,
    build(s, v) {
      // A shuriken spinning away: noise chopped at 55 Hz (the blades) climbing from 1.9 to 3.1 kHz, a thin whoosh and a tiny ring of the edge.
      const p = v.j(0.05);
      air(s, { dur: 0.11, v: 0.9, a: 0.01, d: 0.07, s: 0.05, trem: { rate: 55, depth: 0.85 }, filter: { t: 'bandpass', f: 1900 * p, f2: 3100 * p, sw: 0.08, q: 1.6 } });
      swish(s, 1400 * p, 2800 * p, 0, 0.08, 0.4, 1, 0.4);
      tink(s, 0, 2300 * p, 0.05, 0.2);
    },
  }),
  old_atk_r_gunner: swing({
    rank: 3,
    db: 2,
    len: 0.22,
    ms: [60, 220],
    gap: 0.09,
    build(s, v) {
      // A cork gun: a hollow "pop" (a sine dropping 540 to 200 Hz), the puff of air, a tiny squeak of the cork and a soft recoil thump.
      const p = v.j(0.05);
      s.tone({ f: 540 * p, f2: 200 * p, sw: 0.03, dur: 0.07, v: 1, a: 0.002, d: 0.06, s: 0.01 });
      air(s, { dur: 0.035, v: 0.6, a: 0.002, d: 0.03, s: 0.01, filter: { t: 'bandpass', f: 900 * p, q: 1.1 } });
      s.tone({ f: 1750 * p, f2: 2500 * p, sw: 0.025, at: 0.012, dur: 0.035, v: 0.16, a: 0.004, d: 0.03, s: 0.02 });
      body(s, 0.02, 130 * p, 70, 0.1, 0.5, 0.3);
    },
  }),
  old_atk_r_star: swing({
    rank: 4,
    len: 0.34,
    ms: [100, 340],
    gap: 0.1,
    build(s, v) {
      // A moonlit bow: a soft glassy chime (E6) in a tiny echo, a low bowstring that sags, a whistle of the arrow and a breath of moonlight.
      const p = v.j(0.04);
      const e = s.echo(0.05, 0.22, 0.22, 4500);
      bell(s, hz('E6') * p, 0.02, 0.26, 0.5, { bus: e, amt: 0.3 });
      s.tone({ w: 'triangle', f: 147 * p, f2: 140 * p, sw: 0.1, dur: 0.18, v: 0.55, a: 0.003, d: 0.16, s: 0.01, filter: { t: 'lowpass', f: 1200, f2: 350, sw: 0.14 } });
      whistle(s, 0.04, 2400 * p, 1700 * p, 0.1, 0.3);
      dust(s, 0, 0.16, 0.2, 3000, 1800);
    },
  }),
  old_atk_m_fire: swing({
    rank: 1,
    len: 0.26,
    ms: [80, 260],
    gap: 0.09,
    build(s, v) {
      // A match struck: a rough scratch (noise chopped at 100 Hz rising through 2.3 to 3.6 kHz) and the whoosh of the flame taking hold.
      const p = v.j(0.05);
      crackle(s, 0, 0.045, 2300 * p, 0.8, 100, 3600 * p);
      air(s, { kind: 'pink', at: 0.04, dur: 0.17, v: 1, a: 0.05, d: 0.08, s: 0.1, filter: { t: 'lowpass', f: 450, f2: 2600 * p, sw: 0.1, q: 0.7 } });
    },
  }),
  old_atk_m_storm: swing({
    rank: 2,
    db: 1.5,
    len: 0.22,
    ms: [60, 220],
    lp: 7500,
    build(s, v) {
      // Lightning gathering: a crackle gliding down from 2.6 to 1.2 kHz, then a paper being torn open (a band that zips up from 0.7 to 3.6 kHz, chopped at 130 Hz).
      const p = v.j(0.05);
      crackle(s, 0, 0.08, 2600 * p, 0.8, 80, 1200 * p);
      air(s, { kind: 'pink', at: 0.03, dur: 0.1, v: 0.7, a: 0.006, d: 0.08, s: 0.02, trem: { rate: 130, depth: 0.9 }, filter: { t: 'bandpass', f: 700 * p, f2: 3600 * p, sw: 0.08, q: 1.1 } });
    },
  }),
  old_atk_m_frost: swing({
    rank: 3,
    len: 0.28,
    ms: [90, 280],
    lp: 7500,
    build(s, v) {
      // Ice crystals tinkling (three pings stepping up, 35 ms apart, in a short echo) over a cold gust of band-passed breath.
      const p = v.j(0.04);
      const e = s.echo(0.04, 0.22, 0.22, 5000);
      [2093, 2637, 3136].forEach((f, k) => tink(s, k * 0.035, f * p, 0.1, 0.5 - k * 0.05, { bus: e, amt: 0.3 }));
      air(s, { kind: 'pink', dur: 0.16, v: 0.5, a: 0.05, d: 0.08, s: 0.05, filter: [{ t: 'highpass', f: 1300 }, { t: 'bandpass', f: 2200 * p, f2: 3000 * p, sw: 0.1, q: 0.8 }] });
    },
  }),
  old_atk_m_cosmo: swing({
    rank: 4,
    len: 0.3,
    ms: [100, 300],
    gap: 0.12,
    build(s, v) {
      // The black hole inhales: a "whoomp" played backwards. A low swell whose low-pass opens from 140 Hz to 1.7 kHz and a sine
      // climbing 55 to 230 Hz, both cut off right at the top instead of fading.
      const p = v.j(0.05);
      air(s, { kind: 'pink', dur: 0.2, v: 1, a: 0.18, d: 0, s: 1, r: 0.02, filter: { t: 'lowpass', f: 140, f2: 1700 * p, sw: 0.18, q: 0.8 } });
      s.tone({ f: 55 * p, f2: 230 * p, sw: 0.18, dur: 0.2, v: 0.7, a: 0.17, d: 0, s: 1, r: 0.02, sat: 0.3 });
    },
  }),
  old_atk_t_bell: swing({
    rank: 0,
    len: 0.26,
    ms: [60, 260],
    gap: 0.1,
    build(s, v) {
      // A hand bell: one ding (E6) with its inharmonic partials and the tick of the clapper.
      const p = v.j(0.04);
      bell(s, hz('E6') * p, 0, 0.2, 1);
      rap(s, 0, 2400, 0.01, 0.4, 1);
    },
  }),
  old_atk_t_chef: swing({
    rank: 1,
    db: 2,
    len: 0.2,
    ms: [60, 200],
    build(s, v) {
      // A frying pan tossed: a swish, the pan wobbling in the air (a sine at 330 Hz sagging under a fast wobble) and the tick of the handle.
      const p = v.j(0.05);
      swish(s, 800 * p, 2200 * p, 0, 0.09, 0.9, 1, 0.4);
      boing(s, 0, 330 * p, 300 * p, 0.14, 0.3, 22, 40);
      knock(s, 880 * p, 0, 0.3, 0.02);
    },
  }),
  old_atk_t_bard: swing({
    rank: 2,
    db: 1,
    len: 0.28,
    ms: [100, 260],
    gap: 0.1,
    build(s, v) {
      // A lute pluck that walks up a G chord (G4 B4 D5 G5, 45 ms apart).
      const p = v.j(0.04);
      [hz('G4'), hz('B4'), hz('D5'), hz('G5')].forEach((f, k) => pluck(s, f * p, k * 0.045, 0.13, 0.7 - k * 0.05));
    },
  }),
  old_atk_t_alch: swing({
    rank: 3,
    db: 2,
    len: 0.24,
    ms: [80, 240],
    lp: 7500,
    build(s, v) {
      // A glass vial: a clink of the glass, a bubble in the liquid and a fizz that starts as the cork lifts.
      const p = v.j(0.05);
      bell(s, 1760 * p, 0, 0.07, 0.8);
      bubble(s, 0.03, 420 * p, 0.4, 0.06);
      crackle(s, 0.04, 0.13, 3000 * p, 0.5, 45);
    },
  }),
  old_atk_t_lucky: swing({
    rank: 4,
    len: 0.32,
    ms: [100, 320],
    gap: 0.1,
    build(s, v) {
      // A coin flipped: the thumb's snap, a soft whoosh, and the coin ringing as it spins (a sine at 2.2 kHz warbling as the spin slows).
      const p = v.j(0.04);
      snap(s, 0, 0.4, 3000, 0.008);
      swish(s, 1200 * p, 2400 * p, 0, 0.07, 0.4, 1, 0.4);
      s.tone({ f: 2180 * p, dur: 0.24, v: 0.5, a: 0.002, d: 0.22, s: 0.02, vib: { rate: 18, cents: 35 } });
      s.tone({ f: 2180 * 2.76 * p, dur: 0.08, v: 0.08, a: 0.002, s: 0.01 });
    },
  }),
  old_imp_w_paw: impact({
    rank: 0,
    db: -1,
    len: 0.12,
    ms: [30, 120],
    build(s, v) {
      // A glove on a cushion: a short low pat, the slap of the leather (a band around 1 kHz) and a thin bite on top.
      const p = v.j(0.06);
      body(s, 0, 240 * p, 120, 0.07, 1, 0.3);
      air(s, { dur: 0.03, v: 0.7, a: 0.002, d: 0.02, s: 0.01, filter: { t: 'bandpass', f: 1000 * p, q: 0.8 } });
      snap(s, 0, 0.35, 3000, 0.008);
    },
  }),
  old_imp_w_sword: impact({
    rank: 1,
    db: 4,
    len: 0.13,
    ms: [40, 130],
    build(s, v) {
      // Wood on wood: a loud clack, a dull thud of the cushion behind it and the crisp bite.
      const p = v.j(0.06);
      clack(s, 0, 640 * p, 1, 0.09);
      body(s, 0, 200 * p, 110, 0.08, 0.8, 0.2);
      snap(s, 0, 0.8, 3200, 0.012);
    },
  }),
  old_imp_w_viking: impact({
    rank: 2,
    len: 0.3,
    ms: [100, 300],
    prio: 1,
    build(s, v) {
      // The blade bites: a chunky low thud, the burst of chopped wood, a hard snap, and a short metallic ring where the steel rings.
      const p = v.j(0.06);
      body(s, 0, 170 * p, 62, 0.13, 1, 0.45);
      air(s, { dur: 0.045, v: 0.9, a: 0.002, d: 0.035, s: 0.01, filter: { t: 'lowpass', f: 2200 * p, f2: 600, sw: 0.04 } });
      snap(s, 0, 0.6, 3000, 0.012);
      bell(s, 1180 * p, 0.012, 0.18, 0.4);
    },
  }),
  old_imp_w_samurai: impact({
    rank: 3,
    db: 3,
    len: 0.24,
    ms: [60, 200],
    lp: 7500,
    prio: 1,
    build(s, v) {
      // A clean cut: a crisp snap, a falling "tsk" of the edge, a light low cut-through and a thin ring that carries on.
      const p = v.j(0.05);
      snap(s, 0, 0.7, 3600, 0.01);
      s.tone({ f: 3100 * p, f2: 2300 * p, sw: 0.04, dur: 0.07, v: 0.5, a: 0.002, d: 0.06, s: 0.01 });
      body(s, 0.003, 210 * p, 110, 0.1, 0.7, 0.2);
      bell(s, 1560 * p, 0.006, 0.22, 0.4);
    },
  }),
  old_imp_w_tiger: impact({
    rank: 4,
    db: 1,
    len: 0.42,
    ms: [150, 420],
    prio: 1,
    build(s, v) {
      // The deepest thud: a low drop and a second body above it, the whack of the pole, a burst of broken wood and a settling cloud of dust.
      const p = v.j(0.06);
      body(s, 0, 150 * p, 48, 0.24, 1, 0.5);
      body(s, 0, 95 * p, 60, 0.16, 0.6, 0.3);
      clack(s, 0, 430 * p, 0.7, 0.06);
      air(s, { dur: 0.07, v: 0.8, a: 0.002, d: 0.05, s: 0.01, filter: { t: 'lowpass', f: 2400, f2: 500, sw: 0.06 } });
      snap(s, 0, 0.6, 2800, 0.012);
      dust(s, 0.03, 0.2, 0.3, 1200, 500);
    },
  }),
  old_imp_r_sling: impact({
    rank: 0,
    db: -1.5,
    len: 0.1,
    ms: [25, 100],
    build(s, v) {
      // A pebble on cardboard: one dry tok and a small bite.
      const p = v.j(0.06);
      knock(s, 560 * p, 0, 0.9, 0.04, 0.8);
      snap(s, 0, 1.8, 3000, 0.008);
    },
  }),
  old_imp_r_archer: impact({
    rank: 1,
    db: 4,
    len: 0.24,
    ms: [60, 240],
    build(s, v) {
      // An arrow into a wooden board: the thunk, the bite, and the shaft quivering for a moment afterwards.
      const p = v.j(0.06);
      knock(s, 380 * p, 0, 1, 0.05, 0.75);
      snap(s, 0, 0.6, 2600, 0.008);
      s.tone({ f: 980 * p, f2: 900 * p, sw: 0.1, at: 0.02, dur: 0.16, v: 0.3, a: 0.004, d: 0.13, s: 0.01, trem: { rate: 14, depth: 0.7 } });
    },
  }),
  old_imp_r_ninja: impact({
    rank: 2,
    db: 1.5,
    len: 0.22,
    ms: [60, 220],
    lp: 7500,
    build(s, v) {
      // Steel on tin: a hard tink and a thunk, then a smaller tink as the star bounces.
      const p = v.j(0.05);
      tink(s, 0, 2050 * p, 0.09, 0.8);
      knock(s, 480 * p, 0, 0.5, 0.03, 0.8);
      tink(s, 0.055, 1750 * p, 0.07, 0.45);
      knock(s, 420 * p, 0.055, 0.25, 0.025);
    },
  }),
  old_imp_r_gunner: impact({
    rank: 3,
    db: -0.5,
    len: 0.18,
    ms: [50, 180],
    prio: 1,
    build(s, v) {
      // A cork on a tin plate: a dry tok, the ring of the tin and a low thud behind it.
      const p = v.j(0.05);
      knock(s, 760 * p, 0, 0.8, 0.04);
      bell(s, 1500 * p, 0, 0.14, 0.55);
      snap(s, 0, 1.4, 3200, 0.01);
      body(s, 0, 180 * p, 100, 0.09, 0.9, 0.3);
    },
  }),
  old_imp_r_star: impact({
    rank: 4,
    len: 0.4,
    ms: [150, 400],
    prio: 1,
    build(s, v) {
      // A star lands: two glassy pings (B6 then E6) in an echo, a soft "pof" under them and a faint bite.
      const p = v.j(0.04);
      const e = s.echo(0.05, 0.24, 0.24, 4500);
      bell(s, hz('B6') * p, 0, 0.26, 0.6, { bus: e, amt: 0.3 });
      bell(s, hz('E6') * p, 0.04, 0.22, 0.5, { bus: e, amt: 0.3 });
      body(s, 0, 280 * p, 150, 0.08, 0.7, 0.25);
      snap(s, 0, 0.4, 3200, 0.01);
    },
  }),
  old_imp_m_snow: impact({
    rank: 0,
    len: 0.16,
    ms: [40, 160],
    build(s, v) {
      // "Pof": a muffled burst of powder through a closing low-pass, a soft low thump and a little crunch of packed snow.
      const p = v.j(0.06);
      air(s, { dur: 0.07, v: 1, a: 0.003, d: 0.05, s: 0.01, filter: { t: 'lowpass', f: 1500 * p, f2: 500, sw: 0.05 } });
      body(s, 0, 210 * p, 100, 0.09, 0.6, 0.2);
      crackle(s, 0.012, 0.05, 2200 * p, 0.3, 70);
      snap(s, 0, 0.25, 2600, 0.008);
    },
  }),
  old_imp_m_fire: impact({
    rank: 1,
    len: 0.3,
    ms: [100, 300],
    prio: 1,
    build(s, v) {
      // A flame catching: a burst of low-passed noise, a low whump, the crackle of embers after it and a small bite.
      const p = v.j(0.06);
      air(s, { dur: 0.1, v: 0.9, a: 0.003, d: 0.08, s: 0.01, filter: { t: 'lowpass', f: 1400 * p, f2: 350, sw: 0.09 } });
      body(s, 0, 140 * p, 60, 0.14, 0.9, 0.35);
      crackle(s, 0.03, 0.15, 2600 * p, 0.5, 55);
      snap(s, 0, 0.5, 3000, 0.01);
    },
  }),
  old_imp_m_storm: impact({
    rank: 2,
    db: 3,
    len: 0.26,
    ms: [80, 260],
    lp: 7500,
    prio: 1,
    build(s, v) {
      // The bolt lands: a hard crack, a triangle falling from 1 kHz to 230 Hz (the charge draining), a low thump and a short crackle.
      const p = v.j(0.05);
      snap(s, 0, 1, 3300 * p, 0.014);
      s.tone({ w: 'triangle', f: 1000 * p, f2: 230 * p, sw: 0.07, dur: 0.1, v: 0.55, a: 0.002, d: 0.08, s: 0.01, filter: { t: 'lowpass', f: 2400 } });
      body(s, 0, 130 * p, 70, 0.1, 0.6, 0.3);
      crackle(s, 0.02, 0.13, 2400 * p, 0.5, 85);
    },
  }),
  old_imp_m_frost: impact({
    rank: 3,
    db: 1.5,
    len: 0.28,
    ms: [80, 280],
    lp: 7500,
    prio: 1,
    build(s, v) {
      // A crystal shatters: a bright snap, three pings in a cluster, the crunch of ice (noise chopped at 65 Hz) and a small low body.
      const p = v.j(0.05);
      snap(s, 0, 0.8, 3600, 0.01);
      [1800, 2430, 3050].forEach((f, k) => tink(s, k * 0.012, f * p, 0.09, 0.5));
      air(s, { dur: 0.1, v: 0.4, a: 0.003, d: 0.08, s: 0.02, trem: { rate: 65, depth: 0.9 }, filter: { t: 'lowpass', f: 3200, f2: 1200, sw: 0.09 } });
      body(s, 0, 190 * p, 100, 0.08, 0.4, 0.2);
    },
  }),
  old_imp_m_cosmo: impact({
    rank: 4,
    len: 0.55,
    ms: [180, 540],
    prio: 1,
    build(s, v) {
      // The "whoomp" the right way round: a huge low drop, a second body above it, a brown rumble sinking away, a vacuum "plop" and a faint bite.
      const p = v.j(0.05);
      body(s, 0, 200 * p, 38, 0.32, 1, 0.5);
      body(s, 0, 110 * p, 50, 0.22, 0.6, 0.3);
      air(s, { kind: 'brown', dur: 0.26, v: 0.7, a: 0.003, d: 0.2, s: 0.01, filter: { t: 'lowpass', f: 900, f2: 200, sw: 0.2 } });
      s.tone({ f: 380 * p, f2: 140, sw: 0.05, dur: 0.07, v: 0.35, a: 0.003, d: 0.06, s: 0.01 });
      snap(s, 0, 0.9, 2800, 0.01);
    },
  }),
  old_imp_t_bell: impact({
    rank: 0,
    db: -2,
    len: 0.16,
    ms: [40, 160],
    build(s, v) {
      // A smaller, lower tink (A5) with a soft pat under it.
      const p = v.j(0.04);
      bell(s, hz('A5') * p, 0, 0.09, 0.9);
      body(s, 0, 260 * p, 160, 0.04, 0.5, 0.1);
      snap(s, 0, 0.9, 3000, 0.008);
    },
  }),
  old_imp_t_chef: impact({
    rank: 1,
    len: 0.32,
    ms: [100, 300],
    prio: 1,
    build(s, v) {
      // A tinny clang: the inharmonic partials of a thin pan (640, 1390, 2160 and 3100 Hz) dying at different speeds, a burst of noise and a low thud.
      const p = v.j(0.05);
      [640, 1390, 2160, 3100].forEach((f, k) => s.tone({ f: f * p, dur: 0.15 - k * 0.025, v: 0.9 - k * 0.15, a: 0.002, d: 0.14 - k * 0.025, s: 0.01 }));
      air(s, { dur: 0.025, v: 0.9, a: 0.001, d: 0.02, s: 0.01, filter: { t: 'bandpass', f: 3000, q: 0.7 } });
      body(s, 0, 190 * p, 110, 0.07, 0.3, 0.2);
    },
  }),
  old_imp_t_bard: impact({
    rank: 2,
    len: 0.22,
    ms: [60, 220],
    build(s, v) {
      // One plink: two plucked strings a fourth apart (D5 and G5), a slap of the string and the thump of the lute's belly.
      const p = v.j(0.04);
      pluck(s, hz('D5') * p, 0, 0.14, 1);
      pluck(s, hz('G5') * p, 0.004, 0.12, 0.7);
      snap(s, 0, 0.9, 3000, 0.01);
      body(s, 0, 200 * p, 130, 0.05, 0.3, 0.1);
    },
  }),
  old_imp_t_alch: impact({
    rank: 3,
    len: 0.36,
    ms: [110, 360],
    lp: 7500,
    prio: 1,
    build(s, v) {
      // A fizzing splash: a burst of wet noise, three bubbles, a fizz tail, a plop of the liquid and a last shard of glass.
      const p = v.j(0.05);
      air(s, { dur: 0.1, v: 0.8, a: 0.003, d: 0.08, s: 0.02, filter: { t: 'bandpass', f: 1800 * p, f2: 900 * p, sw: 0.09, q: 0.8 } });
      [360, 480, 300].forEach((f, k) => bubble(s, 0.02 + k * 0.04, f * p, 0.5, 0.07));
      crackle(s, 0.03, 0.22, 3400 * p, 0.4, 45);
      body(s, 0, 240 * p, 130, 0.07, 0.4, 0.1);
      bell(s, 2600 * p, 0.02, 0.06, 0.2);
    },
  }),
  old_imp_t_lucky: impact({
    rank: 4,
    len: 0.3,
    ms: [90, 300],
    lp: 7500,
    prio: 1,
    build(s, v) {
      // Coins landing: four metallic clinks (1.85, 2.35, 1.6 and 2.8 kHz) one after another, and a soft thud of the pile.
      const p = v.j(0.05);
      snap(s, 0, 0.8, 3200, 0.01);
      [1850, 2350, 1600, 2800].forEach((f, k) => tink(s, k * 0.03, f * p, 0.07, 0.8 - k * 0.1));
      body(s, 0, 190 * p, 110, 0.07, 0.45, 0.15);
    },
  }),

  // ---------------------------------------------------------------- the layers of the fight and the boss cues (as they were)
  old_hit_heavy: {
    cat: 'hit',
    trim: 4,
    len: 0.2,
    ms: [60, 220],
    lp: 6500,
    variants: 3,
    rate: 0.05,
    prio: 1,
    rule: { maxVoices: 2, minGap: 0.09, falloff: 0.15 },
    build(s, v) {
      // The weight under a heavy blow, a killing blow or a hit on a boss. It rides on the weapon's own impact and never replaces it:
      // a low drop through 170 to 80 Hz with a little saturation (the body), a closing low-passed slap, a woody crack and a bite.
      const p = v.j(0.06);
      body(s, 0, 170 * p, 80, 0.14, 1, 0.4);
      s.noise({ dur: 0.07, v: 0.6, a: 0.002, s: 0.005, filter: { t: 'lowpass', f: 2200, f2: 600, sw: 0.06 } });
      clack(s, 0, 420 * p, 0.35, 0.04);
      snap(s, 0, 0.45, 3400, 0.012);
    },
  },
  old_crit: {
    cat: 'hit',
    trim: 3,
    len: 0.18,
    ms: [40, 200],
    lp: 7500,
    variants: 3,
    rate: 0.03,
    prio: 2,
    rule: { maxVoices: 3, minGap: 0.09, falloff: 0.1 },
    build(s, v) {
      // The crit layer, always played together with the weapon's own impact (never in place of it, so a crit is the same weapon with
      // more): a bright crack at 4.2 kHz, a ping (a sine at 2.4 kHz and its fifth, quickly gone) and a low body underneath.
      const p = v.j(0.03);
      snap(s, 0, 1, 4200 * p, 0.014);
      s.tone({ f: 2400 * p, dur: 0.13, v: 0.45, a: 0.002, d: 0.11, s: 0.01 });
      s.tone({ f: 3600 * p, dur: 0.07, v: 0.2, a: 0.002, s: 0.01 });
      body(s, 0, 150 * p, 80, 0.1, 0.8, 0.3);
    },
  },
  old_explosion: {
    cat: 'combat',
    trim: 3,
    len: 0.7,
    ms: [200, 650],
    variants: 2,
    rule: { maxVoices: 3, minGap: 0.12, falloff: 0.1 },
    build(s, v) {
      // A paper bag popped: a noise burst through a closing low-pass (the bang), a brown whump and a sine drop for the
      // weight, and a flutter of confetti settling after it. No fireball, nothing above 4 kHz that matters.
      const p = v.j(0.08);
      s.noise({ dur: 0.3, v: 1.2, a: 0.003, s: 0.01, filter: { t: 'lowpass', f: 3600 * p, f2: 500, sw: 0.18, q: 0.7 } });
      s.noise({ kind: 'brown', dur: 0.3, v: 0.15, a: 0.005, s: 0.01, filter: { t: 'lowpass', f: 700, f2: 250, sw: 0.25 } });
      s.tone({ f: 220 * p, f2: 110, sw: 0.15, dur: 0.22, v: 0.35, a: 0.004, sat: 0.3 });
      s.noise({ at: 0.04, dur: 0.3, v: 0.18, a: 0.02, s: 0.05, trem: { rate: 30, depth: 0.9 }, filter: { t: 'bandpass', f: 3600, q: 0.7 } });
    },
  },
  old_boss_warning: {
    cat: 'big',
    trim: -3,
    len: 1.55,
    ms: [800, 1450],
    build(s) {
      // A low mallet roll, no siren: nine felt-mallet hits on a big box that speed up and swell, then one deep hit.
      // A wooden knock rides on every hit and saturation puts harmonics above the 150 Hz fundamental, so a phone speaker can still play the roll.
      let t = 0;
      for (let k = 0; k < 9; k++) {
        thump(s, 150, 105, t, 0.14, 0.25 + k * 0.05, 0.06, 0.4);
        knock(s, 300, t, 0.5 + k * 0.04, 0.05);
        t += 0.125 - k * 0.008;
      }
      thump(s, 130, 70, t + 0.02, 0.5, 0.8, 0.25, 0.4);
      knock(s, 260, t + 0.02, 0.8, 0.12);
      s.noise({ dur: 0.9, v: 0.15, a: 0.5, s: 0.5, filter: { t: 'lowpass', f: 400 }, kind: 'brown' });
    },
  },
  old_boss_roar: {
    cat: 'big',
    trim: -1,
    len: 1.2,
    ms: [700, 1250],
    build(s) {
      // A big drum hit and a low upright-bass note that sags a fourth (262 to 196 Hz) with a slow vibrato, over a rumble of
      // brown noise and a rustle of paper. It is a heavy footstep, not a growl.
      thump(s, 140, 60, 0, 0.6, 0.9, 0.35, 0.4);
      s.tone({ w: 'triangle', f: 262, f2: 196, sw: 0.5, dur: 0.75, v: 0.6, a: 0.04, s: 0.6, r: 0.2, vib: { rate: 5, cents: 25, delay: 0.15 }, filter: { t: 'lowpass', f: 900 } });
      s.noise({ kind: 'brown', dur: 0.9, v: 0.3, a: 0.08, s: 0.3, filter: { t: 'lowpass', f: 500, f2: 250, sw: 0.8 } });
      s.noise({ kind: 'pink', at: 0.05, dur: 0.8, v: 0.3, a: 0.1, s: 0.3, trem: { rate: 20, depth: 0.5 }, filter: [{ t: 'highpass', f: 300 }, { t: 'bandpass', f: 900, f2: 500, sw: 0.7, q: 0.8 }] });
    },
  },

  // ---------------------------------------------------------------- what an enemy answers a hit with (as they were)
  old_foe_juicy_hit: foe({
    len: 0.14,
    ms: [30, 140],
    build(s, v) {
      // A cucumber is hit: a wet squish (noise sliding down through 800 to 450 Hz), a plop and a crisp crunch on top.
      const p = v.j(0.06);
      air(s, { dur: 0.05, v: 1, a: 0.003, d: 0.04, s: 0.01, filter: { t: 'bandpass', f: 800 * p, f2: 450 * p, sw: 0.04, q: 1 } });
      s.tone({ f: 420 * p, f2: 230 * p, sw: 0.04, dur: 0.07, v: 0.7, a: 0.003, d: 0.06, s: 0.01 });
      snap(s, 0, 0.2, 2400, 0.008);
    },
  }),
  old_foe_fluff_hit: foe({
    len: 0.12,
    ms: [30, 120],
    build(s, v) {
      // A dust bunny: a soft "pff", a slow-attack puff of pink noise through a falling low-pass, and almost no thud.
      const p = v.j(0.06);
      air(s, { kind: 'pink', dur: 0.07, v: 1, a: 0.012, d: 0.045, s: 0.02, filter: { t: 'lowpass', f: 1100 * p, f2: 450, sw: 0.05 } });
      thump(s, 170 * p, 110, 0, 0.05, 0.3, 0.03);
    },
  }),
  old_foe_water_hit: foe({
    len: 0.12,
    ms: [30, 120],
    build(s, v) {
      // A drop is hit: a "plip" (a sine climbing 520 to 950 Hz) and a wet tick.
      const p = v.j(0.06);
      s.tone({ f: 520 * p, f2: 950 * p, sw: 0.035, dur: 0.07, v: 1, a: 0.003, d: 0.06, s: 0.01 });
      air(s, { dur: 0.02, v: 0.35, a: 0.002, d: 0.015, s: 0.01, filter: { t: 'bandpass', f: 2000 * p, q: 1 } });
    },
  }),
  old_foe_rubber_hit: foe({
    len: 0.14,
    ms: [30, 140],
    build(s, v) {
      // A balloon is hit: a boing (a sine climbing 300 to 560 Hz under a wobble) and the squeak of stretched rubber.
      const p = v.j(0.06);
      boing(s, 0, 300 * p, 560 * p, 0.09, 0.8, 18, 60);
      s.tone({ w: 'triangle', f: 1000 * p, f2: 1500 * p, sw: 0.06, dur: 0.07, v: 0.22, a: 0.006, trem: { rate: 40, depth: 0.8 }, filter: { t: 'lowpass', f: 2400 } });
    },
  }),
  old_foe_plastic_hit: foe({
    len: 0.1,
    ms: [25, 100],
    build(s, v) {
      // Hard plastic: a hollow tok at 880 Hz, a second mode a little over an octave above it that dies in 20 ms, and a dry tick.
      const p = v.j(0.06);
      s.tone({ f: 880 * p, dur: 0.035, v: 1, a: 0.002, d: 0.03, s: 0.01 });
      s.tone({ f: 1950 * p, dur: 0.02, v: 0.5, a: 0.002, s: 0.01 });
      rap(s, 0, 2600 * p, 0.01, 0.4, 1.2);
    },
  }),
  old_foe_tin_hit: foe({
    len: 0.15,
    ms: [40, 150],
    build(s, v) {
      // A clock face tapped: a tink of thin metal (1.25 kHz) and a small spring answering with a wobble.
      const p = v.j(0.06);
      tink(s, 0, 1250 * p, 0.09, 0.8);
      boing(s, 0.01, 520 * p, 380 * p, 0.1, 0.3, 26, 70);
    },
  }),
  old_foe_motor_hit: foe({
    len: 0.14,
    ms: [40, 140],
    build(s, v) {
      // A robot vacuum is hit: a dull bonk on its shell and a hiccup of the motor (a low triangle shuddering).
      const p = v.j(0.06);
      knock(s, 340 * p, 0, 0.8, 0.05);
      s.tone({ w: 'triangle', f: 210 * p, f2: 150 * p, sw: 0.07, dur: 0.1, v: 0.35, a: 0.004, trem: { rate: 40, depth: 0.5 }, filter: { t: 'lowpass', f: 900 } });
      rap(s, 0, 1800, 0.01, 0.3, 1);
    },
  }),
  old_foe_paper_hit: foe({
    len: 0.1,
    ms: [25, 100],
    build(s, v) {
      // A firecracker: a dry tap on a paper tube, its hollow knock and a puff of powder.
      const p = v.j(0.06);
      grain(s, 0, 1300 * p, 0.5, 0.03);
      knock(s, 620 * p, 0, 0.9, 0.04, 0.85);
    },
  }),
  old_foe_glass_hit: foe({
    len: 0.14,
    ms: [30, 140],
    build(s, v) {
      // Glass tapped: a clean high tink (1.9 kHz) with one partial that dies first.
      const p = v.j(0.05);
      tink(s, 0, 1900 * p, 0.09, 1);
    },
  }),
  old_foe_cloud_hit: foe({
    len: 0.2,
    ms: [50, 200],
    build(s, v) {
      // A storm cloud is hit: a soft low thud (90 Hz), a brown rumble that rolls away and a faint low tone.
      const p = v.j(0.06);
      body(s, 0, 110 * p, 70, 0.1, 0.7, 0.2);
      air(s, { kind: 'brown', dur: 0.14, v: 0.8, a: 0.01, d: 0.1, s: 0.03, filter: { t: 'lowpass', f: 400 * p, f2: 160, sw: 0.1 } });
    },
  }),
} satisfies Partial<Record<SfxId, Recipe>>;

export const BEFORE_RECIPES = Object.fromEntries(
  Object.entries(RAW).map(([id, r]) => [id, { ...r, legacy: true as const, seed: `sfx:${id.slice(4)}` }]),
) as unknown as Record<keyof typeof RAW, Recipe>;

/** The ids of the old versions. */
export const LEGACY_IDS = Object.keys(RAW) as Array<keyof typeof RAW>;
