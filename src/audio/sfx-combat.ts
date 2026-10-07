/**
 * Recipes: combat, flow and gacha. Frequent sounds (shots, hits, deaths) are short, band limited and
 * baked in several variants so a crowded wave stays a texture. The weapon of every cat has its own pair
 * of sounds (sfx-cats.ts) and every material its own answer (sfx-foes.ts); what stays here are the
 * layers that go on top of them: the weight under a heavy blow, the bright crack of a crit, a plain thwack
 * for a hit that has no weapon (a relic) and the generic crumple. The big ones (boss, chest) layer
 * wood, felt and paper; none of them is a siren, a saw or a laser.
 */
import type { SfxId } from './api';
import { body, clack, snap } from './foley';
import { bell, kalimba, knock, mallet, paper, pluck, puff, shake, stamp, thump, whoosh, type Recipe } from './recipe';
import { hz } from './theory';

export const COMBAT_RECIPES = {
  // ---------------------------------------------------------------- shots, one material each
  shoot_arrow: {
    cat: 'fire',
    len: 0.14,
    ms: [50, 180],
    lp: 5000,
    variants: 2,
    rate: 0.05,
    build(s, v) {
      // A paper dart: a short swish of pink noise rising through 1-3 kHz and a rubber-band twang under it.
      const p = v.j(0.06);
      whoosh(s, 1100 * p, 3000 * p, 0, 0.075, 0.9, 1.2, 0.3);
      s.tone({ w: 'triangle', f: 280 * p, f2: 230 * p, sw: 0.035, dur: 0.05, v: 0.35 });
    },
  },
  shoot_magic: {
    cat: 'fire',
    len: 0.2,
    ms: [60, 200],
    lp: 5000,
    variants: 2,
    rate: 0.04,
    build(s, v) {
      // A fizz-pop: a sine bubble that glides up a fifth and a puff of fine fizz (noise chopped at 45 Hz), in a tiny echo.
      const p = v.j(0.05);
      const e = s.echo(0.045, 0.2, 0.2, 4500);
      s.tone({ f: 620 * p, f2: 930 * p, sw: 0.05, dur: 0.1, v: 1, a: 0.003, send: { bus: e, amt: 0.4 } });
      s.noise({ dur: 0.07, v: 0.35, a: 0.005, s: 0.02, trem: { rate: 45, depth: 0.8 }, filter: { t: 'bandpass', f: 3800 * p, q: 1 } });
    },
  },
  shoot_cannon: {
    cat: 'fire',
    trim: 3,
    len: 0.2,
    ms: [60, 220],
    lp: 5000,
    variants: 2,
    rate: 0.04,
    build(s, v) {
      // A cardboard tube popper: a saturated sine drop for the barrel (harmonics keep it audible on a phone speaker),
      // a lowpassed burst for the puff, a dull rattle of the tube.
      const p = v.j(0.05);
      thump(s, 260 * p, 110, 0, 0.12, 0.8, 0.07, 0.3);
      s.noise({ dur: 0.09, v: 1, a: 0.002, s: 0.003, filter: { t: 'lowpass', f: 1400, f2: 400, sw: 0.08 } });
      s.noise({ at: 0.01, dur: 0.05, v: 0.2, a: 0.003, s: 0.02, filter: { t: 'bandpass', f: 700, q: 2 } });
    },
  },
  shoot_ice: {
    cat: 'fire',
    len: 0.14,
    ms: [40, 150],
    lp: 5000,
    variants: 2,
    rate: 0.04,
    build(s, v) {
      // A tiny wind-chime tink: a high sine with a fast decay, a quieter fifth above it and a hushed breath of noise.
      const p = v.j(0.05);
      s.tone({ f: 1760 * p, dur: 0.09, v: 0.8, a: 0.002, s: 0.01 });
      s.tone({ f: 2637 * p, dur: 0.05, v: 0.3, a: 0.002, s: 0.01 });
      s.noise({ dur: 0.04, v: 0.25, a: 0.003, s: 0.01, filter: { t: 'bandpass', f: 4200, q: 1.5 } });
    },
  },
  shoot_lightning: {
    cat: 'fire',
    len: 0.16,
    ms: [40, 160],
    lp: 5000,
    variants: 2,
    rate: 0.04,
    build(s, v) {
      // Cellophane crackle: band-passed noise chopped at 70 Hz and gliding down, a soft triangle blip under it.
      const p = v.j(0.06);
      s.noise({ dur: 0.08, v: 1, a: 0.003, s: 0.02, trem: { rate: 70, depth: 0.8 }, filter: { t: 'bandpass', f: 2400 * p, f2: 1000 * p, sw: 0.07, q: 1.3 } });
      s.tone({ w: 'triangle', f: 900 * p, f2: 450 * p, sw: 0.06, dur: 0.07, v: 0.3, filter: { t: 'lowpass', f: 1800 } });
    },
  },
  shoot_poison: {
    cat: 'fire',
    len: 0.2,
    ms: [60, 200],
    lp: 5000,
    variants: 2,
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
    len: 0.16,
    ms: [50, 160],
    lp: 5000,
    variants: 2,
    rate: 0.04,
    build(s, v) {
      // A paw swipe: two overlapping paper swishes (two claws) that end in a small felt pat where they land.
      const p = v.j(0.06);
      whoosh(s, 1200 * p, 2800 * p, 0, 0.06, 0.9, 1, 0.35);
      whoosh(s, 1400 * p, 3000 * p, 0.04, 0.07, 0.8, 1, 0.35);
      thump(s, 300 * p, 170, 0.07, 0.04, 0.3, 0.02);
    },
  },

  // ---------------------------------------------------------------- impacts
  hit_light: {
    cat: 'hit',
    len: 0.09,
    ms: [25, 90],
    lp: 5000,
    variants: 3,
    rate: 0.06,
    rule: { maxVoices: 4, minGap: 0.045, falloff: 0.2 },
    build(s, v) {
      // The hit of something that is not a cat's weapon (a relic): a soft thwack that stays pleasant at 15+ a second, a felt
      // pat dropping 400 to 250 Hz with a grain of paper and a small bite on top. Very short, no sub.
      const p = v.j(0.08);
      thump(s, 400 * p, 250 * p, 0, 0.045, 0.8, 0.025);
      s.noise({ dur: 0.02, v: 0.7, a: 0.002, s: 0.005, filter: { t: 'bandpass', f: 1500 * p, q: 0.9 } });
      snap(s, 0, 0.3, 3000, 0.01);
    },
  },
  hit_heavy: {
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
  crit: {
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
  explosion: {
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
  freeze: {
    cat: 'combat',
    trim: -4,
    len: 0.5,
    ms: [200, 520],
    build(s) {
      // Frost on a window: three kalimba tines falling (D6 A5 E5) and a hush of high noise on top.
      const e = s.echo(0.055, 0.2, 0.22, 4500);
      ['D6', 'A5', 'E5'].forEach((n, k) => kalimba(s, hz(n), k * 0.06, 0.22, 0.8, { bus: e, amt: 0.3 }));
      s.noise({ at: 0.02, dur: 0.25, v: 0.1, a: 0.05, s: 0.05, trem: { rate: 30, depth: 0.7 }, filter: { t: 'highpass', f: 5000 } });
    },
  },
  stun: {
    cat: 'combat',
    trim: -3,
    len: 0.4,
    ms: [160, 420],
    build(s) {
      // "Bonk", then three dizzy mallet notes (E6 C6 A5) that sag and wobble.
      knock(s, 330, 0, 1, 0.08);
      ['E6', 'C6', 'A5'].forEach((n, k) => {
        const f = hz(n);
        s.tone({ f, f2: f * 0.94, sw: 0.07, at: 0.09 + k * 0.085, dur: 0.14, v: 0.5 - k * 0.04, a: 0.003, d: 0.12, s: 0.02, vib: { rate: 18, cents: 50 } });
      });
    },
  },
  buff: {
    cat: 'combat',
    trim: -3,
    len: 0.5,
    ms: [200, 520],
    build(s) {
      // A power-up: a ukulele strum rising C-E-G, then a marimba triad (C6 E6 G6) lands on top.
      ['C5', 'E5', 'G5'].forEach((n, k) => pluck(s, hz(n), k * 0.03, 0.24, 0.8));
      ['C6', 'E6', 'G6'].forEach((n, k) => mallet(s, hz(n), 0.14 + k * 0.06, 0.2, 0.6));
    },
  },
  heal: {
    cat: 'combat',
    trim: -4,
    len: 0.65,
    ms: [250, 650],
    build(s) {
      // Warm and gentle: a slow-vibrato sine glides up a fifth under a quick kalimba trill (G5 A5 C6 E6 G6).
      const e = s.echo(0.07, 0.2, 0.22, 4500);
      s.tone({ f: 523, f2: 784, sw: 0.25, dur: 0.36, v: 0.4, a: 0.03, vib: { rate: 6, cents: 20 } });
      ['G5', 'A5', 'C6', 'E6', 'G6'].forEach((n, k) => kalimba(s, hz(n), 0.05 + k * 0.045, 0.25, 0.5, { bus: e, amt: 0.3 }));
    },
  },
  enemy_die: {
    cat: 'hit',
    trim: 3,
    len: 0.3,
    ms: [80, 340],
    lp: 5000,
    variants: 3,
    rate: 0.08,
    climb: 12,
    prio: 2,
    rule: { maxVoices: 6, minGap: 0.035, falloff: 0.15 },
    build(s, v) {
      // A paper ball crumpled and popped: a crackle (band-passed noise chopped at 60 Hz) and a soft sine pop falling 440 to 170 Hz.
      const p = v.j(0.1);
      s.noise({ dur: 0.08, v: 0.8, a: 0.004, s: 0.02, trem: { rate: 60, depth: 0.9 }, filter: { t: 'bandpass', f: 1700 * p, q: 1 } });
      thump(s, 440 * p, 170 * p, 0, 0.15, 0.9, 0.1);
    },
  },
  boss_warning: {
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
  boss_roar: {
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
  boss_die: {
    cat: 'big',
    len: 1.4,
    ms: [800, 1400],
    build(s) {
      // A tower of cardboard collapsing: a big felt thud, a crumple of crackling noise that closes down, a cascade of
      // wooden knocks falling in pitch and a last soft thump when the last box lands.
      thump(s, 150, 60, 0, 0.6, 0.9, 0.3, 0.4);
      s.noise({ dur: 0.9, v: 1.1, a: 0.01, s: 0.01, trem: { rate: 40, depth: 0.7 }, filter: [{ t: 'highpass', f: 200 }, { t: 'lowpass', f: 3500, f2: 500, sw: 0.8, q: 0.7 }] });
      for (let k = 0; k < 9; k++) knock(s, 1000 - k * 75 + s.rand() * 60, 0.12 + k * 0.08, 0.9 - k * 0.06, 0.08);
      thump(s, 90, 45, 0.85, 0.3, 0.6, 0.15, 0.4);
    },
  },

  // ---------------------------------------------------------------- flow
  wave_start: {
    cat: 'combat',
    trim: -2,
    len: 0.6,
    ms: [250, 700],
    build(s) {
      // The next wave is coming: two marimba notes (G4 then D5, a fifth up), a low thump under the first and a brush of paper.
      mallet(s, hz('G4'), 0, 0.22, 0.9);
      mallet(s, hz('D5'), 0.1, 0.3, 1);
      thump(s, 110, 70, 0, 0.15, 0.5, 0.06);
      shake(s, 0.08, 0.4, 0.15);
    },
  },
  wave_clear: {
    cat: 'reward',
    len: 0.8,
    ms: [350, 800],
    build(s) {
      // A marimba triad rolled up (C5 E5 G5), a long C6 ring and a small hand bell above it.
      const e = s.echo(0.07, 0.22, 0.22, 4500);
      ['C5', 'E5', 'G5'].forEach((n, k) => mallet(s, hz(n), k * 0.06, 0.25, 0.8));
      mallet(s, hz('C6'), 0.18, 0.45, 1, { bus: e, amt: 0.3 });
      bell(s, hz('G6'), 0.2, 0.3, 0.35, { bus: e, amt: 0.3 });
      shake(s, 0.18, 0.3, 0.2);
    },
  },
  danger_alarm: {
    cat: 'combat',
    trim: -3,
    len: 0.35,
    ms: [150, 330],
    build(s) {
      // A heartbeat knocked out on wood: "lub-dub", the second beat lighter. The director speeds it up as the danger grows.
      thump(s, 120, 85, 0, 0.12, 0.6, 0.06, 0.4);
      thump(s, 110, 80, 0.14, 0.12, 0.4, 0.06, 0.4);
      knock(s, 450, 0, 1, 0.05);
      knock(s, 400, 0.14, 0.8, 0.05);
    },
  },
  countdown_tick: {
    cat: 'ui',
    trim: 1,
    len: 0.1,
    ms: [30, 90],
    build(s) {
      // A wooden "tok" at E6; the countdown raises its pitch with every second, so the last one is the tightest.
      knock(s, 1320, 0, 1, 0.045);
    },
  },
  whoosh: {
    cat: 'combat',
    trim: -6,
    len: 0.4,
    ms: [100, 380],
    build(s) {
      // A sheet of paper passing close: pink noise through a slow rising band-pass, soft at both ends.
      whoosh(s, 450, 2400, 0, 0.26, 1, 0.7, 0.5);
    },
  },
  relic_pick: {
    cat: 'reward',
    len: 0.7,
    ms: [300, 700],
    build(s) {
      // A toy unwrapped: a sticker pop (G5), a marimba fifth climbing out of it (D6, G6), a bell and a rustle of paper.
      const e = s.echo(0.07, 0.22, 0.22, 4500);
      s.tone({ f: hz('G5') * 0.84, f2: hz('G5'), sw: 0.022, dur: 0.14, v: 0.9, a: 0.002, d: 0.12, s: 0.01 });
      mallet(s, hz('D6'), 0.08, 0.3, 0.8);
      mallet(s, hz('G6'), 0.14, 0.4, 1, { bus: e, amt: 0.3 });
      bell(s, hz('B6'), 0.2, 0.3, 0.35, { bus: e, amt: 0.3 });
      puff(s, 0, 0.12, 0.3, 3200, 1500);
    },
  },

  // ---------------------------------------------------------------- gacha / gamble
  chest_shake: {
    cat: 'combat',
    trim: -4,
    len: 0.5,
    ms: [200, 520],
    build(s) {
      // A wooden box rattling: five knocks, alternating between two pitches, and a loose rattle of pebbles inside it.
      [0, 0.07, 0.15, 0.22, 0.3].forEach((t, k) => knock(s, k % 2 ? 280 : 340, t, 0.8 - k * 0.04, 0.06));
      s.noise({ at: 0.05, dur: 0.3, v: 0.12, a: 0.04, s: 0.1, trem: { rate: 24, depth: 1 }, filter: { t: 'bandpass', f: 2200, q: 1.2 } });
    },
  },
  chest_open: {
    cat: 'big',
    trim: -4,
    len: 1.2,
    ms: [600, 1250],
    build(s) {
      // The lid creaks up (a triangle through a rising formant, a slow wobble), pops (a thump and a slap of paper),
      // a puff of confetti flies out and a marimba arpeggio blooms (C5 E5 G5 C6) with a kalimba tine on top.
      const e = s.echo(0.07, 0.25, 0.25, 4800);
      s.tone({ w: 'triangle', f: 150, f2: 260, sw: 0.25, dur: 0.3, v: 0.35, a: 0.05, vib: { rate: 9, cents: 60 }, filter: { t: 'bandpass', f: 500, f2: 1000, sw: 0.25, q: 5 } });
      thump(s, 210, 80, 0.3, 0.2, 1, 0.1);
      paper(s, 0.3, 1500, 0.6, 0.03);
      puff(s, 0.3, 0.22, 0.5, 3200, 1500);
      ['C5', 'E5', 'G5', 'C6'].forEach((n, k) => mallet(s, hz(n), 0.34 + k * 0.06, 0.5, 0.7, { bus: e, amt: 0.3 }));
      kalimba(s, hz('E6'), 0.6, 0.4, 0.4, { bus: e, amt: 0.3 });
    },
  },
  card_flip: {
    cat: 'ui',
    len: 0.14,
    ms: [40, 140],
    climb: 12,
    build(s) {
      // A card turned over: a quick swish, a tap where it lands and a soft D5 tick, so a row of flips climbs the scale.
      whoosh(s, 1500, 4200, 0, 0.05, 0.6, 0.8, 0.4);
      paper(s, 0.05, 2200, 0.6, 0.015);
      s.tone({ f: hz('D5'), at: 0.05, dur: 0.06, v: 0.35, a: 0.002, s: 0.01 });
    },
  },
  reel_tick: {
    cat: 'ui',
    len: 0.07,
    ms: [15, 80],
    climb: 12,
    build(s) {
      // A tiny wooden tick, made to be heard in dozens while a number counts up.
      knock(s, 1500, 0, 1, 0.03);
    },
  },
  reel_stop: {
    cat: 'ui',
    trim: 2,
    len: 0.16,
    ms: [50, 150],
    build(s) {
      // A thunk: a felt pat, a wooden knock on top and a dull lowpassed slap.
      thump(s, 260, 150, 0, 0.1, 0.8, 0.05, 0.3);
      knock(s, 400, 0, 0.6, 0.05);
      s.noise({ dur: 0.035, v: 0.5, a: 0.002, s: 0.005, filter: { t: 'lowpass', f: 800 } });
    },
  },
  jackpot: {
    cat: 'big',
    trim: -2,
    len: 1.3,
    ms: [800, 1350],
    build(s) {
      // A confetti cannon: a marimba run climbing C5 to C7, a shower of kalimba tines falling in a pentatonic set, a
      // stamp and a rolled chord of hand bells.
      const e = s.echo(0.08, 0.28, 0.25, 5000);
      ['C5', 'E5', 'G5', 'C6', 'E6', 'G6', 'C7'].forEach((n, k) => mallet(s, hz(n), k * 0.06, 0.3, 0.7));
      const pool = ['E6', 'G6', 'A6', 'C7', 'D7', 'E7'];
      for (let k = 0; k < 12; k++) {
        kalimba(s, hz(pool[Math.floor(s.rand() * pool.length)] as string), 0.35 + k * 0.05 + s.rand() * 0.03, 0.2, Math.max(0.15, 0.5 - k * 0.025));
      }
      stamp(s, 0.42, 0.9);
      ['C6', 'E6', 'G6'].forEach((n, k) => bell(s, hz(n), 0.45 + k * 0.05, 0.6, 0.4, { bus: e, amt: 0.3 }));
      puff(s, 0.4, 0.5, 0.4, 3600, 1400);
    },
  },
  gamble_fail: {
    cat: 'combat',
    trim: -3,
    len: 0.7,
    ms: [250, 620],
    build(s) {
      // "Oh no", kindly: two plucked notes sagging (E5 then C5), the second one slower, over a quiet low thump.
      pluck(s, hz('E5'), 0, 0.25, 0.9);
      s.tone({ w: 'triangle', f: hz('C5'), f2: hz('B4'), sw: 0.3, at: 0.22, dur: 0.4, v: 0.8, a: 0.004, d: 0.35, s: 0.02, filter: { t: 'lowpass', f: 2000, f2: 900, sw: 0.3 } });
      thump(s, 110, 70, 0.22, 0.15, 0.4, 0.07);
    },
  },
} satisfies Partial<Record<SfxId, Recipe>>;
