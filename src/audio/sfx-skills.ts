/**
 * Recipes: the sounds of the cats' skills. Until now a skill's scene borrowed whatever the game already had (a heavy hit, a whoosh, a
 * shield break); the testers asked for the effects to be better and the owner for each skill to sound like itself: the tiger roars, the
 * ninja's clones come out of a "pop" of smoke, two blades strike with a "chaeng", the glass breaks, a capsule rattles.
 *
 * A skill has a SIGNATURE (`skill` tier: the moment of the cast, the one sound that has to be heard) and small sounds for what goes on
 * while it runs (`skillTick` tier: a star, a bolt, a hoof, a shard). All of them are built from the game's own synthesis; the few that
 * strike glass, tin or steel lay a short CC0 recording (Kenney, `docs/licenses/sounds.md`) UNDER the synthesis. The synthesis alone is a
 * whole sound: a file that did not load costs the layer, never the sound. Levels inside a recipe are relative (`v`: a tone's peak, a
 * recording's peak is about 0.9); the baker brings the finished sound to its tier.
 *
 * Nothing here is shrill or frightening: it is a toy fight. The roar is a cartoon roar, the thunder a small thunder, the glass a glass
 * in a paper world. Every figure that is not obvious was measured offline (docs/qa/sound_audit_2026-10-18.md, "Skill sounds").
 */
import type { SfxId } from './api';
import { air, body, boing, bubble, crackle, dust, grain, rap, rattle, snap, squelch, swish, tink, whistle } from './foley';
import { bell, kalimba, knock, mallet, pluck, pop, puff, shake, stamp, thump, type Recipe } from './recipe';
import { hz } from './theory';

/** Recorded layers (ids of `samples.ts`: `<pack>/<file>`). */
const IMPACT = (name: string): string => `impact-sounds/${name}`;
const RPG = (name: string): string => `rpg-audio/${name}`;

interface Spec {
  len: number;
  ms: readonly [number, number];
  trim?: number;
  lp?: number;
  duck?: Recipe['duck'];
  /** The fight gives way to a signature for a moment (default: 3 dB for 0.45 s); a small sound of a skill never takes the room. */
  hush?: Recipe['hush'];
  variants?: number;
  rate?: number;
  climb?: number;
  rule?: Recipe['rule'];
  needs?: readonly string[];
  build: Recipe['build'];
}

/** What the fight bus does for a signature: a few dB under the crowd, so that the moment is heard through it instead of being added to it (hush.ts). */
const SIGNATURE_HUSH = { db: 3, seconds: 0.45 } as const;

/** The moment of a cast: one at a time, never thinned (a stage rule has already decided that the cast is shown). */
function signature(o: Spec): Recipe {
  return { cat: 'skill', trim: o.trim ?? 0, len: o.len, ms: o.ms, lp: o.lp, duck: o.duck, hush: o.hush ?? SIGNATURE_HUSH, variants: o.variants, rate: o.rate, climb: o.climb, needs: o.needs, rule: o.rule, build: o.build };
}

/** What goes on while a skill runs: a texture of small sounds, a few at a time. */
function small(o: Spec): Recipe {
  return { cat: 'skillTick', trim: o.trim ?? 0, len: o.len, ms: o.ms, lp: o.lp ?? 8000, duck: o.duck, variants: o.variants ?? 2, rate: o.rate ?? 0.05, climb: o.climb, needs: o.needs, rule: o.rule, build: o.build };
}

export const SKILL_RECIPES = {
  // ---------------------------------------------------------------------------------------------- the cut-in of a rank 5 cast
  sp_cutin: signature({
    rule: { maxVoices: 2, minGap: 0.3, falloff: 0 },
    len: 0.75,
    ms: [350, 700],
    trim: -1,
    duck: { depth: 0.4, seconds: 0.7 },
    build(s) {
      // The banner of a guardian's first cast, a third of the awakening's length so that the skill's own sound is not buried under it:
      // a quick roll of three marimba notes, a paper rise, the stamp and a bright chord with a bell on top.
      const e = s.echo(0.07, 0.22, 0.22, 4800);
      swish(s, 500, 3600, 0, 0.17, 0.5, 0.8, 0.9);
      ['G4', 'C5', 'E5'].forEach((n, k) => mallet(s, hz(n), 0.02 + k * 0.045, 0.28, 0.6));
      stamp(s, 0.17, 0.5, 160);
      ['C5', 'E5', 'G5', 'C6'].forEach((n) => mallet(s, hz(n), 0.17, 0.5, 0.8, { bus: e, amt: 0.3 }));
      bell(s, hz('G6'), 0.19, 0.5, 0.4, { bus: e, amt: 0.35 });
      kalimba(s, hz('E7'), 0.3, 0.3, 0.25);
    },
  }),

  // ---------------------------------------------------------------------------------------------- shield shove (viking)
  sp_shield_slam: signature({
    len: 0.4,
    ms: [80, 380],
    trim: 3,
    duck: { depth: 0.35, seconds: 0.5 },
    needs: [IMPACT('impactWood_heavy_000'), IMPACT('impactMetal_heavy_001')],
    build(s) {
      // A round shield of iron-rimmed wood comes down on the road. The weight is a sine drop (170 to 62 Hz) driven so that its harmonics
      // sit at 300 to 900 Hz where a phone can play them; the wood is a dull knock and a short burst of chopped splinters; the rim
      // rings once (2.1 kHz, the iron). Underneath, a recording of a heavy wooden thud and of a heavy metal rim.
      s.tone({ f: 260, f2: 95, sw: 0.09, dur: 0.2, v: 0.8, a: 0.002, d: 0.18, s: 0.01, sat: 0.9, filter: [{ t: 'highpass', f: 210, q: 0.6 }, { t: 'highpass', f: 210, q: 0.6 }] });
      thump(s, 420, 200, 0, 0.09, 0.8, 0.04, 0.6);
      knock(s, 520, 0, 1, 0.1, 0.8);
      air(s, { dur: 0.07, v: 1.1, a: 0.001, d: 0.06, s: 0.01, filter: { t: 'bandpass', f: 1300, f2: 500, sw: 0.05, q: 0.7 } });
      snap(s, 0, 0.55, 3200, 0.012);
      tink(s, 0, 2100, 0.16, 0.45);
      s.tone({ f: 3350, at: 0.002, dur: 0.1, v: 0.12, a: 0.002, s: 0.01 });
      s.sample(IMPACT('impactWood_heavy_000'), { v: 0.16, rate: 1.3, hp: 90 });
      s.sample(IMPACT('impactMetal_heavy_001'), { v: 0.45, at: 0.004 });
    },
  }),
  sp_dust_wedge: small({
    len: 0.35,
    ms: [120, 330],
    trim: 0.5,
    lp: 3200,
    variants: 1,
    rule: { maxVoices: 1, minGap: 0.1, falloff: 0 },
    build(s) {
      // The wedge of dust that runs out over the road: a soft low cloud and a felt pat, nothing sharp.
      dust(s, 0, 0.3, 0.9, 1100, 260);
      thump(s, 150, 85, 0.01, 0.12, 0.4, 0.07, 0.3);
    },
  }),

  // ---------------------------------------------------------------------------------------------- already cut (samurai)
  sp_dash: small({
    len: 0.32,
    variants: 1,
    ms: [150, 320],
    trim: 2.5,
    lp: 9000,
    needs: [RPG('knifeSlice')],
    build(s, v) {
      // The afterimage tears down the road: a swish that climbs (1.4 to 5.2 kHz) and peaks late, a thin whistle of a blade in the air.
      const p = v.j(0.05);
      swish(s, 1200 * p, 4200 * p, 0, 0.24, 1, 1.1, 0.75);
      whistle(s, 0.02, 2000 * p, 3300 * p, 0.2, 0.3);
      s.sample(RPG('knifeSlice'), { v: 0.18, rate: 1.1, lp: 7000, dur: 0.26 });
    },
  }),
  sp_sheath: small({
    len: 0.26,
    ms: [50, 260],
    trim: 3,
    variants: 1,
    needs: [RPG('metalLatch')],
    build(s) {
      // The sword goes home: a short scrape of steel on the mouth of the sheath and the click of the guard. A clean, small "tak".
      air(s, { at: 0, dur: 0.035, v: 0.5, a: 0.015, d: 0.02, s: 0.01, filter: { t: 'bandpass', f: 5200, f2: 3200, sw: 0.03, q: 0.9 } });
      s.sample(RPG('metalLatch'), { v: 0.85, at: 0.03, rate: 0.95 });
      tink(s, 0.03, 2600, 0.07, 0.5);
      body(s, 0.03, 420, 260, 0.04, 0.5, 0.2);
      snap(s, 0.03, 0.5, 3600, 0.01);
    },
  }),
  sp_cut_clash: signature({
    len: 0.6,
    ms: [200, 560],
    trim: 1,
    lp: 10000,
    variants: 3,
    rate: 0.02,
    duck: { depth: 0.3, seconds: 0.4 },
    needs: [IMPACT('impactMetal_light_000'), IMPACT('impactMetal_light_001'), IMPACT('impactMetal_light_003'), IMPACT('impactMetal_light_004')],
    build(s, v) {
      // "Chaeng!": every line opens in the same instant, as if the whole row of blades struck together. The contact is a crack and a
      // 40 ms burst of bright noise, the ring is four inharmonic partials of a struck blade (1.9, 3.1, 4.7 and 6.4 kHz, the lowest
      // two the longest), a short comb echo makes the two steel faces answer each other, and a recording of two light metal pieces
      // meeting (a different one on each variant) carries the first millisecond. A paper tear rustles under the end.
      const p = v.j(0.025);
      const e = s.echo(0.013, 0.5, 0.2, 8500);
      snap(s, 0, 1, 4300, 0.012);
      air(s, { dur: 0.05, v: 0.55, a: 0.0008, d: 0.04, s: 0.01, filter: { t: 'highpass', f: 2600 } });
      // (inharmonic on purpose: a bell's partials sit at whole ratios and ring like a bell; two blades jangle)
      ([[1290, 0.5, 0.3], [2150, 0.45, 0.26], [3560, 0.4, 0.2], [4570, 0.3, 0.16], [5630, 0.2, 0.12], [7240, 0.1, 0.08]] as const).forEach(([f, g, d], k) =>
        s.tone({ f: f * p, at: 0.001, dur: d, v: g, a: 0.001, d: d * 0.9, s: 0.01, det: (k % 2 ? 1 : -1) * (6 + k * 3), send: { bus: e, amt: 0.3 } }),
      );
      body(s, 0, 520, 300, 0.05, 0.5, 0.2);
      const i = v.i ?? 0;
      s.sample(IMPACT(['impactMetal_light_000', 'impactMetal_light_001', 'impactMetal_light_004'][i % 3] as string), { v: 0.95, rate: p });
      if (i % 3 === 0) s.sample(IMPACT('impactMetal_light_003'), { v: 0.3, at: 0.004 });
    },
  }),

  // ---------------------------------------------------------------------------------------------- the tiger has arrived
  sp_tiger_roar: signature({
    // two tigers that cast within a second (rank 5 casts are 1.2 battle seconds apart) both roar, the second a little under the first
    rule: { maxVoices: 2, minGap: 0.2, falloff: 0.5 },
    len: 1.15,
    ms: [650, 1100],
    // (2 dB under what it was: in the busiest second of a 3x chapter the roar was a quarter to a half of all the energy: docs/qa/sound_audit_2026-10-18.md, 13)
    trim: -0.5,
    duck: { depth: 0.5, seconds: 1 },
    hush: { db: 3, seconds: 0.6 },
    build(s) {
      // A cartoon roar, not a tiger: a big cat's throat made of two triangle waves with a slow chorus, driven a little so that the upper
      // harmonics appear, chopped at 27 Hz (the growl), sliding from 215 down to 105 Hz over the breath while a formant peak closes from
      // 1.1 to 0.5 kHz ("aaah" into "oooh"). Over it a breath of noise in the same band, chopped the same way, and a rasp at 3 kHz
      // that dies at once. It opens with a short swell (the "mm" before the "rraaah") and ends in a breath.
      const e = s.echo(0.05, 0.26, 0.18, 4200);
      const grow = { rate: 27, depth: 0.5 };
      // The throat: the fundamental (which a phone cannot play) is taken out of the voices and the mouth's formant peaks carry it: the
      // listener's ear puts the low voice back from the harmonics.
      const formant = (f: number, f2: number, g: number) => [
        { t: 'highpass' as const, f: 310, q: 0.6 },
        { t: 'highpass' as const, f: 310, q: 0.6 },
        { t: 'peaking' as const, f, f2, sw: 0.85, g, q: 1.3 },
        { t: 'lowpass' as const, f: 3600, f2: 1700, sw: 0.9, q: 0.6 },
      ];
      s.tone({ w: 'triangle', f: 235, f2: 120, sw: 0.9, dur: 1, v: 1, a: 0.07, d: 0.55, s: 0.5, r: 0.38, uni: [-21, 23], sat: 0.7, trem: grow, vib: { rate: 5.5, cents: 28, delay: 0.25 }, filter: formant(1000, 560, 12), send: { bus: e, amt: 0.25 } });
      s.tone({ w: 'triangle', f: 470, f2: 240, sw: 0.9, dur: 0.9, v: 0.3, a: 0.08, d: 0.45, s: 0.4, r: 0.35, uni: [14], trem: { rate: 31, depth: 0.6 }, filter: formant(1500, 800, 6) });
      air(s, { kind: 'pink', dur: 0.95, v: 0.9, a: 0.06, d: 0.55, s: 0.35, r: 0.35, trem: { rate: 31, depth: 0.65 }, filter: [{ t: 'highpass', f: 260 }, { t: 'bandpass', f: 1000, f2: 560, sw: 0.85, q: 1.2 }] });
      air(s, { dur: 0.16, v: 0.4, a: 0.01, d: 0.12, s: 0.01, trem: { rate: 40, depth: 0.7 }, filter: { t: 'bandpass', f: 3000, q: 1 } });
      air(s, { kind: 'pink', at: 0.7, dur: 0.4, v: 0.3, a: 0.12, d: 0.25, s: 0.05, r: 0.2, filter: { t: 'bandpass', f: 1400, f2: 700, sw: 0.35, q: 0.8 } });
      thump(s, 260, 110, 0.07, 0.2, 0.3, 0.1, 0.8);
    },
  }),
  sp_tiger_land: signature({
    len: 0.4,
    ms: [150, 400],
    trim: 0.5,
    rule: { maxVoices: 1, minGap: 0.2, falloff: 0 },
    build(s) {
      // The tiger comes down from its leap at 1.5 times its size: a big felt thud driven for the phone, a cloud of dust, one paw on the road.
      thump(s, 230, 70, 0, 0.26, 0.8, 0.1, 0.85);
      thump(s, 420, 190, 0, 0.1, 0.7, 0.05, 0.6);
      dust(s, 0, 0.3, 1.2, 1700, 360);
      knock(s, 360, 0, 0.7, 0.08, 0.85);
      snap(s, 0, 0.5, 2800, 0.012);
    },
  }),
  sp_stomp: small({
    rule: { maxVoices: 3, minGap: 0.04, falloff: 0.12 },
    len: 0.14,
    ms: [40, 130],
    trim: 5.5,
    lp: 6500,
    build(s, v) {
      // A hoof (a paw) on the road: a short low "dum" with the harmonics a phone can play, a pat of dust.
      const p = v.j(0.08);
      thump(s, 340 * p, 150, 0, 0.1, 1, 0.05, 0.7);
      knock(s, 480 * p, 0, 0.5, 0.05, 0.8);
      dust(s, 0, 0.07, 0.8, 1800, 600);
      rap(s, 0, 900 * p, 0.012, 0.6, 1);
    },
  }),
  sp_tiger_roar_end: signature({
    len: 0.55,
    ms: [250, 520],
    trim: -2.5,
    build(s) {
      // The tiger stands at the end of the run and answers itself: one short growl, a falling "rrow" a fifth lower than the first and
      // over in a third of the time.
      const grow = { rate: 28, depth: 0.5 };
      const f = [{ t: 'highpass' as const, f: 290, q: 0.6 }, { t: 'highpass' as const, f: 290, q: 0.6 }, { t: 'peaking' as const, f: 950, f2: 520, sw: 0.4, g: 11, q: 1.3 }, { t: 'lowpass' as const, f: 3000, f2: 1300, sw: 0.4, q: 0.6 }];
      s.tone({ w: 'triangle', f: 200, f2: 112, sw: 0.4, dur: 0.42, v: 1, a: 0.04, d: 0.25, s: 0.4, r: 0.17, uni: [-20, 22], sat: 0.7, trem: grow, filter: f });
      air(s, { kind: 'pink', dur: 0.45, v: 0.8, a: 0.04, d: 0.28, s: 0.1, r: 0.15, trem: { rate: 30, depth: 0.65 }, filter: [{ t: 'highpass', f: 240 }, { t: 'bandpass', f: 900, f2: 500, sw: 0.4, q: 1.3 }] });
    },
  }),

  // ---------------------------------------------------------------------------------------------- surprise clones (ninja)
  sp_smoke_pop: signature({
    len: 0.5,
    ms: [220, 480],
    trim: -1,
    rate: 0.03,
    build(s, v) {
      // "Pong!": a round hollow pop (a sine falling from 330 to 95 Hz in 50 ms, like a cork out of a bottle) with a burst of smoke behind
      // it, a cloud of soft noise that sinks from 2.2 kHz to 500 Hz, and a small chime on top for the cartoon. A leaf rustles after it.
      const p = v.j(0.05);
      const e = s.echo(0.06, 0.2, 0.2, 4500);
      s.tone({ f: 330 * p, f2: 95, sw: 0.05, dur: 0.16, v: 1, a: 0.002, d: 0.14, s: 0.01, sat: 0.25 });
      thump(s, 160, 70, 0, 0.1, 0.5, 0.05, 0.4);
      air(s, { kind: 'pink', at: 0.005, dur: 0.3, v: 1, a: 0.012, d: 0.22, s: 0.02, r: 0.1, filter: [{ t: 'highpass', f: 300 }, { t: 'bandpass', f: 2200 * p, f2: 500, sw: 0.25, q: 0.6 }] });
      snap(s, 0.005, 0.3, 3000, 0.01);
      kalimba(s, hz('E6') * p, 0.03, 0.3, 0.4, { bus: e, amt: 0.3 });
      kalimba(s, hz('B6') * p, 0.07, 0.25, 0.25, { bus: e, amt: 0.3 });
      grain(s, 0.16, 4800, 0.09, 0.06);
      grain(s, 0.23, 4000, 0.06, 0.05);
    },
  }),
  sp_clone_hop: small({
    len: 0.14,
    ms: [40, 130],
    trim: 6,
    lp: 5500,
    build(s, v) {
      // A clone lands on its tile: a light "tip" (a sine that slips from 880 to 640 Hz in 25 ms) and the rustle of a leaf. Pale and high on purpose, so that it is not the tiger's
      // hoofbeat (`sp_stomp`: a low drop and a puff of dust): the landing review measured the two nearly the same when both were a felt "tup".
      const p = v.j(0.08);
      s.tone({ f: 880 * p, f2: 640 * p, sw: 0.025, dur: 0.055, v: 0.8, a: 0.002, d: 0.05, s: 0.01 });
      body(s, 0, 340 * p, 240, 0.03, 0.05, 0.1);
      grain(s, 0, 4200, 0.5, 0.025);
      rap(s, 0, 2200 * p, 0.008, 0.35, 1);
    },
  }),
  sp_clone_throw: small({
    len: 0.22,
    ms: [60, 220],
    trim: 0,
    lp: 4000,
    build(s, v) {
      // A clone's shuriken: the ninja's own throw, but made of air only and darkened, so it reads as a ghost of it.
      const p = v.j(0.06);
      swish(s, 2600 * p, 1300 * p, 0, 0.14, 0.9, 1.2, 0.3);
      s.tone({ f: 1700 * p, f2: 900 * p, sw: 0.1, at: 0, dur: 0.12, v: 0.3, a: 0.004, d: 0.1, s: 0.01 });
      rap(s, 0, 2400, 0.008, 0.4, 1);
    },
  }),
  sp_clone_vanish: small({
    len: 0.3,
    variants: 1,
    ms: [100, 300],
    build(s, v) {
      // A clone goes out: a small high "pwip" (a sine gliding 640 down to 280 Hz), a puff that thins, a leaf.
      const p = v.j(0.06);
      s.tone({ f: 640 * p, f2: 280, sw: 0.06, dur: 0.1, v: 1, a: 0.002, d: 0.09, s: 0.01 });
      dust(s, 0, 0.18, 0.8, 2800 * p, 800);
      kalimba(s, hz('A6') * p, 0.02, 0.18, 0.25);
      grain(s, 0.1, 4800, 0.2, 0.05);
    },
  }),

  // ---------------------------------------------------------------------------------------------- wanted: one shot (gunner)
  sp_poster_slap: signature({
    len: 0.3,
    ms: [100, 280],
    trim: 1,
    needs: [RPG('bookClose')],
    build(s) {
      // The wanted poster is slapped onto the boss: a flat paper slap (a band of noise at 1.2 kHz for 50 ms and a flap higher up),
      // a low pop of the air trapped under it, and a recording of a book shut on a desk.
      air(s, { dur: 0.055, v: 0.95, a: 0.001, d: 0.045, s: 0.01, filter: { t: 'bandpass', f: 1250, f2: 900, sw: 0.04, q: 0.7 } });
      grain(s, 0.02, 2600, 0.6, 0.04);
      thump(s, 240, 110, 0, 0.1, 0.8, 0.05, 0.4);
      snap(s, 0, 0.35, 3000, 0.01);
      s.sample(RPG('bookClose'), { v: 0.75 });
    },
  }),
  sp_cork_pop: signature({
    len: 0.28,
    ms: [80, 250],
    trim: 1.5,
    rate: 0.03,
    variants: 2,
    build(s, v) {
      // The cork gun: "pong", the hollow pop of a cork leaving a bottle (a sine falling 560 to 190 Hz in 35 ms), the puff of air that
      // pushed it, a squeak of the cork on the glass and a faint partial that tells the pop is round.
      const p = v.j(0.05);
      s.tone({ f: 560 * p, f2: 190, sw: 0.035, dur: 0.13, v: 1, a: 0.002, d: 0.12, s: 0.01 });
      s.tone({ f: 1120 * p, f2: 480, sw: 0.03, dur: 0.05, v: 0.3, a: 0.002, s: 0.01 });
      air(s, { dur: 0.05, v: 0.5, a: 0.002, d: 0.04, s: 0.01, filter: { t: 'bandpass', f: 800, f2: 400, sw: 0.04, q: 0.8 } });
      s.tone({ f: 2400 * p, f2: 3100 * p, sw: 0.05, at: 0.005, dur: 0.06, v: 0.1, a: 0.004, s: 0.01 });
      snap(s, 0, 0.3, 3200, 0.01);
    },
  }),
  sp_poster_hole: signature({
    len: 0.35,
    ms: [100, 330],
    trim: 3,
    needs: [IMPACT('impactTin_medium_003')],
    build(s) {
      // The cork goes through the poster's middle: a tin plate struck (the recording and a 780 Hz ping), the tear of the paper (a
      // crackle sliding down from 3.2 to 1.2 kHz) and a low pat.
      tink(s, 0, 780, 0.16, 0.8);
      crackle(s, 0.005, 0.17, 3200, 0.7, 70, 900);
      thump(s, 210, 100, 0, 0.1, 0.8, 0.05, 0.4);
      snap(s, 0, 0.6, 3600, 0.012);
      s.sample(IMPACT('impactTin_medium_003'), { v: 0.85 });
    },
  }),
  sp_seal_stamp: signature({
    len: 0.3,
    ms: [60, 300],
    trim: -1.5,
    build(s) {
      // The case is closed: the rubber stamp on the poster, a "ka-chunk" of two beats (the stamp, the pad's puff) and a wooden knock.
      stamp(s, 0, 1, 170);
      knock(s, 310, 0.03, 0.55, 0.08, 0.85);
      grain(s, 0.015, 2300, 0.5, 0.04);
      rap(s, 0.002, 1500, 0.01, 0.5, 1);
    },
  }),

  // ---------------------------------------------------------------------------------------------- starlight lap (star archer)
  sp_night_hush: small({
    len: 0.75,
    ms: [350, 720],
    trim: -0.5,
    lp: 5000,
    variants: 1,
    rule: { maxVoices: 2, minGap: 0.3, falloff: 0.5 },
    build(s) {
      // The night comes down: a long soft breath that thins out (pink noise through a low-pass closing from 1.6 kHz to 300 Hz), a
      // faint fifth under it, and one twinkle.
      const e = s.echo(0.08, 0.25, 0.25, 4500);
      air(s, { kind: 'pink', dur: 0.65, v: 0.7, a: 0.22, d: 0.35, s: 0.1, r: 0.2, filter: { t: 'lowpass', f: 1600, f2: 300, sw: 0.6, q: 0.6 } });
      s.tone({ f: hz('G3'), dur: 0.6, v: 0.18, a: 0.2, d: 0.35, s: 0.1, r: 0.18 });
      s.tone({ f: hz('D4'), dur: 0.55, v: 0.12, a: 0.22, d: 0.3, s: 0.1, r: 0.18 });
      kalimba(s, hz('C7'), 0.4, 0.3, 0.3, { bus: e, amt: 0.35 });
    },
  }),
  sp_arrow_whoosh: small({
    len: 0.5,
    variants: 1,
    ms: [200, 480],
    trim: 1,
    lp: 9000,
    rule: { maxVoices: 2, minGap: 0.2, falloff: 0 },
    build(s, v) {
      // The silver arrow runs past: a whistle that falls as it goes by (2.7 down to 1.5 kHz, like a thing passing a listener), a band of
      // air with it, a thin silver shimmer. It is played in a few pieces along the lap, each panned where the arrow is.
      const p = v.j(0.04);
      whistle(s, 0, 2500 * p, 1400 * p, 0.42, 0.4);
      swish(s, 1500 * p, 3600 * p, 0, 0.4, 0.6, 1.2, 0.4);
      s.tone({ f: 4800 * p, f2: 3500 * p, sw: 0.35, at: 0.03, dur: 0.34, v: 0.04, a: 0.05, d: 0.25, s: 0.05 });
    },
  }),
  sp_star_ping: small({
    rule: { maxVoices: 4, minGap: 0.035, falloff: 0.1 },
    len: 0.2,
    ms: [50, 190],
    trim: 3,
    variants: 2,
    climb: 14,
    build(s, v) {
      // A star on an enemy: one bright note of a small bell (a sine, its 2.76 partial for the sparkle) and a hair of snap. Shorter than the
      // old double ping, so thirteen stars in a second are thirteen taps and not a smear. The scene climbs it five notes up the ladder.
      const p = v.j(0.03);
      const f = hz('E6') * p;
      s.tone({ f, at: 0, dur: 0.14, v: 1, a: 0.002, d: 0.12, s: 0.01 });
      s.tone({ f: f * 2.76, at: 0, dur: 0.05, v: 0.3, a: 0.002, s: 0.01 });
      s.tone({ f: f * 5.4, at: 0, dur: 0.025, v: 0.08, a: 0.002, s: 0.01 });
      s.tone({ f: f * 0.5, at: 0, dur: 0.1, v: 0.2, a: 0.002, d: 0.09, s: 0.01 });
      snap(s, 0, 0.25, 4800, 0.008);
    },
  }),

  // ---------------------------------------------------------------------------------------------- tagalong cloud (storm cat)
  sp_cloud_pop: signature({
    len: 0.4,
    ms: [150, 380],
    trim: -1,
    build(s) {
      // A grumpy little cloud pops out of the hat: a low round "pof" (a sine falling 240 to 110 Hz), a puff of dark air (a low-passed
      // cloud) and a sulking "bwoop" sliding down a fourth with a wobble.
      s.tone({ f: 240, f2: 110, sw: 0.06, dur: 0.15, v: 1, a: 0.002, d: 0.13, s: 0.01, sat: 0.2 });
      dust(s, 0.005, 0.22, 0.9, 1500, 350);
      boing(s, 0.06, 440, 300, 0.2, 0.45, 18, 50);
      snap(s, 0.005, 0.2, 2800, 0.01);
    },
  }),
  sp_thunder_tick: small({
    len: 0.4,
    ms: [120, 380],
    trim: 3,
    variants: 2,
    climb: 8,
    rule: { maxVoices: 3, minGap: 0.1, falloff: 0.1 },
    build(s, v) {
      // A small thunder for a small cloud: the crack of the bolt (a snap and 30 ms of bright noise), the fizz of the air (cellophane
      // chopped at 90 Hz) and the roll behind it, a low sine drop driven for the phone and a band of dark noise that swells and
      // dies in 220 ms. The scene lifts it a little higher with each of the eight bolts.
      const p = v.j(0.06);
      snap(s, 0, 1.6, 3500 * p, 0.014);
      air(s, { dur: 0.035, v: 1, a: 0.001, d: 0.03, s: 0.01, filter: { t: 'highpass', f: 2200 } });
      crackle(s, 0.005, 0.09, 2800 * p, 0.9, 90, 1300);
      thump(s, 300 * p, 130, 0.015, 0.2, 0.7, 0.1, 0.7);
      air(s, { kind: 'brown', at: 0.02, dur: 0.24, v: 1.2, a: 0.04, d: 0.16, s: 0.03, r: 0.08, filter: [{ t: 'highpass', f: 220 }, { t: 'bandpass', f: 560 * p, f2: 300, sw: 0.2, q: 0.9 }] });
    },
  }),
  sp_cloud_hop: small({
    len: 0.24,
    ms: [80, 230],
    trim: 0.5,
    variants: 1,
    build(s) {
      // The cloud jumps to the next host: a quick rising swish (600 Hz to 2.2 kHz) and a small startled "boing".
      swish(s, 600, 2200, 0, 0.16, 0.8, 1, 0.6);
      boing(s, 0.03, 380, 620, 0.14, 0.4, 24, 60);
    },
  }),
  sp_cloud_sigh: signature({
    len: 0.65,
    ms: [250, 620],
    trim: -2.5,
    build(s) {
      // The cloud runs out: a sigh (pink noise through a band that sinks from 700 to 300 Hz), a tired sine falling a minor third, and
      // a few drops of rain.
      air(s, { kind: 'pink', dur: 0.45, v: 0.7, a: 0.08, d: 0.3, s: 0.05, r: 0.15, filter: { t: 'bandpass', f: 800, f2: 320, sw: 0.4, q: 0.8 } });
      s.tone({ w: 'triangle', f: 330, f2: 262, sw: 0.4, dur: 0.42, v: 0.35, a: 0.05, d: 0.3, s: 0.1, r: 0.12, vib: { rate: 5, cents: 25 }, filter: { t: 'lowpass', f: 1400 } });
      [0.22, 0.31, 0.38, 0.47].forEach((at, k) => bubble(s, at, 900 - k * 90, 0.3 - k * 0.04, 0.06));
    },
  }),

  // ---------------------------------------------------------------------------------------------- knock it off (ice queen)
  sp_glass_tap: signature({
    len: 0.3,
    ms: [90, 280],
    trim: 2,
    needs: [IMPACT('impactGlass_light_001')],
    build(s) {
      // The queen taps the glass off the edge with a paw: one clear "tok" of glass (a ping at 1.8 kHz with its 2.3 partial and a tick).
      tink(s, 0, 1800, 0.14, 0.7);
      tink(s, 0.002, 3300, 0.06, 0.2);
      body(s, 0, 600, 400, 0.03, 0.35, 0.1);
      snap(s, 0, 0.5, 4200, 0.008);
      s.sample(IMPACT('impactGlass_light_001'), { v: 0.8 });
    },
  }),
  sp_glass_shatter: signature({
    len: 0.85,
    ms: [250, 800],
    trim: 3,
    lp: 8500,
    duck: { depth: 0.3, seconds: 0.5 },
    needs: [IMPACT('impactGlass_heavy_003'), IMPACT('impactGlass_medium_004')],
    build(s) {
      // The glass breaks on the road: the burst (a crack, 60 ms of bright noise), a body of glass (a heavy and a medium recording), and
      // the sparkle that the recordings lack: eight pings between 2.4 and 7 kHz that fall in pitch over a third of a second, each a
      // little quieter, in a small bright echo.
      const e = s.echo(0.03, 0.4, 0.2, 6500);
      snap(s, 0, 0.5, 3600, 0.014);
      air(s, { dur: 0.07, v: 0.5, a: 0.001, d: 0.06, s: 0.01, filter: [{ t: 'highpass', f: 1800 }, { t: 'lowpass', f: 5500 }] });
      body(s, 0, 520, 280, 0.05, 0.5, 0.15);
      // eleven pings at random times and pitches (the shards of the glass), the later ones quieter and lower
      for (let k = 0; k < 11; k++) {
        const u = s.rand();
        const at = 0.012 + Math.pow(u, 1.4) * 0.34;
        const f = 1900 + s.rand() * 3000 - at * 1800;
        s.tone({ f, f2: f * 0.97, sw: 0.1, at, dur: 0.05 + s.rand() * 0.08, v: 0.2 * (1 - at * 1.6), a: 0.002, d: 0.08, s: 0.01, send: { bus: e, amt: 0.3 } });
      }
      tink(s, 0.01, 2300, 0.2, 0.3);
      s.sample(IMPACT('impactGlass_heavy_003'), { v: 1 });
      s.sample(IMPACT('impactGlass_medium_004'), { v: 0.6, at: 0.012 });
    },
  }),
  sp_shard_hit: small({
    rule: { maxVoices: 4, minGap: 0.04, falloff: 0.1 },
    len: 0.2,
    ms: [50, 190],
    trim: 2.5,
    variants: 5,
    rate: 0.04,
    lp: 8500,
    needs: [IMPACT('impactGlass_light_000'), IMPACT('impactGlass_light_001'), IMPACT('impactGlass_light_002'), IMPACT('impactGlass_light_003'), IMPACT('impactGlass_light_004')],
    build(s, v) {
      // A shard of glass sticks into an enemy: a short "tik" of glass (a recording, a different one on each of five variants), an ice
      // "chk" (a snap and a ping at 2.2 kHz) and nothing that rings on.
      const p = v.j(0.05);
      tink(s, 0, 2200 * p, 0.08, 0.5);
      snap(s, 0, 0.6, 4400, 0.01);
      grain(s, 0.004, 3600, 0.3, 0.03);
      s.sample(IMPACT(`impactGlass_light_00${(v.i ?? 0) % 5}`), { v: 0.7, rate: p });
    },
  }),

  // ---------------------------------------------------------------------------------------------- meteor drop (space cat)
  sp_meteor_warn: small({
    len: 1,
    ms: [500, 980],
    trim: -1,
    variants: 1,
    lp: 3500,
    rule: { maxVoices: 2, minGap: 0.4, falloff: 0.5 },
    build(s) {
      // The sky darkens: a deep hum that rises a fifth as the red circle grows (a triangle from 70 to 105 Hz, driven so that its harmonics
      // at 300 to 600 Hz carry on a phone) and a band of air that climbs with it. It stops short, as the whistle takes over.
      s.tone({ w: 'triangle', f: 110, f2: 165, sw: 0.85, dur: 0.95, v: 0.9, a: 0.5, d: 0.3, s: 0.8, r: 0.08, sat: 0.8, filter: [{ t: 'highpass', f: 300, q: 0.6 }, { t: 'highpass', f: 300, q: 0.6 }, { t: 'lowpass', f: 1300, f2: 2000, sw: 0.8, q: 0.8 }], trem: { rate: 9, depth: 0.25 } });
      air(s, { kind: 'pink', dur: 0.92, v: 0.5, a: 0.55, d: 0.2, s: 0.8, r: 0.08, filter: [{ t: 'highpass', f: 240 }, { t: 'bandpass', f: 400, f2: 1100, sw: 0.85, q: 0.8 }] });
    },
  }),
  sp_meteor_whistle: signature({
    len: 0.5,
    ms: [200, 480],
    trim: 0.5,
    rate: 0.02,
    build(s) {
      // The rock falls: a whistle that drops from 2.4 kHz to 650 Hz in 0.4 s (louder as it comes) and a fire-crackle of air around it.
      s.tone({ f: 2400, f2: 650, sw: 0.4, dur: 0.44, v: 0.6, a: 0.12, d: 0.3, s: 0.8, r: 0.06 });
      s.tone({ f: 1200, f2: 330, sw: 0.4, dur: 0.44, v: 0.18, a: 0.12, d: 0.3, s: 0.8, r: 0.06 });
      air(s, { kind: 'pink', dur: 0.44, v: 0.7, a: 0.2, d: 0.2, s: 0.8, r: 0.05, filter: { t: 'bandpass', f: 2200, f2: 600, sw: 0.4, q: 2.2 } });
      crackle(s, 0.1, 0.34, 1800, 0.35, 55, 700);
    },
  }),
  sp_meteor_boom: signature({
    len: 0.95,
    ms: [350, 900],
    trim: 0.5,
    duck: { depth: 0.55, seconds: 1.2 },
    needs: [IMPACT('impactMetal_heavy_000')],
    build(s) {
      // The rock lands: a sine dropping from 180 to 42 Hz over 0.35 s and driven hard, so that its harmonics at 360 to 900 Hz carry on a
      // phone, a fist of noise (150 to 1200 Hz) that dies in 0.3 s, a second thud with a flatter fall, a shower of debris (a heavy metal
      // recording, a crackle that falls in pitch) and the dust that follows.
      const e = s.echo(0.05, 0.25, 0.18, 4200);
      s.tone({ f: 230, f2: 70, sw: 0.35, dur: 0.6, v: 0.6, a: 0.002, d: 0.5, s: 0.02, r: 0.1, sat: 0.95, filter: [{ t: 'highpass', f: 210, q: 0.6 }, { t: 'highpass', f: 210, q: 0.6 }], send: { bus: e, amt: 0.15 } });
      s.tone({ f: 70, f2: 45, sw: 0.4, dur: 0.5, v: 0.25, a: 0.004, d: 0.45, s: 0.02, r: 0.1, sat: 0.6 });
      thump(s, 480, 220, 0, 0.14, 0.6, 0.06, 0.7);
      air(s, { dur: 0.34, v: 2, a: 0.002, d: 0.28, s: 0.02, r: 0.05, filter: [{ t: 'highpass', f: 200 }, { t: 'bandpass', f: 1400, f2: 350, sw: 0.25, q: 0.6 }] });
      snap(s, 0, 0.7, 3000, 0.014);
      crackle(s, 0.05, 0.4, 1900, 0.5, 45, 600);
      dust(s, 0.1, 0.5, 0.7, 1300, 280);
      s.sample(IMPACT('impactMetal_heavy_000'), { v: 0.5, at: 0.01, rate: 0.8 });
    },
  }),
  sp_meteor_ring: signature({
    len: 0.5,
    ms: [200, 480],
    trim: -1,
    build(s) {
      // The second ring of the blast rolls out over the road: a soft low "whoom" (a band of air swelling at 200 to 900 Hz) and a short
      // driven thud, quieter than the blast itself.
      air(s, { kind: 'pink', dur: 0.4, v: 1.1, a: 0.07, d: 0.25, s: 0.05, r: 0.1, filter: [{ t: 'highpass', f: 220 }, { t: 'bandpass', f: 300, f2: 1000, sw: 0.25, q: 0.7 }] });
      thump(s, 220, 90, 0, 0.2, 0.7, 0.1, 0.8);
    },
  }),

  // ---------------------------------------------------------------------------------------------- jam session (bard)
  sp_strum: signature({
    len: 0.7,
    ms: [250, 650],
    trim: -2,
    build(s) {
      // A lute strummed down: four strings of a G chord (G3, B3, D4, G4) 22 ms apart, each plucked with a nail (a tick at 2.5 kHz),
      // the same chord an octave up a hair behind it for the sparkle, and a short room.
      const e = s.echo(0.06, 0.22, 0.2, 5000);
      (['G3', 'B3', 'D4', 'G4'] as const).forEach((n, k) => {
        pluck(s, hz(n), k * 0.022, 0.5, 0.8, { bus: e, amt: 0.25 });
        rap(s, k * 0.022, 2600, 0.01, 0.25, 1);
      });
      (['G4', 'B4', 'D5', 'G5'] as const).forEach((n, k) => pluck(s, hz(n), 0.05 + k * 0.022, 0.3, 0.32));
      body(s, 0, 190, 120, 0.06, 0.3, 0.1);
    },
  }),
  sp_note: small({
    rule: { maxVoices: 4, minGap: 0.04, falloff: 0.1 },
    len: 0.36,
    ms: [100, 340],
    trim: 1,
    variants: 2,
    climb: 14,
    build(s, v) {
      // A golden note arrives: a small bell (G5 with its inharmonic partials) over a kalimba tine an octave above, in a little echo.
      const p = v.j(0.03);
      const e = s.echo(0.05, 0.2, 0.2, 4800);
      bell(s, hz('G5') * p, 0, 0.3, 1, { bus: e, amt: 0.3 });
      kalimba(s, hz('G6') * p, 0.005, 0.2, 0.35);
      snap(s, 0, 0.2, 4400, 0.008);
    },
  }),

  // ---------------------------------------------------------------------------------------------- turn into fish (alchemist)
  sp_flask_toss: small({
    len: 0.34,
    ms: [120, 330],
    trim: 3,
    variants: 1,
    build(s) {
      // The flasks leave the paw: a clink of glass on glass, a swish that climbs, and a thin wobbling whine of the liquid.
      tink(s, 0, 2500, 0.09, 0.45);
      swish(s, 800, 2800, 0.01, 0.24, 0.8, 1, 0.6);
      s.tone({ f: 1300, f2: 1900, sw: 0.2, at: 0.03, dur: 0.22, v: 0.12, a: 0.05, d: 0.15, s: 0.1, vib: { rate: 22, cents: 45 } });
    },
  }),
  sp_flask_pop: signature({
    len: 0.65,
    ms: [250, 620],
    trim: 0,
    duck: { depth: 0.3, seconds: 0.5 },
    needs: [IMPACT('impactGlass_light_002')],
    build(s) {
      // The big flask breaks on the boss: glass (a crack, a ping at 1.6 kHz, a recording) and, a hair behind it, "pong": a round soft
      // pop of pink smoke (a sine rising from 220 to 480 Hz like a bubble bursting, a cloud of air that sinks from 2.6 to 0.6 kHz) with
      // three bubbles in it.
      const e = s.echo(0.05, 0.22, 0.2, 4500);
      snap(s, 0, 0.8, 3800, 0.012);
      tink(s, 0, 1600, 0.14, 0.7);
      s.sample(IMPACT('impactGlass_light_002'), { v: 0.8 });
      s.tone({ f: 220, f2: 480, sw: 0.05, at: 0.04, dur: 0.16, v: 0.95, a: 0.003, d: 0.13, s: 0.01, send: { bus: e, amt: 0.2 } });
      thump(s, 170, 80, 0.04, 0.1, 0.5, 0.05, 0.4);
      dust(s, 0.04, 0.34, 1, 2600, 600);
      [0.17, 0.24, 0.31].forEach((at, k) => bubble(s, at, 520 + k * 140, 0.3, 0.07));
    },
  }),
  sp_fish_boing: signature({
    len: 0.6,
    ms: [250, 560],
    trim: -3,
    build(s) {
      // A fish where a boss was: "boing" (a sine sliding up from 300 to 700 Hz under a wobble, a spring), a wet squelch, and three flaps
      // of a tail against the road.
      boing(s, 0, 300, 700, 0.3, 1, 16, 80);
      squelch(s, 0.02, 0.16, 900, 450, 0.7);
      [0.22, 0.3, 0.37].forEach((at, k) => {
        grain(s, at, 700 + k * 120, 0.7, 0.04);
        thump(s, 260, 140, at, 0.05, 0.3, 0.03, 0.2);
      });
      kalimba(s, hz('A6'), 0.08, 0.2, 0.22);
    },
  }),
  sp_flask_mini: small({
    rule: { maxVoices: 4, minGap: 0.05, falloff: 0.1 },
    len: 0.22,
    ms: [60, 210],
    trim: 1.5,
    variants: 3,
    rate: 0.06,
    climb: 9,
    build(s, v) {
      // A small flask on a weak enemy: a tick of glass, a tiny "pop" and a puff, a few of them one after another.
      const p = v.j(0.06);
      tink(s, 0, 2100 * p, 0.07, 0.6);
      pop(s, 520 * p, 0.015, 0.8, 0.1);
      dust(s, 0.01, 0.1, 0.5, 2600, 800);
      snap(s, 0, 0.3, 4400, 0.008);
    },
  }),
  sp_fish_back: small({
    len: 0.3,
    ms: [100, 290],
    trim: 4,
    variants: 1,
    build(s) {
      // The fish is a boss again: it shakes itself ("brrr", a sine that sinks 700 to 350 Hz under a fast wobble) in a puff of smoke.
      boing(s, 0, 700, 350, 0.2, 0.7, 30, 90);
      dust(s, 0, 0.2, 0.8, 2400, 600);
      pop(s, 400, 0.01, 0.4, 0.08);
    },
  }),

  // ---------------------------------------------------------------------------------------------- lucky capsule
  sp_capsule_fall: small({
    len: 0.52,
    ms: [200, 500],
    trim: -3.5,
    variants: 1,
    rule: { maxVoices: 2, minGap: 0.15, falloff: 0 },
    build(s) {
      // The capsule comes down from the sky: a whistle that falls from 2.6 to 0.9 kHz as it gets nearer, with a flutter of air round it.
      whistle(s, 0, 2600, 900, 0.48, 0.6);
      swish(s, 1600, 600, 0, 0.45, 0.4, 1.3, 0.3);
    },
  }),
  sp_capsule_bounce: small({
    len: 0.22,
    ms: [40, 200],
    trim: 0.5,
    variants: 3,
    lp: 6500,
    needs: [IMPACT('impactGeneric_light_000'), IMPACT('impactGeneric_light_002'), IMPACT('impactGeneric_light_004')],
    build(s, v) {
      // The capsule bounces on the board: a hollow knock of plastic (a sine at 700 Hz that sags, a tick), a recording of something light
      // on a table (a different one on each of three variants).
      const p = v.j(0.05);
      s.tone({ f: 540 * p, f2: 430 * p, sw: 0.05, dur: 0.14, v: 1, a: 0.002, d: 0.13, s: 0.01 });
      s.tone({ f: 1040 * p, f2: 980 * p, sw: 0.08, dur: 0.12, v: 0.35, a: 0.002, d: 0.11, s: 0.01 });
      rap(s, 0, 1800, 0.01, 0.4, 1);
      s.sample(IMPACT(['impactGeneric_light_000', 'impactGeneric_light_002', 'impactGeneric_light_004'][(v.i ?? 0) % 3] as string), { v: 0.6, rate: p });
    },
  }),
  sp_capsule_rattle: small({
    len: 0.45,
    ms: [150, 420],
    trim: 2.5,
    variants: 1,
    lp: 4400,
    needs: [RPG('handleCoins2')],
    build(s) {
      // The prize rattles in its shell: seven quick ticks of loose things in a band at 5 kHz, a couple of wooden knocks of the shell
      // itself, and a recording of coins in a hand.
      for (let k = 0; k < 7; k++) {
        const at = 0.01 + k * 0.045 + (k % 2) * 0.008;
        rattle(s, at, 0.6, 0.035, 2800 + (k % 3) * 400);
        if (k % 3 === 0) knock(s, 820 + k * 30, at, 0.4, 0.04, 0.85);
      }
      s.sample(RPG('handleCoins2'), { v: 0.4, at: 0.02, rate: 0.9, dur: 0.38, lp: 5200 });
    },
  }),
  sp_capsule_pop: signature({
    len: 0.3,
    ms: [100, 280],
    trim: -0.5,
    needs: [RPG('metalLatch')],
    build(s) {
      // The shell opens: "ttalkak" (the click of the latch, a recording and a snap) and "pong" (the lid springs: a sine rising 380 to 760
      // Hz with a boing and a puff of air).
      s.sample(RPG('metalLatch'), { v: 0.8 });
      snap(s, 0, 0.6, 3800, 0.01);
      tink(s, 0.002, 2900, 0.06, 0.3);
      s.tone({ f: 380, f2: 760, sw: 0.05, at: 0.06, dur: 0.14, v: 0.9, a: 0.003, d: 0.11, s: 0.01 });
      boing(s, 0.07, 900, 1400, 0.1, 0.25, 26, 50);
      dust(s, 0.06, 0.14, 0.5, 3000, 900);
    },
  }),
  sp_prize_fish: signature({
    len: 0.6,
    ms: [250, 560],
    trim: -3.5,
    build(s) {
      // A fish prize: a bouncy "boing" and a splash of three bubbles and a paper pop, the cheerful small prize.
      const e = s.echo(0.06, 0.22, 0.2, 4800);
      boing(s, 0, 360, 820, 0.22, 0.8, 18, 70);
      [0.1, 0.17, 0.24].forEach((at, k) => bubble(s, at, 600 + k * 180, 0.4, 0.08));
      pop(s, hz('E5'), 0.2, 0.6, 0.12);
      kalimba(s, hz('B6'), 0.26, 0.28, 0.3, { bus: e, amt: 0.3 });
      squelch(s, 0.02, 0.12, 1100, 500, 0.35);
    },
  }),
  sp_prize_partner: signature({
    len: 0.85,
    ms: [350, 820],
    trim: -3,
    build(s) {
      // A partner is chosen for a cat: two bells, a third apart, one after the other in a small echo (a pair), a shimmer, and a soft
      // kiss-pop in the middle.
      const e = s.echo(0.07, 0.3, 0.25, 5000);
      bell(s, hz('E6'), 0, 0.5, 0.9, { bus: e, amt: 0.35 });
      bell(s, hz('G6'), 0.13, 0.6, 0.9, { bus: e, amt: 0.35 });
      kalimba(s, hz('B6'), 0.26, 0.4, 0.4, { bus: e, amt: 0.3 });
      pop(s, hz('C5'), 0.06, 0.5, 0.1);
      shake(s, 0.28, 0.3, 0.3, 6000);
    },
  }),
  sp_prize_more: signature({
    len: 0.6,
    ms: [250, 560],
    trim: -1.5,
    build(s) {
      // One more! A quick climb ("bi-bwip": a sine from 400 to 900 Hz), a pop and the tick of a smaller capsule rolling out.
      s.tone({ f: 400, f2: 900, sw: 0.1, dur: 0.16, v: 0.9, a: 0.004, d: 0.12, s: 0.01 });
      pop(s, 700, 0.12, 0.8, 0.14);
      [0.26, 0.31, 0.35, 0.38].forEach((at, k) => knock(s, 900 - k * 40, at, 0.4 - k * 0.05, 0.04, 0.85));
      kalimba(s, hz('A6'), 0.14, 0.22, 0.3);
    },
  }),
  sp_prize_toy: signature({
    len: 1.05,
    ms: [500, 1000],
    trim: -2.5,
    duck: { depth: 0.4, seconds: 0.8 },
    build(s) {
      // A toy box: the lid pops (a knock and a pop), then four climbing notes (C6 E6 G6 C7) and a spray of glitter.
      const e = s.echo(0.07, 0.28, 0.25, 5000);
      knock(s, 330, 0, 0.7, 0.08, 0.8);
      pop(s, 420, 0.02, 0.9, 0.12);
      ['C6', 'E6', 'G6', 'C7'].forEach((n, k) => mallet(s, hz(n), 0.1 + k * 0.07, 0.4, 0.75 + k * 0.06, { bus: e, amt: 0.3 }));
      bell(s, hz('G7'), 0.34, 0.5, 0.3, { bus: e, amt: 0.35 });
      shake(s, 0.3, 0.45, 0.45, 6500);
    },
  }),
  sp_prize_guardian: signature({
    len: 1.2,
    ms: [650, 1150],
    trim: -2.5,
    duck: { depth: 0.4, seconds: 0.8 },
    build(s) {
      // A guardian wakes: a warm swell of an open chord (C5, G5, E6, a wide chorus on the root) that blooms in 90 ms and glows for a
      // second, a low "whoom" under it, and a falling shower of twinkles.
      const e = s.echo(0.08, 0.3, 0.28, 5200);
      const vib = { rate: 4.5, cents: 9, delay: 0.1 };
      s.tone({ f: hz('C5'), dur: 0.95, v: 0.7, a: 0.09, d: 0.6, s: 0.15, r: 0.3, uni: [-6, 6], vib, send: { bus: e, amt: 0.4 } });
      s.tone({ f: hz('G5'), at: 0.03, dur: 0.9, v: 0.5, a: 0.09, d: 0.6, s: 0.15, r: 0.3, vib, send: { bus: e, amt: 0.4 } });
      s.tone({ f: hz('E6'), at: 0.06, dur: 0.85, v: 0.3, a: 0.09, d: 0.55, s: 0.1, r: 0.3, vib, send: { bus: e, amt: 0.4 } });
      thump(s, 130, 70, 0, 0.35, 0.6, 0.2, 0.6);
      ['G7', 'E7', 'C7', 'G6'].forEach((n, k) => kalimba(s, hz(n), 0.3 + k * 0.1, 0.4, 0.3, { bus: e, amt: 0.3 }));
      bell(s, hz('C7'), 0.12, 0.6, 0.35, { bus: e, amt: 0.4 });
      puff(s, 0.05, 0.5, 0.4, 4200, 1500);
    },
  }),
} satisfies Partial<Record<SfxId, Recipe>>;
