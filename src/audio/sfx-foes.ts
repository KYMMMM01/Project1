/**
 * Recipes: what an enemy is made of. The weapon's impact is the same everywhere; under it each material answers in its own
 * voice, so a cucumber squelches, a balloon squeaks and bursts, a clock springs apart, a cone clatters and the cloud rumbles.
 * Every material has a HIT reaction (short, rationed with the impact); most have a DEATH, and each boss has a long one of its
 * own. The same recipe serves several enemies with a pitch factor (see combat.ts): a tangerine is a small cucumber, a pill a
 * high plastic, a cone a low one.
 */
import type { SfxId } from './api';
import { air, body, boing, bubble, clack, crackle, dust, grain, rap, rattle, snap, squelch, swish, tink, whistle } from './foley';
import { bell, knock, thump, type Recipe } from './recipe';
import { hz } from './theory';

interface Spec {
  len: number;
  ms: readonly [number, number];
  variants?: number;
  prio?: number;
  /** Highest playStep climb in semitones (a kill streak lifts a death by a pentatonic ladder). */
  climb?: number;
  trim?: number;
  /** Which loudness tier: a reaction under a weapon, or the long last breath of a boss. */
  cat?: 'foe' | 'finale';
  rule?: Recipe['rule'];
  build: Recipe['build'];
}

function foe(o: Spec): Recipe {
  return {
    cat: o.cat ?? 'foe',
    trim: o.trim,
    len: o.len,
    ms: o.ms,
    lp: 6500,
    variants: o.variants ?? 3,
    rate: 0.05,
    prio: o.prio,
    climb: o.climb,
    rule: o.rule ?? { maxVoices: 2, minGap: 0.05, falloff: 0.15 },
    build: o.build,
  };
}

/** A death is heard once per kill: a handful at a time is the most the ear can separate. */
const DEATH = { maxVoices: 4, minGap: 0.04, falloff: 0.12 } as const;
/** A boss dies once. */
const FINALE = { maxVoices: 1, minGap: 0.5, falloff: 0 } as const;

export const FOE_RECIPES = {
  // ---------------------------------------------------------------- hit reactions
  foe_juicy_hit: foe({
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
  foe_fluff_hit: foe({
    len: 0.12,
    ms: [30, 120],
    build(s, v) {
      // A dust bunny: a soft "pff", a slow-attack puff of pink noise through a falling low-pass, and almost no thud.
      const p = v.j(0.06);
      air(s, { kind: 'pink', dur: 0.07, v: 1, a: 0.012, d: 0.045, s: 0.02, filter: { t: 'lowpass', f: 1100 * p, f2: 450, sw: 0.05 } });
      thump(s, 170 * p, 110, 0, 0.05, 0.3, 0.03);
    },
  }),
  foe_water_hit: foe({
    len: 0.12,
    ms: [30, 120],
    build(s, v) {
      // A drop is hit: a "plip" (a sine climbing 520 to 950 Hz) and a wet tick.
      const p = v.j(0.06);
      s.tone({ f: 520 * p, f2: 950 * p, sw: 0.035, dur: 0.07, v: 1, a: 0.003, d: 0.06, s: 0.01 });
      air(s, { dur: 0.02, v: 0.35, a: 0.002, d: 0.015, s: 0.01, filter: { t: 'bandpass', f: 2000 * p, q: 1 } });
    },
  }),
  foe_rubber_hit: foe({
    len: 0.14,
    ms: [30, 140],
    build(s, v) {
      // A balloon is hit: a boing (a sine climbing 300 to 560 Hz under a wobble) and the squeak of stretched rubber.
      const p = v.j(0.06);
      boing(s, 0, 300 * p, 560 * p, 0.09, 0.8, 18, 60);
      s.tone({ w: 'triangle', f: 1000 * p, f2: 1500 * p, sw: 0.06, dur: 0.07, v: 0.22, a: 0.006, trem: { rate: 40, depth: 0.8 }, filter: { t: 'lowpass', f: 2400 } });
    },
  }),
  foe_plastic_hit: foe({
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
  foe_tin_hit: foe({
    len: 0.15,
    ms: [40, 150],
    build(s, v) {
      // A clock face tapped: a tink of thin metal (1.25 kHz) and a small spring answering with a wobble.
      const p = v.j(0.06);
      tink(s, 0, 1250 * p, 0.09, 0.8);
      boing(s, 0.01, 520 * p, 380 * p, 0.1, 0.3, 26, 70);
    },
  }),
  foe_motor_hit: foe({
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
  foe_paper_hit: foe({
    len: 0.1,
    ms: [25, 100],
    build(s, v) {
      // A firecracker: a dry tap on a paper tube, its hollow knock and a puff of powder.
      const p = v.j(0.06);
      grain(s, 0, 1300 * p, 0.5, 0.03);
      knock(s, 620 * p, 0, 0.9, 0.04, 0.85);
    },
  }),
  foe_glass_hit: foe({
    len: 0.14,
    ms: [30, 140],
    build(s, v) {
      // Glass tapped: a clean high tink (1.9 kHz) with one partial that dies first.
      const p = v.j(0.05);
      tink(s, 0, 1900 * p, 0.09, 1);
    },
  }),
  foe_cloud_hit: foe({
    len: 0.2,
    ms: [50, 200],
    build(s, v) {
      // A storm cloud is hit: a soft low thud (90 Hz), a brown rumble that rolls away and a faint low tone.
      const p = v.j(0.06);
      body(s, 0, 110 * p, 70, 0.1, 0.7, 0.2);
      air(s, { kind: 'brown', dur: 0.14, v: 0.8, a: 0.01, d: 0.1, s: 0.03, filter: { t: 'lowpass', f: 400 * p, f2: 160, sw: 0.1 } });
    },
  }),

  // ---------------------------------------------------------------- deaths
  foe_juicy_die: foe({
    len: 0.45,
    ms: [150, 440],
    prio: 2,
    climb: 7,
    rule: DEATH,
    build(s, v) {
      // A cucumber snaps and squelches: a crack and a short "tok", a wet squelch sliding down through 1.5 kHz to 300 Hz, bubbles and a plop.
      const p = v.j(0.07);
      snap(s, 0, 0.9, 2800, 0.012);
      s.tone({ f: 1000 * p, f2: 520 * p, sw: 0.02, dur: 0.04, v: 0.5, a: 0.002, d: 0.035, s: 0.01 });
      squelch(s, 0.015, 0.2, 1500 * p, 300 * p, 0.9);
      bubble(s, 0.05, 260 * p, 0.4, 0.07);
      bubble(s, 0.12, 210 * p, 0.3, 0.07);
      body(s, 0.01, 200 * p, 90, 0.12, 0.6, 0.2);
    },
  }),
  foe_fluff_die: foe({
    len: 0.4,
    ms: [120, 400],
    prio: 2,
    climb: 7,
    rule: DEATH,
    build(s, v) {
      // A dust bunny poofs: a cloud of dust sinking from 1.8 kHz to 400 Hz, a flutter of fluff settling, a soft thud and a tiny squeak.
      const p = v.j(0.07);
      dust(s, 0, 0.25, 1, 1800 * p, 400);
      air(s, { kind: 'pink', at: 0.03, dur: 0.2, v: 0.4, a: 0.03, d: 0.15, s: 0.02, trem: { rate: 22, depth: 0.7 }, filter: { t: 'lowpass', f: 900 } });
      body(s, 0, 150 * p, 90, 0.1, 0.4, 0.1);
      s.tone({ f: 900 * p, f2: 1500 * p, sw: 0.05, dur: 0.07, v: 0.12, a: 0.01, d: 0.05, s: 0.02 });
    },
  }),
  foe_water_die: foe({
    len: 0.5,
    ms: [150, 480],
    prio: 2,
    climb: 7,
    rule: DEATH,
    build(s, v) {
      // A drop splashes: a burst of water noise sliding from 1.6 kHz to 700 Hz, four bubbles climbing out of it, a plop and three drips falling back.
      const p = v.j(0.07);
      air(s, { dur: 0.12, v: 1, a: 0.004, d: 0.1, s: 0.02, filter: { t: 'bandpass', f: 1600 * p, f2: 700 * p, sw: 0.1, q: 0.7 } });
      [320, 400, 280, 360].forEach((f, k) => bubble(s, 0.02 + k * 0.035, f * p, 0.5, 0.07));
      body(s, 0, 330 * p, 150, 0.09, 0.6, 0.1);
      [1900, 2300, 1700].forEach((f, k) => tink(s, 0.12 + k * 0.05, f * p, 0.05, 0.14));
    },
  }),
  foe_rubber_die: foe({
    len: 0.38,
    ms: [100, 380],
    prio: 2,
    climb: 7,
    rule: DEATH,
    build(s, v) {
      // A balloon pops: a bang (noise through a low-pass closing from 5.2 kHz to 1.5 kHz), a hard snap, a burst of air, and the scraps flapping and sinking.
      const p = v.j(0.07);
      air(s, { dur: 0.03, v: 1.2, a: 0.001, d: 0.025, s: 0.01, filter: { t: 'lowpass', f: 5200, f2: 1500, sw: 0.025 } });
      snap(s, 0, 0.8, 3600, 0.012);
      body(s, 0, 260 * p, 90, 0.1, 0.6, 0.3);
      crackle(s, 0.03, 0.16, 1100 * p, 0.5, 34, 450);
      s.tone({ f: 700 * p, f2: 260 * p, sw: 0.12, at: 0.03, dur: 0.14, v: 0.25, a: 0.004, d: 0.12, s: 0.02 });
    },
  }),
  foe_plastic_die: foe({
    len: 0.4,
    ms: [110, 400],
    prio: 2,
    climb: 7,
    rule: DEATH,
    build(s, v) {
      // A cone knocked flat: four hollow toks hopping away (880, 760, 680 and 620 Hz, each softer) and a rattle where it settles.
      const p = v.j(0.07);
      for (const [f, level, at] of [[880, 1, 0], [760, 0.6, 0.07], [680, 0.35, 0.125], [620, 0.2, 0.165]] as const) knock(s, f * p, at, level, 0.045, 0.9);
      rattle(s, 0.1, 0.4, 0.2, 3000 * p);
      snap(s, 0, 0.4, 3000, 0.01);
    },
  }),
  foe_tin_die: foe({
    len: 0.6,
    ms: [200, 600],
    prio: 2,
    climb: 7,
    rule: DEATH,
    build(s, v) {
      // A clock springs apart: three springs boinging away, the ticking of loose gears, and one last ding (A6) as the bell lets go.
      const p = v.j(0.07);
      snap(s, 0, 0.5, 3000, 0.01);
      boing(s, 0, 700 * p, 300 * p, 0.14, 0.5, 24, 90);
      boing(s, 0.05, 560 * p, 250 * p, 0.14, 0.4, 28, 80);
      boing(s, 0.1, 840 * p, 400 * p, 0.14, 0.35, 22, 90);
      [0.03, 0.08, 0.13, 0.17, 0.21].forEach((at, k) => rap(s, at, 1900 + k * 260, 0.012, 0.35, 1.2));
      bell(s, hz('A6') * p, 0.21, 0.32, 0.55);
    },
  }),
  foe_motor_die: foe({
    len: 0.65,
    ms: [250, 640],
    prio: 2,
    climb: 7,
    rule: DEATH,
    build(s, v) {
      // A vacuum powers down: the motor's note falls from 330 to 70 Hz while its low-pass closes, a whine of air sinks with it, and the shell clunks.
      const p = v.j(0.07);
      s.tone({ w: 'triangle', f: 330 * p, f2: 70 * p, sw: 0.4, dur: 0.46, v: 0.8, a: 0.01, d: 0.4, s: 0.05, sat: 0.3, filter: { t: 'lowpass', f: 1500, f2: 250, sw: 0.4, q: 0.7 } });
      air(s, { kind: 'pink', dur: 0.42, v: 0.35, a: 0.02, d: 0.35, s: 0.03, filter: { t: 'bandpass', f: 1400 * p, f2: 200, sw: 0.4, q: 1.3 } });
      knock(s, 160 * p, 0.44, 0.9, 0.09, 0.8);
      snap(s, 0.44, 0.3, 2800, 0.01);
    },
  }),
  foe_paper_die: foe({
    len: 0.42,
    ms: [120, 420],
    prio: 2,
    climb: 7,
    rule: DEATH,
    build(s, v) {
      // A firecracker goes off: a crack and a thump, two smaller pops behind it, a cloud of powder and confetti fluttering down.
      const p = v.j(0.07);
      snap(s, 0, 1, 3400, 0.014);
      body(s, 0, 240 * p, 100, 0.08, 0.7, 0.3);
      snap(s, 0.07, 0.5, 3200, 0.01);
      body(s, 0.07, 280 * p, 130, 0.05, 0.3, 0.2);
      snap(s, 0.12, 0.3, 3000, 0.01);
      dust(s, 0.02, 0.24, 0.5, 2800, 900);
      crackle(s, 0.1, 0.22, 3000 * p, 0.18, 30);
    },
  }),

  // ---------------------------------------------------------------- bosses: one long, heavy, material death each
  foe_boss_cucumber: foe({
    cat: 'finale',
    len: 0.95,
    ms: [450, 920],
    variants: 1,
    prio: 3,
    rule: FINALE,
    build(s) {
      // The giant cucumber: a huge crack and "tok", a long squelch sinking from 1.4 kHz to 200 Hz, a run of bubbles that slows, and a last heavy plop.
      snap(s, 0, 1, 2600, 0.02);
      s.tone({ f: 700, f2: 300, sw: 0.04, dur: 0.07, v: 0.6, a: 0.002, d: 0.06, s: 0.01 });
      squelch(s, 0.02, 0.55, 1400, 200, 1);
      [0.08, 0.17, 0.28, 0.4, 0.54].forEach((at, k) => bubble(s, at, 300 - k * 25, 0.45 - k * 0.05, 0.09));
      body(s, 0.02, 190, 70, 0.2, 0.8, 0.3);
      body(s, 0.56, 150, 60, 0.18, 0.7, 0.3);
    },
  }),
  foe_boss_vacuum: foe({
    cat: 'finale',
    len: 1.15,
    ms: [500, 1100],
    variants: 1,
    prio: 3,
    rule: FINALE,
    build(s) {
      // The big vacuum powers down: its note sinks from 420 to 45 Hz over most of a second while the low-pass closes, the suction
      // whines away, the shell shudders three times on its way down and the last clunk is a low drum.
      s.tone({ w: 'triangle', f: 420, f2: 45, sw: 0.8, dur: 0.9, v: 0.8, a: 0.01, d: 0.8, s: 0.05, sat: 0.35, filter: { t: 'lowpass', f: 1800, f2: 200, sw: 0.8, q: 0.7 } });
      air(s, { kind: 'pink', dur: 0.8, v: 0.35, a: 0.03, d: 0.7, s: 0.03, filter: { t: 'bandpass', f: 1600, f2: 180, sw: 0.75, q: 1.3 } });
      [0.2, 0.42, 0.62].forEach((at, k) => knock(s, 200 - k * 25, at, 0.5 - k * 0.1, 0.06));
      body(s, 0.82, 120, 45, 0.25, 1, 0.4);
      snap(s, 0.82, 0.35, 2800, 0.012);
      dust(s, 0.85, 0.25, 0.3, 1200, 400);
    },
  }),
  foe_boss_blender: foe({
    cat: 'finale',
    len: 1.1,
    ms: [450, 1050],
    variants: 1,
    prio: 3,
    rule: FINALE,
    build(s) {
      // The blender winds down: a chopped whirr that slows and sinks (a triangle falling 260 to 90 Hz chopped at 22 Hz), the blades rattling
      // in the jar, and the jar cracking at the end in a scatter of glass pings.
      s.tone({ w: 'triangle', f: 260, f2: 90, sw: 0.7, dur: 0.8, v: 0.7, a: 0.01, d: 0.7, s: 0.05, trem: { rate: 22, depth: 0.7 }, sat: 0.25, filter: { t: 'lowpass', f: 1400, f2: 300, sw: 0.7 } });
      crackle(s, 0.02, 0.7, 2200, 0.35, 28, 600);
      body(s, 0.74, 140, 55, 0.2, 0.9, 0.4);
      snap(s, 0.74, 0.8, 3200, 0.016);
      [1700, 2200, 2750, 1950, 2500, 3100].forEach((f, k) => tink(s, 0.76 + k * 0.035, f, 0.1, 0.35 - k * 0.03));
    },
  }),
  foe_boss_bath: foe({
    cat: 'finale',
    len: 1.2,
    ms: [500, 1150],
    variants: 1,
    prio: 3,
    rule: FINALE,
    build(s) {
      // The bathtub gives way: a swell of water that bursts, a long slosh (brown noise rolling at 6 Hz), a run of bubbles and a big plop.
      air(s, { dur: 0.35, v: 1, a: 0.06, d: 0.25, s: 0.1, filter: { t: 'bandpass', f: 900, f2: 1700, sw: 0.1, q: 0.7 } });
      air(s, { kind: 'brown', at: 0.1, dur: 0.9, v: 0.9, a: 0.05, d: 0.8, s: 0.03, trem: { rate: 6, depth: 0.6 }, filter: { t: 'lowpass', f: 600, f2: 180, sw: 0.8 } });
      [0.12, 0.2, 0.3, 0.42, 0.58, 0.74].forEach((at, k) => bubble(s, at, 240 + (k % 3) * 70, 0.4, 0.09));
      body(s, 0.05, 200, 70, 0.3, 0.9, 0.3);
      body(s, 0.9, 150, 60, 0.2, 0.7, 0.3);
    },
  }),
  foe_boss_cloud: foe({
    cat: 'finale',
    len: 1.35,
    ms: [600, 1300],
    variants: 1,
    prio: 3,
    rule: FINALE,
    build(s) {
      // The storm cloud: a soft crack of thunder, a long rumble of brown noise rolling at 7 Hz and sinking from 300 to 90 Hz, a low
      // body under it, and a patter of rain on paper that thins out at the end.
      snap(s, 0, 0.5, 2400, 0.02);
      air(s, { kind: 'brown', dur: 1.1, v: 1, a: 0.04, d: 1, s: 0.03, trem: { rate: 7, depth: 0.5 }, filter: { t: 'lowpass', f: 300, f2: 90, sw: 1 } });
      body(s, 0.02, 100, 45, 0.5, 0.9, 0.3);
      crackle(s, 0.3, 0.8, 2800, 0.12, 24, 1400);
      swish(s, 400, 900, 0.1, 0.5, 0.2, 0.6, 0.3);
    },
  }),
  foe_boss_needle: foe({
    cat: 'finale',
    len: 1.0,
    ms: [450, 960],
    variants: 1,
    prio: 3,
    rule: FINALE,
    build(s) {
      // The syringe: a glass crack, a shower of glass pings falling through 3.2 to 1.4 kHz, the plunger popping out (a hollow pop and a squirt), a low settling thud.
      const e = s.echo(0.05, 0.25, 0.25, 4500);
      snap(s, 0, 1, 3600, 0.016);
      [3200, 2700, 2300, 2000, 1700, 1400].forEach((f, k) => tink(s, 0.01 + k * 0.05, f, 0.12, 0.5 - k * 0.05, { bus: e, amt: 0.25 }));
      s.tone({ f: 520, f2: 200, sw: 0.03, at: 0.2, dur: 0.07, v: 0.7, a: 0.002, d: 0.06, s: 0.01 });
      whistle(s, 0.22, 900, 400, 0.18, 0.3);
      body(s, 0.05, 180, 70, 0.3, 0.8, 0.3);
      clack(s, 0.6, 300, 0.25, 0.06);
    },
  }),
} satisfies Partial<Record<SfxId, Recipe>>;
