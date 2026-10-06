/**
 * Recipes: UI, rewards, summon and merge. Each build() says WHY its layers exist: a noise grain is the
 * touch, a felt pat is the landing, a wooden knock is a refusal, a stamp is a claim, a sticker pop is a
 * small pitched glide, and every note comes from a mallet or a plucked string. Levels inside a recipe
 * are relative only; the baker normalises to the family target.
 */
import type { SfxId } from './api';
import { bell, kalimba, knock, mallet, paper, pluck, pop, puff, shake, stamp, thump, tick, whoosh, type Recipe } from './recipe';
import { hz } from './theory';

export const UI_RECIPES = {
  // ---------------------------------------------------------------- UI
  ui_click: {
    cat: 'ui',
    len: 0.1,
    ms: [15, 90],
    variants: 2,
    rate: 0.03,
    build(s, v) {
      // A fingertip on paper: a band-passed noise grain is the touch, a felt pat under it is the body. Nothing rings.
      const p = v.j(0.06);
      paper(s, 0, 2200 * p, 1, 0.028);
      thump(s, 320 * p, 210, 0, 0.045, 0.35, 0.025);
    },
  },
  ui_back: {
    cat: 'ui',
    len: 0.12,
    ms: [30, 100],
    variants: 2,
    rate: 0.03,
    build(s, v) {
      // The same gesture going back: a lower grain and a slower, deeper pat.
      const p = v.j(0.06);
      paper(s, 0, 1500 * p, 0.9, 0.034);
      thump(s, 260 * p, 170, 0, 0.06, 0.3, 0.035);
    },
  },
  ui_tab: {
    cat: 'ui',
    len: 0.14,
    ms: [50, 125],
    variants: 2,
    rate: 0.03,
    build(s, v) {
      // A page turning: one flick rising, a second falling back (a double slide), and the leaf settling with a pat.
      const p = v.j(0.05);
      whoosh(s, 1200 * p, 3600 * p, 0, 0.05, 0.8, 0.8, 0.35);
      whoosh(s, 3200 * p, 1600 * p, 0.03, 0.04, 0.45, 0.8, 0.4);
      paper(s, 0.058, 2200 * p, 0.6, 0.02);
      thump(s, 290 * p, 200, 0.058, 0.04, 0.3, 0.02);
    },
  },
  ui_toggle: {
    cat: 'ui',
    len: 0.09,
    ms: [25, 85],
    rate: 0.03,
    build(s) {
      // A wooden "tok", pitched so that consumers can bend it up for on, down for off, and ride it along a slider.
      knock(s, 900, 0, 1, 0.04);
    },
  },
  ui_popup_open: {
    cat: 'ui',
    len: 0.14,
    ms: [70, 125],
    build(s) {
      // A sheet of paper slides in (a slow-rising swish) and lands with a soft pat and a tap of its edge.
      whoosh(s, 600, 2200, 0, 0.075, 0.8, 0.7, 0.55);
      thump(s, 280, 190, 0.065, 0.05, 0.4, 0.025);
      paper(s, 0.065, 1500, 0.5, 0.02);
    },
  },
  ui_popup_close: {
    cat: 'ui',
    len: 0.12,
    ms: [45, 110],
    build(s) {
      // The sheet slides away, quicker and lighter than it came, and the table takes it with a small pat.
      whoosh(s, 2200, 600, 0, 0.05, 0.6, 0.7, 0.3);
      thump(s, 260, 180, 0.04, 0.04, 0.25, 0.02);
    },
  },
  ui_error: {
    cat: 'ui',
    len: 0.14,
    ms: [70, 125],
    build(s) {
      // Never a buzzer: a dull double knock on a wooden lid, the second one lower and lighter. It says "not that", gently.
      knock(s, 300, 0, 1, 0.055);
      knock(s, 250, 0.058, 0.75, 0.055);
    },
  },
  ui_confirm: {
    cat: 'ui',
    len: 0.14,
    ms: [60, 125],
    build(s) {
      // Two small kalimba tines up a fifth (E5, B5): "done".
      kalimba(s, hz('E5'), 0, 0.075, 0.8);
      kalimba(s, hz('B5'), 0.04, 0.085, 1);
    },
  },

  // ---------------------------------------------------------------- economy / rewards
  coin: {
    cat: 'tick',
    len: 0.26,
    ms: [60, 230],
    variants: 3,
    rate: 0.025,
    climb: 14,
    rule: { maxVoices: 6, minGap: 0.03, falloff: 0.12 },
    build(s, v) {
      // One kalimba tine (G5) with a woody tick: a small soft coin, made to be heard in dozens while a count runs.
      const p = v.j(0.02);
      kalimba(s, hz('G5') * p, 0, 0.2, 1);
      tick(s, 0, 3000, 0.008, 0.18, 1);
    },
  },
  coin_many: {
    cat: 'reward',
    len: 0.7,
    ms: [250, 650],
    build(s) {
      // A handful of coins on a wooden table: a pentatonic run of kalimba tines that speeds up, a loose rattle under it
      // (band-passed at 2.4 kHz, never a metallic hiss) and a small hand bell for the last one.
      const seq = ['G5', 'A5', 'C6', 'D6', 'E6', 'G6', 'E6', 'C7'];
      let t = 0;
      seq.forEach((n, k) => {
        kalimba(s, hz(n) * (1 + (s.rand() - 0.5) * 0.01), t, 0.14, 0.5 + k * 0.05);
        t += 0.06 - k * 0.003;
      });
      s.noise({ at: 0.02, dur: 0.38, v: 0.1, a: 0.04, s: 0.2, r: 0.15, trem: { rate: 26, depth: 0.9 }, filter: { t: 'bandpass', f: 2400, q: 0.8 } });
      bell(s, hz('G6'), 0.34, 0.26, 0.4);
    },
  },
  gem: {
    cat: 'tick',
    len: 0.45,
    ms: [100, 420],
    climb: 12,
    build(s) {
      // A small hand bell (E6) in a short wooden room: brighter and longer than a coin, but never a glass shimmer.
      const e = s.echo(0.055, 0.2, 0.22, 4500);
      bell(s, hz('E6'), 0, 0.32, 1, { bus: e, amt: 0.35 });
    },
  },
  reward_claim: {
    cat: 'reward',
    len: 0.6,
    ms: [150, 480],
    build(s) {
      // A rubber stamp comes down on the form (dull thud, paper slap), then one kalimba ding says it counted.
      stamp(s, 0, 1);
      kalimba(s, hz('C6'), 0.075, 0.3, 0.55);
    },
  },
  level_up: {
    cat: 'reward',
    trim: 1,
    len: 0.95,
    ms: [400, 900],
    build(s) {
      // The stamp, then a short rising marimba figure (C-E-G) that lands on a long C6 with a kalimba tine above it.
      const e = s.echo(0.07, 0.22, 0.2, 4500);
      stamp(s, 0, 0.8);
      ['C5', 'E5', 'G5'].forEach((n, k) => mallet(s, hz(n), 0.1 + k * 0.075, 0.18, 0.8));
      mallet(s, hz('C6'), 0.325, 0.55, 1, { bus: e, amt: 0.35 });
      kalimba(s, hz('E6'), 0.36, 0.35, 0.3);
    },
  },
  star: {
    cat: 'tick',
    len: 0.26,
    ms: [50, 230],
    climb: 19,
    build(s) {
      // A sticker pressed on: a pitched pop (D5) with a quick upward glide. playStep lifts it up the pentatonic scale
      // when several land in a row, so the stickers of a reward list climb like a little tune.
      pop(s, hz('D5'), 0, 1, 0.14);
    },
  },
  purchase: {
    cat: 'reward',
    len: 0.6,
    ms: [200, 520],
    build(s) {
      // A receipt stamped and a small bell rung: the till of a toy shop.
      const e = s.echo(0.06, 0.22, 0.2, 4500);
      stamp(s, 0, 0.7, 175);
      kalimba(s, hz('E6'), 0.07, 0.15, 0.6);
      bell(s, hz('A6'), 0.12, 0.3, 0.7, { bus: e, amt: 0.3 });
    },
  },

  // ---------------------------------------------------------------- summon (escalating, one instrument family)
  summon_common: {
    cat: 'tick',
    len: 0.22,
    ms: [60, 200],
    // Rapid summoning (four or more a second) thins out: 80 ms apart and quieter as it gets denser.
    rule: { maxVoices: 4, minGap: 0.08, falloff: 0.25 },
    build(s) {
      // A sticker pressed onto the board: a pitched pop (E5) and a little puff of paper.
      pop(s, hz('E5'), 0, 1, 0.12);
      puff(s, 0, 0.06, 0.25, 2600, 1500);
    },
  },
  summon_rare: {
    cat: 'combat',
    len: 0.5,
    ms: [160, 440],
    rule: { maxVoices: 4, minGap: 0.08, falloff: 0.25 },
    build(s) {
      // The same pop, then two kalimba tines (G5, C6) climbing out of it: the first step of the ladder.
      pop(s, hz('E5'), 0, 0.9, 0.12);
      kalimba(s, hz('G5'), 0.07, 0.2, 0.7);
      kalimba(s, hz('C6'), 0.12, 0.3, 0.9);
      puff(s, 0, 0.06, 0.2, 2600, 1500);
    },
  },
  summon_epic: {
    cat: 'reward',
    len: 0.8,
    ms: [400, 760],
    rule: { maxVoices: 3, minGap: 0.08, falloff: 0 },
    build(s) {
      // The pop, a marimba triad rolled upward (G5 C6 E6), a small bell on top and a puff of confetti.
      const e = s.echo(0.06, 0.2, 0.22, 4500);
      pop(s, hz('E5'), 0, 0.9, 0.12);
      ['G5', 'C6', 'E6'].forEach((n, k) => mallet(s, hz(n), 0.1 + k * 0.07, 0.25, 0.8 + k * 0.1));
      bell(s, hz('G6'), 0.28, 0.4, 0.6, { bus: e, amt: 0.35 });
      puff(s, 0.12, 0.2, 0.35, 3500, 1500);
    },
  },
  summon_legendary: {
    cat: 'big',
    trim: -2,
    len: 1.2,
    ms: [700, 1150],
    build(s) {
      // The board takes the weight (a low felt thump), five marimba steps climb C5-E5-G5-C6-E6, a kalimba cascade and a
      // bell ring above, and a paper shaker and a cloud of confetti fill the air under it.
      const e = s.echo(0.07, 0.25, 0.25, 5000);
      pop(s, hz('C5'), 0, 0.8, 0.14);
      thump(s, 110, 48, 0.1, 0.4, 0.9, 0.2, 0.5);
      ['C5', 'E5', 'G5', 'C6', 'E6'].forEach((n, k) => mallet(s, hz(n), 0.1 + k * 0.065, 0.35, 0.75 + k * 0.05, k >= 3 ? { bus: e, amt: 0.3 } : undefined));
      ['G6', 'C7', 'E7', 'G7'].forEach((n, k) => kalimba(s, hz(n), 0.4 + k * 0.06, 0.3, 0.35));
      bell(s, hz('C7'), 0.45, 0.5, 0.4, { bus: e, amt: 0.35 });
      puff(s, 0.1, 0.35, 0.5, 3600, 1400);
      shake(s, 0.12, 0.6, 0.45);
    },
  },
  summon_mythic: {
    cat: 'big',
    trim: 0,
    len: 1.7,
    ms: [1100, 1600],
    build(s) {
      // The same figure at full size: a deep felt thump, a seven-step marimba run (C5 to C7), a roll on C6, a kalimba
      // shower, two hand bells, a paper shaker and a big cloud of confetti. All of it wood, felt and paper.
      const e = s.echo(0.08, 0.28, 0.28, 5000);
      pop(s, hz('C5'), 0, 0.8, 0.14);
      thump(s, 90, 40, 0.1, 0.6, 1, 0.3, 0.5);
      ['C5', 'E5', 'G5', 'C6', 'E6', 'G6', 'C7'].forEach((n, k) => mallet(s, hz(n), 0.1 + k * 0.06, 0.5, 0.75 + k * 0.04, k >= 4 ? { bus: e, amt: 0.3 } : undefined));
      for (let k = 0; k < 5; k++) mallet(s, hz('C6'), 0.55 + k * 0.05, 0.3, 0.45 - k * 0.05);
      ['E7', 'G6', 'C7', 'D7', 'E7'].forEach((n, k) => kalimba(s, hz(n), 0.6 + k * 0.08, 0.35, 0.35));
      bell(s, hz('G6'), 0.5, 0.6, 0.45, { bus: e, amt: 0.35 });
      bell(s, hz('C7'), 0.7, 0.6, 0.4, { bus: e, amt: 0.35 });
      puff(s, 0.1, 0.5, 0.55, 3800, 1300);
      shake(s, 0.15, 0.7, 0.7);
    },
  },

  // ---------------------------------------------------------------- merge & friends
  merge: {
    cat: 'combat',
    len: 0.5,
    ms: [150, 480],
    build(s) {
      // A pop where the two cats meet, then a ukulele pair that rises (E5 up to A5). playStep lifts the whole figure, so
      // a higher rank lands one step higher.
      const e = s.echo(0.06, 0.2, 0.2, 4500);
      pop(s, hz('C5'), 0, 0.9, 0.1);
      pluck(s, hz('E5'), 0.06, 0.16, 0.8);
      pluck(s, hz('A5'), 0.11, 0.3, 1, { bus: e, amt: 0.3 });
    },
  },
  merge_big: {
    cat: 'reward',
    len: 0.8,
    ms: [350, 760],
    build(s) {
      // A stamp (the new cat is official), a marimba triad rolled upward with a kalimba tine on top and a puff of confetti.
      const e = s.echo(0.07, 0.22, 0.22, 4500);
      stamp(s, 0, 0.8, 170);
      ['C5', 'E5', 'G5', 'C6'].forEach((n, k) => mallet(s, hz(n), 0.08 + k * 0.05, 0.4, 0.7, { bus: e, amt: 0.25 }));
      kalimba(s, hz('E6'), 0.28, 0.3, 0.45);
      puff(s, 0.08, 0.25, 0.4, 3400, 1500);
    },
  },
  sell: {
    cat: 'combat',
    trim: -3,
    len: 0.4,
    ms: [80, 330],
    build(s) {
      // A paper slip torn off (a short falling swish) and two coins dropped on wood (E6, B5).
      whoosh(s, 3000, 1000, 0, 0.06, 0.6, 0.8, 0.3);
      kalimba(s, hz('E6'), 0.03, 0.12, 0.8);
      kalimba(s, hz('B5'), 0.08, 0.14, 1);
    },
  },
  upgrade: {
    cat: 'reward',
    len: 0.7,
    ms: [250, 620],
    build(s) {
      // A light stamp, a ukulele strum climbing G-B-D and a marimba G on top. playStep makes it a ladder for synergy steps.
      const e = s.echo(0.06, 0.2, 0.2, 4500);
      stamp(s, 0, 0.6, 190);
      ['G4', 'B4', 'D5'].forEach((n, k) => pluck(s, hz(n), 0.07 + k * 0.03, 0.3, 0.8));
      mallet(s, hz('G5'), 0.18, 0.4, 0.9, { bus: e, amt: 0.3 });
    },
  },
  place: {
    cat: 'ui',
    len: 0.12,
    ms: [40, 125],
    build(s) {
      // A cat slid across the felt board: a short swish, then the pat of the landing and a faint tap of the sticker's edge.
      whoosh(s, 700, 1600, 0, 0.05, 0.6, 0.7, 0.5);
      thump(s, 300, 200, 0.04, 0.06, 0.5, 0.03);
      paper(s, 0.04, 1500, 0.35, 0.02);
    },
  },
  pickup: {
    cat: 'ui',
    len: 0.1,
    ms: [30, 110],
    build(s) {
      // A sticker peeled off the board: a swish that rises, with a small upward pop in it.
      whoosh(s, 1500, 3200, 0, 0.04, 0.7, 0.8, 0.4);
      s.tone({ f: 420, f2: 640, sw: 0.03, at: 0.005, dur: 0.05, v: 0.5, a: 0.003, s: 0.01 });
    },
  },
} satisfies Partial<Record<SfxId, Recipe>>;
