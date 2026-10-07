/**
 * Recipes: the weapon of every cat, as two moments. The RELEASE (`atk_*`) is the attack leaving the cat: a swish, a twang, a
 * pop, a match strike. The IMPACT (`imp_*`) is that same weapon landing on an enemy: a clack, a bite, a thud, a ping. A class
 * line is one family that grows: every rank is longer, louder and heavier than the one before (`RANK_TRIM`, the layers each
 * recipe adds) while keeping the colour of its class: the warriors swing and thud, the rangers launch and tick, the mages whoosh
 * and ring, the tricksters clink and pluck. Both halves are short and baked in three variants (the pitch of a variant moves
 * by a few percent), because a crowded wave plays them dozens of times a second.
 */
import type { SfxId } from './api';
import { air, body, boing, bubble, clack, crackle, dust, rap, snap, swish, tink, whistle } from './foley';
import { bell, knock, pluck, type Recipe } from './recipe';
import { hz } from './theory';

/** Extra level in dB per rank inside a class line, weakest first: the step must be audible, not just measurable. */
const RANK_TRIM = [0, 1.2, 2.4, 3.8, 5.4] as const;

interface Spec {
  /** 0 (common) to 4 (mythic): the place in the class line. */
  rank: 0 | 1 | 2 | 3 | 4;
  len: number;
  ms: readonly [number, number];
  /** Minimum seconds between two starts of this one sound. */
  gap?: number;
  prio?: number;
  /** Low-pass of the finished render; bright blades and ice open it up. */
  lp?: number;
  /** Level correction in dB on top of the rank's, to keep a line in order whatever the layers do to the normaliser. */
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

export const CAT_RECIPES = {
  // ---------------------------------------------------------------- warriors: the swing, then the contact
  atk_w_paw: swing({
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
  imp_w_paw: impact({
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
  atk_w_sword: swing({
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
  imp_w_sword: impact({
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
  atk_w_viking: swing({
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
  imp_w_viking: impact({
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
  atk_w_samurai: swing({
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
  imp_w_samurai: impact({
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
  atk_w_tiger: swing({
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
  imp_w_tiger: impact({
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

  // ---------------------------------------------------------------- rangers: the launch, then the landing
  atk_r_sling: swing({
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
  imp_r_sling: impact({
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
  atk_r_archer: swing({
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
  imp_r_archer: impact({
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
  atk_r_ninja: swing({
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
  imp_r_ninja: impact({
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
  atk_r_gunner: swing({
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
  imp_r_gunner: impact({
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
  atk_r_star: swing({
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
  imp_r_star: impact({
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

  // ---------------------------------------------------------------- mages: the cast, then the effect
  atk_m_snow: swing({
    rank: 0,
    len: 0.18,
    ms: [40, 180],
    build(s, v) {
      // A snowball thrown: a soft low swish with no hard edge and the pat of the hand letting go.
      const p = v.j(0.06);
      swish(s, 500 * p, 1500 * p, 0, 0.1, 0.9, 0.7, 0.5);
      body(s, 0.06, 220 * p, 150, 0.05, 0.25, 0.05);
    },
  }),
  imp_m_snow: impact({
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
  atk_m_fire: swing({
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
  imp_m_fire: impact({
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
  atk_m_storm: swing({
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
  imp_m_storm: impact({
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
  atk_m_frost: swing({
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
  imp_m_frost: impact({
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
  atk_m_cosmo: swing({
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
  imp_m_cosmo: impact({
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

  // ---------------------------------------------------------------- tricksters: toys that ring, clang and pluck
  atk_t_bell: swing({
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
  imp_t_bell: impact({
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
  atk_t_chef: swing({
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
  imp_t_chef: impact({
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
  atk_t_bard: swing({
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
  imp_t_bard: impact({
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
  atk_t_alch: swing({
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
  imp_t_alch: impact({
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
  atk_t_lucky: swing({
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
  imp_t_lucky: impact({
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
} satisfies Partial<Record<SfxId, Recipe>>;
