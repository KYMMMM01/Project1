/**
 * Recipes: the landing of every cat's weapon (`imp_*`), the sound the testers asked to be better. Heard five to fifteen times a second in a busy fight, on a phone
 * speaker that plays almost nothing under 250 Hz, so a hit here is built in the order of what the ear needs, whatever the material is (`hitkit.ts`):
 *
 *   1. a CRACK, 7 to 12 ms of noise in the 2.5 to 6 kHz band: the touch itself, what makes "it hit something" and not "it was patted";
 *   2. a BODY that a phone can play: a saturated drop whose harmonics sit at 300 to 1200 Hz (a sine at 100 Hz would be lost), or a short knock of wood or tin;
 *   3. the MATERIAL: what the thing is made of (a wooden bar, a tin plate, a pot, a pane of glass, an axe in wood), the recipe's own synthesis with a few
 *      milliseconds of a real recording under it where one helps (Kenney, CC0, `docs/licenses/sounds.md`; a recipe is a whole sound without the file).
 *
 * And they are short: the 20 dB fall is under 60 ms (the two top ranks under 80), so that ten of them a second are a rhythm and not a haze. The rank order of
 * a class line (louder and heavier up the line) is kept by `RANK_TRIM`, the colour of a class too: the warriors thwack, the rangers tick and thunk, the
 * mages whump and ring, the tricksters clink and pluck. The previous versions are kept word for word in `sfx-before.ts` for the sound board's "지금".
 */
import type { SfxId } from './api';
import { air, body, clack, crackle, dust, snap, tink } from './foley';
import { IMPACT_FILE, RPG_FILE, crack, rec, tap, thud } from './hitkit';
import { bell, knock, pluck, type Recipe } from './recipe';
import { impact } from './sfx-cats';
import { hz } from './theory';

export const IMPACT_RECIPES = {
  // ---------------------------------------------------------------- warriors: thwack, clack, chop, cut, whack
  imp_w_paw: impact({
    rank: 0,
    db: 2.6,
    len: 0.12,
    ms: [30, 100],
    build(s, v) {
      // A glove on a cushion: the slap of the leather (a band around 1.2 kHz with its crack on top) and the pat under it, high enough for a phone to play.
      const p = v.j(0.06);
      tap(s, 0, 1250 * p, 0.9, 0.035, 0.9);
      crack(s, 0, 0.9, 3400);
      thud(s, 0, 380 * p, 190, 0.07, 0.9, 0.5, 150);
    },
  }),
  imp_w_sword: impact({
    rank: 1,
    db: 4.9,
    len: 0.12,
    ms: [40, 110],
    needs: [IMPACT_FILE('impactWood_light_002')],
    build(s, v) {
      // Wood on wood: the bar rings once (a recorded wooden knock under a clack), the grain cracks and a short pat sits under it.
      const p = v.j(0.06);
      rec(s, IMPACT_FILE('impactWood_light_002'), { v: 0.7, dur: 0.07, rate: p });
      clack(s, 0, 820 * p, 0.7, 0.07);
      crack(s, 0, 0.9, 3600);
      thud(s, 0, 300 * p, 160, 0.05, 0.3, 0.5, 160);
    },
  }),
  imp_w_viking: impact({
    rank: 2,
    db: 1.5,
    len: 0.22,
    ms: [60, 200],
    prio: 1,
    needs: [RPG_FILE('chop')],
    build(s, v) {
      // The axe bites into wood: a recorded chop, the weight of the head (a drop through 220 to 90 Hz that a phone hears by its harmonics), a burst of splinters and the crack.
      const p = v.j(0.06);
      rec(s, RPG_FILE('chop'), { v: 0.8, dur: 0.06, rate: p });
      thud(s, 0, 220 * p, 90, 0.1, 0.7, 0.7, 140);
      air(s, { dur: 0.04, v: 0.55, a: 0.002, d: 0.03, s: 0.01, filter: { t: 'lowpass', f: 2200 * p, f2: 600, sw: 0.035 } });
      crack(s, 0, 1.1, 3000);
    },
  }),
  imp_w_samurai: impact({
    rank: 3,
    db: 1.5,
    len: 0.2,
    ms: [50, 170],
    lp: 7500,
    prio: 1,
    needs: [IMPACT_FILE('impactMetal_medium_004')],
    build(s, v) {
      // A clean cut: a crisp snap, a falling "tsk" of the edge with a short recorded ring of steel, a light cut-through and a thin ring that does not linger
      // (the long "chaeng" belongs to the skill, `sp_cut_clash`).
      const p = v.j(0.05);
      snap(s, 0, 0.8, 3800, 0.01);
      s.tone({ f: 3100 * p, f2: 2300 * p, sw: 0.04, dur: 0.06, v: 0.5, a: 0.002, d: 0.05, s: 0.01 });
      rec(s, IMPACT_FILE('impactMetal_medium_004'), { v: 0.4, dur: 0.07, rate: p * 1.05 });
      thud(s, 0, 420 * p, 210, 0.07, 0.6, 0.5, 170);
      bell(s, 1560 * p, 0.006, 0.12, 0.3);
    },
  }),
  imp_w_tiger: impact({
    rank: 4,
    db: 1,
    len: 0.3,
    ms: [90, 260],
    prio: 1,
    needs: [IMPACT_FILE('impactWood_medium_000')],
    build(s, v) {
      // The polearm lands: a heavy whack, the shaft (a recorded wooden thud), the weight as a saturated drop whose harmonics reach a phone, a crack of broken wood, a puff of dust.
      const p = v.j(0.06);
      rec(s, IMPACT_FILE('impactWood_medium_000'), { v: 0.9, dur: 0.12, rate: p, hp: 200 });
      thud(s, 0, 360 * p, 130, 0.14, 0.8, 0.7, 200);
      clack(s, 0, 520 * p, 0.6, 0.06);
      crack(s, 0, 2, 2800);
      dust(s, 0.03, 0.14, 0.25, 1200, 500);
    },
  }),

  // ---------------------------------------------------------------- rangers: tok, thunk, tink, ping
  imp_r_sling: impact({
    rank: 0,
    db: 1.9,
    len: 0.1,
    ms: [25, 90],
    build(s, v) {
      // A pebble on cardboard: one dry tok, a tick of the paper and the crack.
      const p = v.j(0.06);
      knock(s, 560 * p, 0, 0.9, 0.04, 0.8);
      crack(s, 0, 1.5, 3200);
      tap(s, 0, 1800, 0.4, 0.02);
    },
  }),
  imp_r_archer: impact({
    rank: 1,
    db: 6.6,
    len: 0.18,
    ms: [50, 170],
    needs: [IMPACT_FILE('impactWood_light_000')],
    build(s, v) {
      // An arrow into a wooden board: the thunk (a recorded knock of wood and a tok of its own), the crack, and the shaft quivering for a moment.
      const p = v.j(0.06);
      rec(s, IMPACT_FILE('impactWood_light_000'), { v: 0.8, dur: 0.08, rate: p });
      knock(s, 380 * p, 0, 0.7, 0.05, 0.75);
      crack(s, 0, 0.9, 2800);
      s.tone({ f: 980 * p, f2: 900 * p, sw: 0.08, at: 0.02, dur: 0.1, v: 0.22, a: 0.004, d: 0.08, s: 0.01, trem: { rate: 14, depth: 0.7 } });
    },
  }),
  imp_r_ninja: impact({
    rank: 2,
    db: 2.3,
    len: 0.18,
    ms: [50, 170],
    lp: 7500,
    needs: [IMPACT_FILE('impactMetal_medium_000')],
    build(s, v) {
      // A throwing star into a tin sign: the clang (a recorded knock of thin steel), the thunk of the point, a hard tink, and a smaller tink as the star bounces.
      const p = v.j(0.05);
      rec(s, IMPACT_FILE('impactMetal_medium_000'), { v: 0.5, dur: 0.1, rate: p });
      tink(s, 0, 2050 * p, 0.06, 0.6);
      knock(s, 480 * p, 0, 0.7, 0.04, 0.8);
      crack(s, 0, 1.2, 4200);
      tink(s, 0.055, 1750 * p, 0.045, 0.35);
    },
  }),
  imp_r_gunner: impact({
    rank: 3,
    db: 2.9,
    len: 0.16,
    ms: [50, 140],
    prio: 1,
    needs: [IMPACT_FILE('impactTin_medium_003')],
    build(s, v) {
      // A cork on a tin plate: a dry tok, the plate (a recorded ring of tin and a ring of its own, 1.1 kHz) and a longer pat behind it, with the crack on top.
      const p = v.j(0.05);
      rec(s, IMPACT_FILE('impactTin_medium_003'), { v: 0.55, dur: 0.1, rate: p });
      knock(s, 640 * p, 0, 0.8, 0.05);
      bell(s, 1100 * p, 0, 0.1, 0.35);
      crack(s, 0, 1.8, 3000);
      thud(s, 0, 280 * p, 150, 0.09, 0.6, 0.5, 150);
      body(s, 0, 150 * p, 90, 0.08, 0.3, 0.3);
    },
  }),
  imp_r_star: impact({
    rank: 4,
    // the most frequent of all (a piercing arrow touches many enemies): at most 14 a second
    gap: 0.07,
    db: 0.3,
    len: 0.16,
    ms: [50, 130],
    prio: 1,
    build(s, v) {
      // A star lands, and it lands on one enemy after another when the arrow goes through them, so it is ONE short twinkle, not two pings: a sine that rises a fifth
      // in 50 ms (A6 to E7), a glassy partial above it that dies in 50 ms, a soft pat under it and a faint crack.
      const p = v.j(0.04);
      s.tone({ f: 1760 * p, f2: 2640 * p, sw: 0.05, dur: 0.11, v: 0.7, a: 0.002, d: 0.1, s: 0.01 });
      s.tone({ f: 4400 * p, dur: 0.05, v: 0.2, a: 0.002, d: 0.045, s: 0.01 });
      s.tone({ f: hz('E6') * p, at: 0.03, dur: 0.06, v: 0.25, a: 0.002, d: 0.05, s: 0.01 });
      thud(s, 0, 420 * p, 260, 0.045, 0.55, 0.4, 200);
      crack(s, 0, 0.9, 4800);
    },
  }),

  // ---------------------------------------------------------------- mages: pof, whump, crack, shatter, plop
  imp_m_snow: impact({
    rank: 0,
    db: 3.2,
    len: 0.14,
    ms: [40, 150],
    build(s, v) {
      // "Pof": a burst of powder through a closing low-pass (higher than the fire's, so it is a puff and not a whump), a light pat that reaches a phone, and the crunch of packed
      // snow: fine and quick (a granular 95 Hz), where the fire's embers are slow pops. The landing review measured snow and fire as the nearest pair of the new hits.
      const p = v.j(0.06);
      air(s, { dur: 0.09, v: 1, a: 0.004, d: 0.07, s: 0.01, filter: { t: 'lowpass', f: 1900 * p, f2: 520, sw: 0.07 } });
      thud(s, 0, 360 * p, 220, 0.07, 0.4, 0.4, 200);
      crackle(s, 0.012, 0.075, 1900 * p, 0.42, 95);
      crack(s, 0, 1.1, 3000);
    },
  }),
  imp_m_fire: impact({
    rank: 1,
    db: 1.8,
    len: 0.22,
    ms: [70, 200],
    prio: 1,
    build(s, v) {
      // A flame catching: a burst of low-passed noise, a whump with harmonics, a short crackle of embers after it and a crack.
      const p = v.j(0.06);
      air(s, { dur: 0.09, v: 0.9, a: 0.003, d: 0.07, s: 0.01, filter: { t: 'lowpass', f: 1400 * p, f2: 350, sw: 0.08 } });
      thud(s, 0, 300 * p, 120, 0.12, 0.9, 0.6, 140);
      crackle(s, 0.02, 0.1, 2200 * p, 0.6, 55);
      crack(s, 0, 1.6, 3000);
    },
  }),
  imp_m_storm: impact({
    rank: 2,
    db: 4,
    len: 0.2,
    ms: [60, 170],
    lp: 7500,
    prio: 1,
    build(s, v) {
      // The bolt lands: a hard crack, a triangle falling from 1 kHz to 230 Hz (the charge draining), a whump of air and a short crackle.
      const p = v.j(0.05);
      snap(s, 0, 1.4, 3300 * p, 0.014);
      crack(s, 0, 0.9, 4200);
      s.tone({ w: 'triangle', f: 1000 * p, f2: 230 * p, sw: 0.07, dur: 0.1, v: 0.5, a: 0.002, d: 0.09, s: 0.01, filter: { t: 'lowpass', f: 2400 } });
      thud(s, 0, 320 * p, 140, 0.08, 0.6, 0.5, 150);
      body(s, 0, 150 * p, 90, 0.08, 0.3, 0.3);
      crackle(s, 0.02, 0.14, 2400 * p, 0.5, 85);
    },
  }),
  imp_m_frost: impact({
    rank: 3,
    db: -0.1,
    len: 0.28,
    ms: [80, 280],
    lp: 7500,
    prio: 1,
    build(s, v) {
      // A crystal shatters: a bright snap, three pings in a cluster, the crunch of ice (noise chopped at 65 Hz) and a small low body.
      // (unchanged: it already had the crack, the bright start and a short fall)
      const p = v.j(0.05);
      snap(s, 0, 0.8, 3600, 0.01);
      [1800, 2430, 3050].forEach((f, k) => tink(s, k * 0.012, f * p, 0.09, 0.5));
      air(s, { dur: 0.1, v: 0.4, a: 0.003, d: 0.08, s: 0.02, trem: { rate: 65, depth: 0.9 }, filter: { t: 'lowpass', f: 3200, f2: 1200, sw: 0.09 } });
      body(s, 0, 190 * p, 100, 0.08, 0.4, 0.2);
    },
  }),
  imp_m_cosmo: impact({
    rank: 4,
    // (+2 dB in the landing review: by the K-weighted loudness of its loudest 100 ms the top rank of the mage line was 1.6 dB under the frost queen's, and a phone plays its low drop even
    // worse than that)
    db: 1.6,
    len: 0.3,
    ms: [100, 260],
    prio: 1,
    build(s, v) {
      // The vacuum lets go: a big drop whose harmonics reach a phone (420 to 120 Hz), the weight under it kept smaller, a rumble that sinks away, a "plop" and the crack.
      const p = v.j(0.05);
      thud(s, 0, 420 * p, 120, 0.2, 1, 0.8, 130);
      thud(s, 0, 200 * p, 60, 0.16, 0.45, 0.4);
      air(s, { kind: 'brown', dur: 0.16, v: 0.5, a: 0.003, d: 0.12, s: 0.01, filter: { t: 'lowpass', f: 900, f2: 200, sw: 0.14 } });
      s.tone({ f: 380 * p, f2: 140, sw: 0.05, dur: 0.07, v: 0.35, a: 0.003, d: 0.06, s: 0.01 });
      crack(s, 0, 1.8, 2800);
    },
  }),

  // ---------------------------------------------------------------- tricksters: tink, clang, plink, fizz, clink
  imp_t_bell: impact({
    rank: 0,
    db: 3,
    len: 0.14,
    ms: [30, 120],
    build(s, v) {
      // A small bell tapped: a bright tink (E6) that dies fast with the inharmonic partials of a bell, and the crack of the clapper.
      const p = v.j(0.04);
      bell(s, hz('E6') * p, 0, 0.14, 1.1);
      crack(s, 0, 1.6, 4200);
    },
  }),
  imp_t_chef: impact({
    rank: 1,
    db: 3.6,
    len: 0.2,
    ms: [50, 170],
    prio: 1,
    needs: [RPG_FILE('metalPot2')],
    build(s, v) {
      // The frying pan clangs: the first moments of a recorded pot, the inharmonic partials of a thin pan (640, 1390, 2160 and 3100 Hz) dying at different speeds, a thud and the crack.
      const p = v.j(0.05);
      rec(s, RPG_FILE('metalPot2'), { v: 0.5, dur: 0.09, rate: p });
      [640, 1390, 2160, 3100].forEach((f, k) => s.tone({ f: f * p, dur: 0.09 - k * 0.014, v: 0.6 - k * 0.1, a: 0.002, d: 0.08 - k * 0.014, s: 0.01 }));
      crack(s, 0, 0.9, 3600);
    },
  }),
  imp_t_bard: impact({
    rank: 2,
    db: 1.5,
    len: 0.18,
    ms: [50, 150],
    build(s, v) {
      // One plink: two plucked strings a fourth apart (D5 and G5), the slap of the string, the knock of the lute's belly.
      const p = v.j(0.04);
      pluck(s, hz('D5') * p, 0, 0.1, 1);
      pluck(s, hz('G5') * p, 0.004, 0.09, 0.7);
      crack(s, 0, 1.5, 3200);
      thud(s, 0, 330 * p, 200, 0.05, 0.5, 0.4, 170);
      tap(s, 0, 900, 0.2, 0.02);
    },
  }),
  imp_t_alch: impact({
    rank: 3,
    db: 1.3,
    len: 0.2,
    ms: [60, 150],
    lp: 7500,
    prio: 1,
    build(s, v) {
      // A flask bursts and fizzes: a burst of wet noise, three bubbles, a short fizz, a plop of the liquid and a last shard of glass.
      const p = v.j(0.05);
      air(s, { dur: 0.07, v: 0.8, a: 0.003, d: 0.055, s: 0.02, filter: { t: 'bandpass', f: 1800 * p, f2: 900 * p, sw: 0.06, q: 0.8 } });
      [360, 480, 300].forEach((f, k) => s.tone({ f: f * p, f2: f * p * 2.2, sw: 0.025, at: 0.008 + k * 0.016, dur: 0.04, v: 0.5, a: 0.003, d: 0.035, s: 0.01 }));
      crackle(s, 0.02, 0.045, 3400 * p, 0.4, 45);
      thud(s, 0, 300 * p, 160, 0.06, 0.45, 0.4, 150);
      bell(s, 2600 * p, 0.01, 0.035, 0.25);
      crack(s, 0, 0.9, 4200);
    },
  }),
  imp_t_lucky: impact({
    rank: 4,
    db: 0.5,
    len: 0.22,
    ms: [60, 170],
    lp: 7500,
    prio: 1,
    build(s, v) {
      // Coins landing: four metallic clinks (1.4, 1.85, 1.25 and 2.2 kHz) one after another, 22 ms apart and short, a last coin that settles very quietly, the crack of the first, and a soft thud of the pile.
      const p = v.j(0.05);
      crack(s, 0, 0.9, 3200);
      [1400, 1850, 1250, 2200].forEach((f, k) => tink(s, k * 0.022, f * p, 0.045 + k * 0.004, 0.7 - k * 0.1));
      tink(s, 0.07, 1700 * p, 0.09, 0.1);
      thud(s, 0, 320 * p, 160, 0.05, 0.25, 0.4, 150);
    },
  }),
} satisfies Partial<Record<SfxId, Recipe>>;
