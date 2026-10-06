/**
 * Recipes: UI, economy / rewards, summon and merge. Each build() says WHY its layers exist:
 * a sine pitch-drop is a round "pop", a noise tick is the touch, inharmonic partials are glass,
 * a detuned saw stack with a rising filter is "power". Levels inside a recipe are relative only;
 * the baker normalises to the category target.
 */
import type { SfxId } from './api';
import { bell, blip, chime, sparkles, thump, tick, whoosh, type Recipe } from './recipe';
import { hz } from './theory';

export const UI_RECIPES: Partial<Record<SfxId, Recipe>> = {
  // ---------------------------------------------------------------- UI
  ui_click: {
    cat: 'ui',
    len: 0.12,
    ms: [40, 120],
    build(s) {
      // Down-gliding sine = soft "bloop"; an octave ghost adds air; the lowpassed tick is the fingertip.
      thump(s, 760, 430, 0, 0.075, 1, 0.045);
      s.tone({ f: 1500, f2: 900, sw: 0.03, dur: 0.045, v: 0.22 });
      tick(s, 0, 2200, 0.01, 0.28, 0.7);
    },
  },
  ui_back: {
    cat: 'ui',
    len: 0.14,
    ms: [40, 120],
    build(s) {
      // Lower and slightly slower than click: the same gesture "going back".
      thump(s, 660, 370, 0, 0.095, 1, 0.06);
      s.tone({ w: 'triangle', f: 330, f2: 190, sw: 0.06, dur: 0.085, v: 0.32 });
      tick(s, 0, 1500, 0.01, 0.2, 0.7);
    },
  },
  ui_tab: {
    cat: 'ui',
    len: 0.1,
    ms: [40, 110],
    build(s) {
      // Upward blip: forward / selection.
      blip(s, hz('B5'), 0, 0.07, 0.8, hz('D6'));
      tick(s, 0, 3200, 0.008, 0.3, 2);
    },
  },
  ui_toggle: {
    cat: 'ui',
    len: 0.1,
    ms: [40, 110],
    build(s) {
      // Mechanical "tik" plus a pip; consumers pitch it up/down for on/off.
      tick(s, 0, 1700, 0.014, 0.9, 3);
      s.tone({ f: 700, f2: 1000, sw: 0.03, at: 0.008, dur: 0.055, v: 0.55 });
    },
  },
  ui_popup_open: {
    cat: 'ui',
    len: 0.14,
    ms: [80, 120],
    build(s) {
      whoosh(s, 500, 2400, 0, 0.1, 0.5, 1.1, 0.55);
      s.tone({ f: 400, f2: 800, sw: 0.08, lin: true, dur: 0.1, v: 0.35 });
      chime(s, hz('D6'), 0.05, 0.06, 0.3);
    },
  },
  ui_popup_close: {
    cat: 'ui',
    len: 0.12,
    ms: [60, 110],
    build(s) {
      whoosh(s, 2000, 500, 0, 0.09, 0.45, 1.1, 0.3);
      s.tone({ f: 700, f2: 350, sw: 0.08, dur: 0.09, v: 0.32 });
    },
  },
  ui_error: {
    cat: 'ui',
    len: 0.16,
    ms: [80, 125],
    build(s) {
      // Two dull buzzes: square + detuned saw (a ~9 Hz beat) through a low lowpass. The fundamental
      // sits at 155 Hz so its 2nd/3rd harmonics still reach a phone speaker; soft attack, nothing sharp.
      for (const at of [0, 0.06]) {
        const filter = { t: 'lowpass' as const, f: 700, q: 0.7 };
        s.tone({ w: 'square', f: 155, at, dur: 0.048, v: 0.5, a: 0.005, s: 0.6, r: 0.014, filter });
        s.tone({ w: 'sawtooth', f: 164, at, dur: 0.048, v: 0.3, a: 0.005, s: 0.6, r: 0.014, filter });
      }
    },
  },
  ui_confirm: {
    cat: 'ui',
    len: 0.15,
    ms: [80, 120],
    build(s) {
      // Two rising bright notes (C6 -> G6, a fifth): "done".
      blip(s, hz('C6'), 0, 0.06, 0.75);
      blip(s, hz('G6'), 0.045, 0.07, 0.9);
    },
  },

  // ---------------------------------------------------------------- economy / rewards
  coin: {
    cat: 'reward',
    len: 0.32,
    ms: [100, 350],
    variants: 3,
    rate: 0.025,
    rule: { maxVoices: 6, minGap: 0.035, falloff: 0.12 },
    build(s, v) {
      // Classic B5 -> E6 two-note blip, rounded: triangle body + sine octave, plus a quiet sparkle partial.
      const p = v.j(0.02);
      blip(s, hz('B5') * p, 0, 0.055, 0.85);
      blip(s, hz('E6') * p, 0.05, 0.17, 1);
      s.tone({ f: hz('E6') * 3 * p, at: 0.05, dur: 0.1, v: 0.1, s: 0.01 });
    },
  },
  coin_many: {
    cat: 'reward',
    len: 0.95,
    ms: [350, 900],
    build(s) {
      // A cascade: accelerating pentatonic coin blips over a metallic rattle bed, ending on a bell.
      const seq = ['E6', 'G6', 'A6', 'C7', 'D7', 'E7', 'G6', 'C7'];
      let t = 0;
      for (let k = 0; k < 9; k++) {
        const f = hz(seq[k % seq.length] as string) * (1 + (s.rand() - 0.5) * 0.01);
        blip(s, f, t, 0.1, 0.5 + k * 0.05);
        t += 0.062 - k * 0.003;
      }
      s.noise({ at: 0.02, dur: 0.5, v: 0.1, a: 0.04, s: 0.2, r: 0.2, trem: { rate: 32, depth: 0.9 }, filter: { t: 'highpass', f: 6500 } });
      bell(s, hz('E7'), 0.5, 0.3, 0.45);
    },
  },
  gem: {
    cat: 'reward',
    len: 0.9,
    ms: [250, 800],
    build(s) {
      // Glass: struck-bar partials (1, 2.76, 5.4) plus an FM overtone with an inharmonic 3.5 ratio, in an echo.
      const e = s.echo(0.075, 0.35, 0.35, 7000);
      bell(s, hz('G6'), 0, 0.5, 1, { bus: e, amt: 0.5 });
      s.tone({ f: hz('D7'), fm: { ratio: 3.5, idx: 1.4, idx2: 0, idxT: 0.3 }, at: 0.03, dur: 0.4, v: 0.3, send: { bus: e, amt: 0.5 } });
    },
  },
  reward_claim: {
    cat: 'reward',
    len: 0.85,
    ms: [300, 800],
    build(s) {
      // "ba-DING": a low rounded "ba", then a bright bell pair with a sparkle fall-off.
      const e = s.echo(0.08, 0.3, 0.3, 6500);
      thump(s, 330, 200, 0, 0.09, 0.8, 0.05);
      blip(s, hz('B5'), 0.06, 0.1, 0.8);
      bell(s, hz('E6'), 0.11, 0.42, 1, { bus: e, amt: 0.5 });
      sparkles(s, 0.16, 3, 0.15, [hz('E7'), hz('G7'), hz('B6')], 0.22, 0.12, { bus: e, amt: 0.4 });
    },
  },
  level_up: {
    cat: 'reward',
    len: 1.0,
    ms: [450, 950],
    trim: 1,
    build(s) {
      // Fast bright C-major arpeggio (65 ms steps) landing on a long ringing C6.
      const e = s.echo(0.09, 0.38, 0.3, 6500);
      ['C5', 'E5', 'G5'].forEach((n, k) => blip(s, hz(n), k * 0.065, 0.12, 0.8));
      chime(s, hz('C6'), 0.195, 0.5, 1, { bus: e, amt: 0.5 });
      bell(s, hz('E7'), 0.22, 0.3, 0.3, { bus: e, amt: 0.4 });
    },
  },
  star: {
    cat: 'reward',
    len: 0.65,
    ms: [200, 560],
    build(s) {
      // A single twinkle: B6 with glassy partials and a delayed D7 that shivers.
      bell(s, hz('B6'), 0, 0.32, 0.9);
      s.tone({ f: hz('D7'), at: 0.06, dur: 0.3, v: 0.3, trem: { rate: 14, depth: 0.6 }, s: 0.01 });
    },
  },
  purchase: {
    cat: 'reward',
    len: 0.7,
    ms: [250, 650],
    build(s) {
      // Cash-register: two quick blips, a coin-rattle noise burst, then a bell ring.
      const e = s.echo(0.07, 0.3, 0.25, 6000);
      blip(s, hz('E6'), 0, 0.06, 0.8);
      blip(s, hz('A6'), 0.045, 0.08, 0.9);
      s.noise({ at: 0.04, dur: 0.14, v: 0.14, a: 0.005, s: 0.1, trem: { rate: 40, depth: 1 }, filter: { t: 'highpass', f: 6500 } });
      bell(s, hz('E6'), 0.1, 0.34, 0.7, { bus: e, amt: 0.4 });
    },
  },

  // ---------------------------------------------------------------- summon (escalating)
  summon_common: {
    cat: 'reward',
    trim: -2,
    len: 0.3,
    ms: [100, 220],
    build(s) {
      // A short soft pop: pitch-drop body, an upward "plop" blip, a faint chime tail and a lowpassed air puff.
      thump(s, 460, 200, 0, 0.14, 1, 0.08);
      s.tone({ f: 840, f2: 1250, sw: 0.05, at: 0.012, dur: 0.095, v: 0.3 });
      s.tone({ f: hz('E6'), at: 0.05, dur: 0.07, v: 0.12 });
      s.noise({ dur: 0.07, v: 0.22, a: 0.002, s: 0.005, filter: { t: 'lowpass', f: 2200 } });
    },
  },
  summon_rare: {
    cat: 'reward',
    trim: 1,
    len: 0.55,
    ms: [220, 500],
    build(s) {
      // Common's pop + a rising air whoosh + a single bell at E6: the first "sparkle" of the ladder.
      const e = s.echo(0.07, 0.3, 0.25, 6500);
      whoosh(s, 700, 3200, 0, 0.1, 0.32, 1.2, 0.8);
      thump(s, 460, 200, 0.01, 0.12, 1, 0.07);
      bell(s, hz('E6'), 0.06, 0.32, 0.7, { bus: e, amt: 0.5 });
      sparkles(s, 0.12, 2, 0.08, [hz('E7'), hz('A6')], 0.12, 0.1, { bus: e, amt: 0.4 });
    },
  },
  summon_epic: {
    cat: 'combat',
    trim: 0,
    len: 0.95,
    ms: [450, 900],
    build(s) {
      // Short riser, a weighted thump on the drop, a two-note chime (E6, A6) and a twinkle tail.
      const e = s.echo(0.08, 0.38, 0.32, 7000);
      whoosh(s, 400, 3600, 0, 0.22, 0.65, 2, 0.85);
      thump(s, 240, 78, 0.2, 0.3, 1.1, 0.14);
      s.noise({ at: 0.2, dur: 0.1, v: 0.35, s: 0.01, filter: { t: 'lowpass', f: 3500, f2: 500, sw: 0.1 } });
      bell(s, hz('E6'), 0.21, 0.45, 0.85, { bus: e, amt: 0.5 });
      bell(s, hz('A6'), 0.3, 0.45, 0.75, { bus: e, amt: 0.5 });
      sparkles(s, 0.32, 6, 0.3, [hz('E7'), hz('A7'), hz('B7'), hz('C7')], 0.22, 0.14, { bus: e, amt: 0.4 });
      s.noise({ at: 0.3, dur: 0.25, v: 0.07, a: 0.02, s: 0.05, filter: { t: 'highpass', f: 7000 } });
    },
  },
  summon_legendary: {
    cat: 'big',
    trim: -1,
    len: 1.7,
    ms: [800, 1450],
    stereo: true,
    build(s) {
      // Pull-in riser (noise + saw sweep), sub thump on the hit, a rising C-major arpeggio that
      // blooms into a detuned-saw chord, with a high shimmer in a short room.
      const rv = s.reverb(0.55, 0.28);
      const e = s.echo(0.09, 0.4, 0.3, 7000);
      whoosh(s, 300, 5200, 0, 0.38, 0.8, 2.2, 0.9);
      s.tone({ w: 'sawtooth', f: 140, f2: 620, sw: 0.38, dur: 0.4, v: 0.2, a: 0.1, filter: { t: 'lowpass', f: 600, f2: 3500, sw: 0.38 } });
      thump(s, 110, 42, 0.38, 0.5, 0.9, 0.3, 0.5);
      s.noise({ at: 0.38, dur: 0.28, v: 0.55, s: 0.01, filter: { t: 'lowpass', f: 5200, f2: 420, sw: 0.25 } });
      ['C5', 'E5', 'G5', 'C6'].forEach((n, k) => {
        const at = 0.38 + k * 0.065;
        chime(s, hz(n), at, 0.5, 0.65, { bus: rv, amt: 0.6 });
        s.tone({ w: 'sawtooth', f: hz(n), at: at + 0.02, dur: 0.6, v: 0.09, a: 0.03, uni: [-9, 9], filter: { t: 'lowpass', f: 2600 }, pan: k % 2 ? 0.35 : -0.35 });
      });
      sparkles(s, 0.55, 9, 0.5, [hz('C7'), hz('E7'), hz('G7'), hz('B6'), hz('D7'), hz('C8')], 0.24, 0.18, { bus: e, amt: 0.5 });
      s.noise({ at: 0.45, dur: 0.6, v: 0.09, a: 0.05, s: 0.05, trem: { rate: 18, depth: 0.8 }, filter: { t: 'highpass', f: 7500 } });
    },
  },
  summon_mythic: {
    cat: 'big',
    trim: 1,
    len: 2.5,
    ms: [1300, 2000],
    stereo: true,
    build(s) {
      // Riser (noise + sweeping saw stack + sine glide), deep sub thump with a saturated noise burst,
      // a bright Cmaj9 supersaw chord with bell arpeggio, and a fast high shimmer cascade in a hall.
      const rv = s.reverb(1.0, 0.3);
      const e = s.echo(0.1, 0.45, 0.32, 8000);
      whoosh(s, 250, 7500, 0, 0.65, 0.95, 2.8, 0.92);
      s.tone({ w: 'sawtooth', f: 110, f2: 880, sw: 0.62, dur: 0.66, v: 0.26, a: 0.2, uni: [-12, 12], filter: { t: 'lowpass', f: 500, f2: 6000, sw: 0.62 } });
      s.tone({ f: 440, f2: 1760, sw: 0.62, lin: true, dur: 0.66, v: 0.18, a: 0.3 });
      thump(s, 90, 30, 0.62, 0.8, 1.0, 0.5, 0.5);
      s.noise({ at: 0.62, dur: 0.5, v: 0.9, s: 0.01, sat: 0.5, filter: { t: 'lowpass', f: 7000, f2: 250, sw: 0.5 } });
      bell(s, hz('G6'), 0.62, 0.9, 0.45, { bus: rv, amt: 0.5 });
      ['C5', 'E5', 'G5', 'B5', 'D6'].forEach((n, k) => {
        const at = 0.66 + k * 0.06;
        s.tone({ w: 'sawtooth', f: hz(n), at, dur: 1.1, v: 0.085, a: 0.04, uni: [-10, 10], filter: { t: 'lowpass', f: 3500, f2: 6500, sw: 0.5 }, pan: (k - 2) * 0.3, send: { bus: rv, amt: 0.5 } });
        chime(s, hz(n) * 2, at, 0.8, 0.5, { bus: e, amt: 0.5 });
      });
      ['C7', 'E7', 'G7', 'B7', 'D8', 'E7', 'G7', 'C8', 'E8'].forEach((n, k) => {
        s.tone({ f: hz(n), at: 0.75 + k * 0.05, dur: 0.5, v: 0.25, a: 0.003, trem: { rate: 12, depth: 0.5 }, pan: k % 2 ? 0.5 : -0.5, send: { bus: e, amt: 0.6 } });
      });
      s.noise({ at: 0.62, dur: 1.1, v: 0.1, a: 0.08, s: 0.05, trem: { rate: 16, depth: 0.8 }, filter: { t: 'highpass', f: 8000 } });
    },
  },

  // ---------------------------------------------------------------- merge & friends
  merge: {
    cat: 'combat',
    trim: -3,
    len: 0.55,
    ms: [200, 480],
    build(s) {
      // Two stages: a falling "suck-in" (noise + sine glide down), then a pop that jumps a fifth (C5 -> G5).
      whoosh(s, 3200, 500, 0, 0.1, 0.65, 1.5, 0.7);
      s.tone({ f: 700, f2: 260, sw: 0.1, dur: 0.11, v: 0.42 });
      blip(s, hz('C5'), 0.1, 0.07, 0.85);
      bell(s, hz('G5'), 0.15, 0.3, 0.9);
    },
  },
  merge_big: {
    cat: 'big',
    trim: -5,
    len: 1.3,
    ms: [550, 1100],
    stereo: true,
    build(s) {
      // A longer, lower suck-in with a sub, a thumping pop, then a C-major chime chord and sparkle.
      const e = s.echo(0.09, 0.4, 0.3, 7000);
      whoosh(s, 4200, 400, 0, 0.17, 0.75, 1.8, 0.7);
      s.tone({ f: 900, f2: 150, sw: 0.17, dur: 0.19, v: 0.45 });
      s.tone({ f: 80, f2: 45, dur: 0.2, v: 0.5, a: 0.03 });
      s.noise({ at: 0.17, dur: 0.15, v: 0.45, s: 0.01, filter: { t: 'lowpass', f: 4500, f2: 600, sw: 0.15 } });
      thump(s, 160, 55, 0.17, 0.3, 1.1, 0.12);
      ['C5', 'E5', 'G5', 'C6'].forEach((n, k) => chime(s, hz(n), 0.17 + k * 0.05, 0.55, 0.7, { bus: e, amt: 0.5 }));
      s.tone({ w: 'sawtooth', f: hz('C5'), at: 0.22, dur: 0.55, v: 0.1, a: 0.03, uni: [-8, 8], filter: { t: 'lowpass', f: 2500 } });
      sparkles(s, 0.3, 6, 0.4, [hz('E7'), hz('G7'), hz('C7'), hz('D7')], 0.2, 0.16, { bus: e, amt: 0.5 });
    },
  },
  sell: {
    cat: 'reward',
    trim: -1,
    len: 0.4,
    ms: [100, 320],
    build(s) {
      // Two descending dings with a coin clink: income going into the purse.
      blip(s, hz('E6'), 0, 0.07, 0.8);
      blip(s, hz('B5'), 0.05, 0.12, 0.7);
      s.noise({ at: 0.01, dur: 0.1, v: 0.14, a: 0.003, s: 0.05, filter: { t: 'highpass', f: 7000 } });
    },
  },
  upgrade: {
    cat: 'reward',
    trim: 1,
    len: 0.75,
    ms: [300, 650],
    build(s) {
      // Rising glide (power-up), two arrival notes, a bell and a small sparkle.
      const e = s.echo(0.08, 0.3, 0.25, 6500);
      s.tone({ w: 'triangle', f: 330, f2: 880, sw: 0.16, dur: 0.2, v: 0.55 });
      blip(s, hz('A5'), 0.16, 0.08, 0.8);
      bell(s, hz('E6'), 0.2, 0.36, 0.9, { bus: e, amt: 0.5 });
      sparkles(s, 0.24, 3, 0.15, [hz('A6'), hz('C7'), hz('E7')], 0.2, 0.12, { bus: e, amt: 0.4 });
    },
  },
  place: {
    cat: 'ui',
    len: 0.16,
    ms: [60, 125],
    build(s) {
      // Soft thud on a felt board: sine drop + lowpassed puff + a faint tick.
      thump(s, 340, 160, 0, 0.1, 1, 0.05, 0.3);
      s.noise({ dur: 0.04, v: 0.3, a: 0.002, s: 0.01, filter: { t: 'lowpass', f: 1400 } });
      tick(s, 0, 1600, 0.01, 0.3, 1);
    },
  },
  pickup: {
    cat: 'ui',
    len: 0.12,
    ms: [50, 120],
    build(s) {
      // Quick upward blip: lifted off the board.
      s.tone({ f: 620, f2: 1050, sw: 0.04, dur: 0.07, v: 0.7 });
      s.tone({ f: 2100, at: 0.02, dur: 0.05, v: 0.22 });
    },
  },
};
