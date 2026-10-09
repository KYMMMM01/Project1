/**
 * The instrument kits of the newer tracks. Every track gets the same acoustic palette (a felt kick, a brush snare, a paper shaker, an upright
 * bass, a ukulele, a marimba, kalimba tines) voiced differently, plus the one or two sounds that give a place its character: pots and spoons in
 * the kitchen, bubbles and drips in the bath, a flute and birds in the garden, a clock in the clinic, coins in the gold dungeon.
 * A kit maps an `Inst` id to a voice; an id a kit leaves out is simply silent in that track.
 */
import { bird, bloop, clank, coin, crash, drop, flute, harp, hat, kick, marimba, mutedBass, pluck, plink, snare, sparkle, tick, tine, tink, tom, ukulele, upright } from './parts';
import { Inst, type MusicTrackId } from './scores';
import type { Synth } from './synth';
import { midiToHz } from './theory';

type Voice = (s: Synth, notes: readonly number[], vel: number, dur: number) => void;
type Kit = Readonly<Partial<Record<number, Voice>>>;

const f = midiToHz;
const hz = (notes: readonly number[]): number => f(notes[0] as number);

const kickV = (level: number, f0: number, f1: number, len: number): Voice => (s, _n, v) => kick(s, level * v, f0, f1, len);
const snareV = (level: number, body: number, bright: number): Voice => (s, _n, v) => snare(s, level * v, body, bright);
const hatV = (level: number, len: number, centre: number): Voice => (s, _n, v) => hat(s, level * v, len, centre);
const shakerV = (centre: number, swell: number): Voice => (s, _n, v) =>
  s.noise({ dur: 0.09, v: v * 0.32, a: swell, s: 0.04, filter: { t: 'bandpass', f: centre, q: 0.9 } });
const tomV = (level: number): Voice => (s, n, v) => tom(s, level * v, n[0] as number);
const crashV = (len: number, midis: readonly number[]): Voice => (s, _n, v) => crash(s, v, len, midis);
const clavesV: Voice = (s, _n, v) => tick(s, v, 1100);
const bassV = (level: number, hold: number): Voice => (s, n, v, d) => upright(s, hz(n), v * level, d, hold);
const mutedBassV: Voice = (s, n, v, d) => mutedBass(s, hz(n), v, d);
const ukeV = (gap: number): Voice => (s, n, v, d) => ukulele(s, n, v, d, gap);
const padV = (level: number, lp0: number, lp1: number, attack: number, release: number, uni = 8): Voice => (s, n, v, d) => {
  for (const note of n) {
    s.tone({ w: 'triangle', f: f(note), dur: d + release, v: v * level, a: attack, s: 1, r: release, uni: [uni], filter: { t: 'lowpass', f: lp0, f2: lp1, sw: d } });
  }
};
const pluckV = (level: number, extra = 0.08): Voice => (s, n, v, d) => pluck(s, hz(n), v * level, d + extra);
const harpV = (level: number): Voice => (s, n, v, d) => harp(s, hz(n), v * level, d);
const marimbaV = (level: number, tail: number, doubled: number): Voice => (s, n, v, d) => {
  marimba(s, hz(n), v * level, d, tail);
  if (doubled > 0) pluck(s, hz(n), v * doubled, d + 0.08);
};
const tineV = (level: number, extra = 0.1): Voice => (s, n, v, d) => tine(s, hz(n), v * level, d + extra);
const pizzV: Voice = (s, n, v, d) => n.forEach((note) => pluck(s, f(note), v * 0.2, d + 0.12));
const tickV = (pitch: number): Voice => (s, _n, v) => tick(s, v, pitch);

// ------------------------------------------------------------------ the kits

/** Kitchen: bouncy and dry. A pot lid on the backbeat, a spoon on a cup in between, a marimba that hops. */
const KITCHEN: Kit = {
  [Inst.kick]: kickV(0.5, 150, 62, 0.2),
  [Inst.snare]: snareV(0.8, 230, 1900),
  [Inst.openHat]: hatV(0.7, 0.15, 4900),
  [Inst.shaker]: shakerV(5200, 0.013),
  [Inst.tom]: tomV(0.8),
  [Inst.crash]: crashV(0.95, [82, 84, 86, 89, 91]),
  [Inst.bass]: bassV(0.9, 0.3),
  [Inst.chord]: ukeV(0.012),
  [Inst.pad]: padV(0.045, 1500, 2200, 0.15, 0.3),
  [Inst.arp]: pluckV(0.65),
  [Inst.lead]: marimbaV(0.6, 0.06, 0.18),
  [Inst.lead2]: tineV(0.3),
  [Inst.perc]: (s, n, v) => clank(s, v, hz(n)),
  [Inst.perc2]: (s, n, v) => tink(s, v, hz(n)),
};

/** Bathroom: round and wet. Bubbles and drips for percussion, a harp with a chorus for the shimmer, a kalimba whose notes pop up into pitch. */
const BATH: Kit = {
  [Inst.kick]: kickV(0.42, 130, 55, 0.24),
  [Inst.snare]: snareV(0.55, 200, 1500),
  [Inst.openHat]: hatV(0.6, 0.2, 3800),
  [Inst.shaker]: shakerV(4300, 0.02),
  [Inst.tom]: tomV(0.7),
  [Inst.crash]: crashV(1.1, [87, 89, 91, 94, 96]),
  [Inst.bass]: bassV(0.8, 0.45),
  [Inst.chord]: ukeV(0.03),
  [Inst.pad]: padV(0.05, 1100, 1700, 0.25, 0.5),
  [Inst.arp]: harpV(0.5),
  [Inst.lead]: (s, n, v, d) => drop(s, hz(n), v * 0.55, d),
  [Inst.lead2]: tineV(0.3),
  [Inst.perc]: (s, n, v) => bloop(s, v, hz(n)),
  [Inst.perc2]: (s, n, v) => plink(s, v, hz(n)),
  [Inst.orn]: (s, n, v) => [1, 1.26, 1.5].forEach((ratio, k) => bloop(s, v * (1 - k * 0.15), hz(n) * ratio, k * 0.05)),
};

/** Garden: airy and open. A flute for the tune, a fingerpicked ukulele, a slow pad, and birds in the high branches. */
const GARDEN: Kit = {
  [Inst.kick]: kickV(0.35, 140, 62, 0.2),
  [Inst.snare]: snareV(0.45, 210, 1700),
  [Inst.shaker]: shakerV(5000, 0.016),
  [Inst.tom]: tomV(0.7),
  [Inst.crash]: crashV(1.2, [86, 88, 90, 93, 95]),
  [Inst.bass]: bassV(0.8, 0.5),
  [Inst.chord]: ukeV(0.014),
  [Inst.pad]: padV(0.05, 1600, 2600, 0.5, 0.6),
  [Inst.arp]: pluckV(0.55),
  [Inst.lead]: (s, n, v, d) => flute(s, hz(n), v, d),
  [Inst.lead2]: tineV(0.28),
  [Inst.perc]: tickV(880),
  [Inst.orn]: (s, n, v) => bird(s, v, hz(n), 2 + ((n[0] as number) & 1)),
};

/** Vet clinic: dry and watchful. A clock ticks and tocks all the time, the bass is muted, and the tune is a music box with a nervous edge. */
const CLINIC: Kit = {
  [Inst.kick]: kickV(0.4, 120, 55, 0.2),
  [Inst.snare]: snareV(0.5, 200, 1600),
  [Inst.openHat]: hatV(0.6, 0.12, 5200),
  [Inst.shaker]: shakerV(5600, 0.013),
  [Inst.tom]: tomV(0.7),
  [Inst.crash]: crashV(1.0, [81, 84, 88, 91, 93]),
  [Inst.bass]: bassV(0.85, 0.2),
  [Inst.pad]: padV(0.04, 800, 1100, 0.45, 0.55),
  [Inst.arp]: tineV(0.28, 0.06),
  [Inst.lead]: (s, n, v, d) => {
    tine(s, hz(n), v * 0.5, d + 0.1);
    pluck(s, hz(n), v * 0.2, d + 0.08);
  },
  [Inst.lead2]: tineV(0.3),
  [Inst.stab]: pizzV,
  [Inst.perc]: tickV(1350),
  [Inst.perc2]: tickV(860),
  [Inst.orn]: tineV(0.3, 0.05),
};

/** Gold dungeon: bright and quick. Coins for the tune and for the percussion, a bouncing bass, sparkles over the top. */
const GOLD: Kit = {
  [Inst.kick]: kickV(0.5, 150, 62, 0.2),
  [Inst.snare]: snareV(0.7, 230, 2000),
  [Inst.hat]: hatV(1, 0.05, 5800),
  [Inst.openHat]: hatV(0.8, 0.14, 5000),
  [Inst.tom]: tomV(0.8),
  [Inst.crash]: crashV(0.95, [81, 83, 85, 88, 90]),
  [Inst.bass]: bassV(0.9, 0.25),
  [Inst.chord]: ukeV(0.01),
  [Inst.pad]: padV(0.04, 1800, 2600, 0.12, 0.3),
  [Inst.arp]: pluckV(0.6),
  [Inst.lead]: (s, n, v, d) => coin(s, hz(n), v, d),
  [Inst.lead2]: tineV(0.3),
  [Inst.perc]: (s, n, v) => {
    tink(s, v, hz(n));
    tink(s, v * 0.8, hz(n) * 1.34, 0.045);
  },
  [Inst.orn]: (s, n, v) => sparkle(s, v, hz(n)),
};

/** The second menu track: lighter than the first, a kalimba on the tune and a bossa-ish brush. */
const HOME2: Kit = {
  [Inst.kick]: kickV(0.3, 140, 65, 0.24),
  [Inst.rim]: clavesV,
  [Inst.shaker]: shakerV(5200, 0.013),
  [Inst.tom]: tomV(0.5),
  [Inst.bass]: bassV(1, 0.6),
  [Inst.chord]: ukeV(0.012),
  [Inst.pad]: padV(0.05, 900, 1400, 0.45, 0.55, 6),
  [Inst.arp]: pluckV(0.55, 0.12),
  [Inst.lead]: (s, n, v, d) => tine(s, hz(n), v * 0.55, d + 0.2),
};

/** Result screen, victory: warm and settled; a marimba tune over a gentle pulse. */
const WIN: Kit = {
  [Inst.kick]: kickV(0.35, 140, 62, 0.22),
  [Inst.snare]: snareV(0.5, 220, 1800),
  [Inst.shaker]: shakerV(5200, 0.013),
  [Inst.crash]: crashV(1.3, [84, 86, 88, 91, 93]),
  [Inst.bass]: bassV(0.85, 0.5),
  [Inst.chord]: ukeV(0.012),
  [Inst.pad]: padV(0.05, 1300, 1900, 0.2, 0.5),
  [Inst.arp]: pluckV(0.55),
  [Inst.lead]: marimbaV(0.55, 0.2, 0.15),
  [Inst.orn]: (s, n, v) => sparkle(s, v * 0.7, hz(n)),
};

/** Result screen, defeat: a pillow. Bass, pad and a slow kalimba; nothing hits. */
const LOSE: Kit = {
  [Inst.kick]: kickV(0.25, 120, 55, 0.28),
  [Inst.shaker]: shakerV(4800, 0.03),
  [Inst.bass]: bassV(0.8, 0.7),
  [Inst.chord]: ukeV(0.03),
  [Inst.pad]: padV(0.05, 700, 1000, 0.6, 0.8),
  [Inst.arp]: tineV(0.3, 0.2),
  [Inst.lead]: (s, n, v, d) => tine(s, hz(n), v * 0.5, d + 0.3),
  [Inst.orn]: (s, n, v) => sparkle(s, v * 0.5, hz(n)),
};

/** Elite wave: the boss's dark pad and muted bass at a walking pace, a heartbeat, and a clock that ticks too fast. */
const ELITE: Kit = {
  [Inst.kick]: kickV(0.5, 120, 52, 0.3),
  [Inst.snare]: snareV(0.7, 180, 1500),
  [Inst.shaker]: shakerV(5600, 0.013),
  [Inst.tom]: tomV(0.9),
  [Inst.crash]: crashV(1.3, [74, 77, 81, 86, 89]),
  [Inst.bass]: mutedBassV,
  [Inst.pad]: padV(0.04, 700, 950, 0.45, 0.55),
  [Inst.arp]: tineV(0.3, 0.06),
  [Inst.lead]: marimbaV(0.55, 0.1, 0.25),
  [Inst.lead2]: tineV(0.3),
  [Inst.stab]: pizzV,
  [Inst.perc]: tickV(1100),
  [Inst.perc2]: tickV(760),
};

export const KITS: Readonly<Partial<Record<MusicTrackId, Kit>>> = {
  kitchen: KITCHEN,
  bath: BATH,
  garden: GARDEN,
  clinic: CLINIC,
  gold: GOLD,
  home2: HOME2,
  win: WIN,
  lose: LOSE,
  elite: ELITE,
};

/**
 * Seconds a voice keeps sounding after its note ends, for the voice budget, where a kit's voice is not the default estimate of
 * `voiceLength` (the pads release at the times their `padV` calls give; the harp and the lose track ring longer).
 */
export const KIT_TAILS: Readonly<Partial<Record<MusicTrackId, Readonly<Partial<Record<number, number>>>>>> = {
  kitchen: { [Inst.pad]: 0.3 },
  bath: { [Inst.pad]: 0.5, [Inst.arp]: 0.25 },
  garden: { [Inst.pad]: 0.6 },
  clinic: { [Inst.pad]: 0.55 },
  gold: { [Inst.pad]: 0.3, [Inst.lead]: 0.1 },
  elite: { [Inst.pad]: 0.55 },
  win: { [Inst.pad]: 0.5 },
  lose: { [Inst.pad]: 0.8, [Inst.arp]: 0.3, [Inst.lead]: 0.4 },
  home2: { [Inst.pad]: 0.55, [Inst.lead]: 0.22 },
};
