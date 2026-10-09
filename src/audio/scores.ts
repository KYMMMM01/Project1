/**
 * Procedural scores for the three music tracks. A Score never touches WebAudio: for every
 * (bar, step) of its 16-bar form it tells a NoteSink which instrument plays what. The player turns
 * those calls into synthesised voices; the tests plug in a recording sink to prove the structure
 * (in-key notes, layer gating, bounded polyphony) without any audio hardware.
 *
 * Form (every track): 4 sections x 4 bars. Section A is the stripped bed, A' adds drums and the
 * hook, B is the contrast (new chords / breakdown + build), C is the full return with a turnaround
 * fill into the loop point, so the 40 s loop never repeats the same arrangement twice in a row.
 */
import type { MusicId } from './api';
import { STEPS_PER_BAR } from './sequencer';
import { noteToMidi } from './theory';

export type MusicTrackId = Exclude<MusicId, 'none'>;

export const Inst = {
  kick: 0,
  snare: 1,
  hat: 2,
  openHat: 3,
  shaker: 4,
  tom: 5,
  crash: 6,
  rim: 7,
  bass: 8,
  chord: 9,
  pad: 10,
  arp: 11,
  lead: 12,
  lead2: 13,
  stab: 14,
  /** Track-specific percussion that is neither drum nor shaker (a pot lid, a bubble, a clock tick, a coin). */
  perc: 15,
  perc2: 16,
  /** Ornament: a bird, a bubble cluster, a sparkle. Shed first when the voice budget is tight. */
  orn: 17,
} as const;

/** Voice-budget priority: >= 2 may use the hard polyphony cap, 0-1 are shed first. */
export const INST_PRIORITY: readonly number[] = [
  3, // kick
  2, // snare
  0, // hat
  2, // openHat
  0, // shaker
  2, // tom
  2, // crash
  1, // rim
  3, // bass
  2, // chord
  2, // pad
  1, // arp
  2, // lead
  2, // lead2
  2, // stab
  1, // perc
  0, // perc2
  0, // orn
];

export interface NoteSink {
  /** One note. `at` shifts the start by a fraction of a step (strums, flams). */
  note(inst: number, midi: number, vel: number, durSteps: number, layer: number, at?: number): void;
  /** Several notes sharing one voice (pad, e-piano chord, stab). */
  chord(inst: number, midis: readonly number[], vel: number, durSteps: number, layer: number, at?: number): void;
}

export interface Score {
  id: MusicTrackId;
  bpm: number;
  bars: number;
  /** Delay of every odd 16th as a fraction of a step (0 = straight). */
  swing: number;
  /** Intensity layers (1 = the track has no layering). */
  layers: number;
  /** Intensity at which layers 1.. reach half level. */
  layerEdges: readonly number[];
  fill(bar: number, step: number, sink: NoteSink): void;
  /** Bars played once, before the loop, when the track is entered (the boss's arrival sting). Multiple of one bar. */
  intro?: { bars: number; fill(bar: number, step: number, sink: NoteSink): void };
  /** The track that follows this one at the end of its loop, on the bar line (a menu track rotates through its variations). */
  then?: MusicTrackId;
}

export const STEPS = STEPS_PER_BAR;
const NONE = -128;

// ------------------------------------------------------------------ pattern helpers

const VEL: Record<string, number> = { X: 1, x: 0.8, o: 0.55, g: 0.3, '.': 0 };

/** 'x...x...' -> per-step velocities. */
export function rhythm(pattern: string): Float32Array {
  if (pattern.length !== STEPS) throw new Error(`rhythm needs ${STEPS} chars: "${pattern}"`);
  const out = new Float32Array(STEPS);
  for (let i = 0; i < STEPS; i++) out[i] = VEL[pattern.charAt(i)] ?? 0;
  return out;
}

/** A one-bar line: per step a value (semitone offset or index) and a duration in steps. */
class StepLine {
  readonly val = new Int8Array(STEPS).fill(NONE);
  readonly dur = new Uint8Array(STEPS);
  has(step: number): boolean {
    return (this.val[step] as number) !== NONE;
  }
}

function lineOf(tuples: ReadonlyArray<readonly [step: number, value: number, dur: number]>): StepLine {
  const l = new StepLine();
  for (const [step, value, dur] of tuples) {
    l.val[step] = value;
    l.dur[step] = dur;
  }
  return l;
}

/** A multi-bar melody addressed by (bar, step). */
class Grid {
  readonly midi: Int16Array;
  readonly dur: Uint8Array;

  constructor(readonly bars: number) {
    this.midi = new Int16Array(bars * STEPS).fill(-1);
    this.dur = new Uint8Array(bars * STEPS);
  }

  has(bar: number, step: number): boolean {
    return (this.midi[bar * STEPS + step] as number) >= 0;
  }
}

type Notes = ReadonlyArray<readonly [step: number, note: string, dur: number]>;

/** Build a melody from per-bar note lists: `{ 4: [[0,'E5',3], ...], 5: [...] }`. */
function melody(bars: number, perBar: Readonly<Record<number, Notes>>): Grid {
  const g = new Grid(bars);
  for (const key of Object.keys(perBar)) {
    const bar = Number(key);
    for (const [step, note, dur] of perBar[bar] as Notes) {
      g.midi[bar * STEPS + step] = noteToMidi(note);
      g.dur[bar * STEPS + step] = dur;
    }
  }
  return g;
}

const midis = (names: readonly string[]): readonly number[] => names.map(noteToMidi);
const shift = (arr: readonly number[], semis: number): readonly number[] => arr.map((m) => m + semis);

/** Emit a rhythm pattern for one instrument at `step`. */
function hit(
  sink: NoteSink,
  pat: Float32Array,
  step: number,
  inst: number,
  midi: number,
  layer: number,
  scale = 1,
  dur = 1,
): void {
  const v = pat[step] as number;
  if (v > 0) sink.note(inst, midi, v * scale, dur, layer);
}

// ------------------------------------------------------------------ HOME (96 BPM, C major, warm and cute)

interface HomeChord {
  bass: number;
  /** Upper voicing for the e-piano; the pad uses it an octave lower. */
  v: readonly number[];
  pad: readonly number[];
}

function homeChord(bass: string, v: readonly string[]): HomeChord {
  const upper = midis(v);
  return { bass: noteToMidi(bass), v: upper, pad: shift(upper, -12) };
}

const H_CMAJ7 = homeChord('C3', ['E4', 'G4', 'B4']);
const H_AM7 = homeChord('A2', ['E4', 'G4', 'C5']);
const H_FMAJ7 = homeChord('F2', ['E4', 'A4', 'C5']);
const H_G6 = homeChord('G2', ['D4', 'G4', 'B4']);
const H_EM7 = homeChord('E2', ['D4', 'G4', 'B4']);
const H_DM7 = homeChord('D2', ['C4', 'F4', 'A4']);
const H_G7 = homeChord('G2', ['D4', 'F4', 'B4']);

const HOME_CHORDS: readonly HomeChord[] = [
  H_CMAJ7, H_AM7, H_FMAJ7, H_G6,
  H_CMAJ7, H_AM7, H_FMAJ7, H_G6,
  H_FMAJ7, H_G6, H_EM7, H_AM7,
  H_FMAJ7, H_EM7, H_DM7, H_G7,
];

const HOME_BASS = [
  lineOf([[0, 0, 9], [10, 7, 5]]),
  lineOf([[0, 0, 6], [6, 0, 2], [8, 7, 4], [12, 12, 4]]),
  lineOf([[0, 0, 4], [4, 7, 4], [8, 12, 4], [12, 7, 4]]),
  lineOf([[0, 0, 6], [6, 0, 2], [8, 7, 4], [12, 12, 4]]),
];
const HOME_COMP = [
  lineOf([[0, 0, 9], [10, 0, 6]]),
  lineOf([[0, 0, 6], [6, 0, 4], [10, 0, 6]]),
  lineOf([[0, 0, 5], [6, 0, 3], [8, 0, 6], [14, 0, 2]]),
  lineOf([[0, 0, 6], [6, 0, 4], [10, 0, 6]]),
];
const HOME_KICK = ['................', 'x.......x.......', 'x.......x.x.....', 'x.......x.......'].map(rhythm);
const HOME_RIM = ['................', '....o.......o...', '....o.......o...', '....o.......o...'].map(rhythm);
const HOME_SHAKER = ['..o...o...o...o.', 'g.x.g.x.g.x.g.x.', 'g.x.g.x.g.x.g.x.', 'g.x.g.x.g.x.g.x.'].map(rhythm);
const HOME_FILL_SHAKER = rhythm('xgxgxgxgxgxgxgxg');
const HOME_FILL_KICK = rhythm('x.......x.x.x.x.');
const HOME_ARP_IDX = [0, 1, 2, 1, 0, 1, 2, 1];

/** Music-box hook, one answer phrase per section; pentatonic + chord tones on the strong beats. */
export const HOME_LEAD = melody(16, {
  4: [[0, 'E5', 3], [3, 'G5', 3], [6, 'E5', 2], [8, 'D5', 2], [10, 'C5', 5]],
  5: [[0, 'E5', 3], [3, 'A5', 3], [6, 'G5', 2], [8, 'E5', 4], [12, 'D5', 2], [14, 'C5', 2]],
  6: [[0, 'C5', 2], [2, 'E5', 2], [4, 'A5', 4], [8, 'G5', 3], [11, 'E5', 2], [13, 'C5', 3]],
  7: [[0, 'D5', 3], [3, 'G5', 3], [6, 'B4', 2], [8, 'D5', 8]],
  8: [[0, 'A5', 2], [2, 'C6', 2], [4, 'A5', 2], [6, 'G5', 2], [8, 'A5', 4], [12, 'E5', 4]],
  9: [[0, 'G5', 2], [2, 'B5', 2], [4, 'A5', 2], [6, 'G5', 2], [8, 'E5', 4], [12, 'D5', 4]],
  10: [[0, 'E5', 4], [4, 'G5', 2], [6, 'B5', 2], [8, 'A5', 4], [12, 'G5', 4]],
  11: [[0, 'A5', 3], [3, 'G5', 3], [6, 'E5', 2], [8, 'E5', 4], [12, 'C5', 4]],
  12: [[0, 'C6', 3], [3, 'A5', 3], [6, 'G5', 2], [8, 'A5', 8]],
  13: [[0, 'G5', 3], [3, 'E5', 3], [6, 'D5', 2], [8, 'E5', 8]],
  14: [[0, 'A5', 3], [3, 'F5', 3], [6, 'D5', 2], [8, 'E5', 4], [12, 'D5', 4]],
  15: [[0, 'B4', 2], [2, 'D5', 2], [4, 'G5', 4], [8, 'F5', 4], [12, 'D5', 4]],
});

export const HOME: Score = {
  id: 'home',
  bpm: 96,
  bars: 16,
  swing: 0.1,
  layers: 1,
  layerEdges: [],
  then: 'home2',
  fill(bar, step, sink) {
    const sec = bar >> 2;
    const ch = HOME_CHORDS[bar] as HomeChord;
    const last = bar === 15;

    hit(sink, last ? HOME_FILL_KICK : (HOME_KICK[sec] as Float32Array), step, Inst.kick, 36, 0, 0.9);
    hit(sink, last ? HOME_FILL_SHAKER : (HOME_SHAKER[sec] as Float32Array), step, Inst.shaker, 60, 0, 0.8);
    hit(sink, HOME_RIM[sec] as Float32Array, step, Inst.rim, 76, 0, 0.7);
    // A tiny descending tom run in the last beat of the loop: the "turn the page" cue.
    if (last && step >= 12) sink.note(Inst.tom, [62, 59, 57, 55][step - 12] as number, 0.5, 2, 0);

    if (step === 0) sink.chord(Inst.pad, ch.pad, sec === 0 ? 0.55 : 0.8, 16.5, 0);

    const bass = HOME_BASS[sec] as StepLine;
    if (bass.has(step)) sink.note(Inst.bass, ch.bass + (bass.val[step] as number), 0.9, bass.dur[step] as number, 0);

    const comp = HOME_COMP[sec] as StepLine;
    if (comp.has(step)) sink.chord(Inst.chord, ch.v, step === 0 ? 0.8 : 0.62, comp.dur[step] as number, 0);

    // Plucked arpeggio: the bridge (bars 8-11) and the first half of the return.
    if ((sec === 2 || bar === 12 || bar === 13) && (step & 1) === 0) {
      const idx = HOME_ARP_IDX[step >> 1] as number;
      sink.note(Inst.arp, (ch.v[idx] as number) + 12, step === 0 ? 0.6 : 0.42, 2, 0);
    }

    if (HOME_LEAD.has(bar, step)) {
      sink.note(Inst.lead, HOME_LEAD.midi[bar * STEPS + step] as number, 0.75, HOME_LEAD.dur[bar * STEPS + step] as number, 0);
    }
  },
};

// ------------------------------------------------------------------ BATTLE (128 BPM, G major, energetic)

interface BattleChord {
  bass: number;
  pad: readonly number[];
  arp: readonly number[];
}

function battleChord(bass: string, pad: readonly string[], arp: readonly string[]): BattleChord {
  return { bass: noteToMidi(bass), pad: midis(pad), arp: midis(arp) };
}

const B_G = battleChord('G2', ['G3', 'B3', 'D4'], ['G4', 'B4', 'D5', 'G5']);
const B_D = battleChord('D3', ['A3', 'D4', 'F#4'], ['F#4', 'A4', 'D5', 'F#5']);
const B_EM = battleChord('E2', ['G3', 'B3', 'E4'], ['E4', 'G4', 'B4', 'E5']);
const B_C = battleChord('C3', ['G3', 'C4', 'E4'], ['E4', 'G4', 'C5', 'E5']);

const BATTLE_CHORDS: readonly BattleChord[] = [
  B_G, B_D, B_EM, B_C,
  B_G, B_D, B_EM, B_C,
  B_EM, B_C, B_G, B_D,
  B_C, B_D, B_EM, B_D,
];

const BAT_BASS_OCT = [0, 0, 12, 0, 0, 0, 12, 0];
const BAT_ARP_IDX = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 1, 2, 3];
const BAT_KICK_STD = rhythm('x...x...x...x...');
const BAT_KICK_CHORUS = rhythm('x...x...x...x.x.');
const BAT_KICK_BUILD8 = rhythm('x.x.x.x.x.x.x.x.');
const BAT_HAT = rhythm('..o...o...o...o.');
const BAT_HAT_BREAK = rhythm('..o.......o.....');
const BAT_SNARE = rhythm('....X.......X...');
const BAT_SNARE_CHORUS = rhythm('....X.......X.g.');
const BAT_OPEN = rhythm('......o.......o.');
const BAT_ROLL8 = rhythm('o.o.x.x.x.X.X.X.');
const BAT_ROLL16 = rhythm('ooooxxxxxxxxXXXX');
const BAT_ARP_VEL = [1, 0.5, 0.7, 0.5];
const BAT_TOMS = [67, 64, 60, 57];

export const BATTLE_LEAD = melody(16, {
  0: [[0, 'D5', 2], [2, 'G5', 2], [4, 'B5', 2], [6, 'A5', 2], [8, 'G5', 4], [12, 'D5', 4]],
  1: [[0, 'F#5', 2], [2, 'A5', 2], [4, 'A5', 2], [6, 'F#5', 2], [8, 'D5', 4], [12, 'E5', 2], [14, 'F#5', 2]],
  2: [[0, 'G5', 2], [2, 'B5', 2], [4, 'A5', 2], [6, 'G5', 2], [8, 'E5', 4], [12, 'G5', 4]],
  3: [[0, 'G5', 2], [2, 'E5', 2], [4, 'C5', 4], [8, 'D5', 2], [10, 'E5', 2], [12, 'D5', 4]],
  4: [[0, 'D5', 2], [2, 'G5', 2], [4, 'B5', 2], [6, 'A5', 2], [8, 'G5', 4], [12, 'D5', 4]],
  5: [[0, 'F#5', 2], [2, 'A5', 2], [4, 'D6', 4], [8, 'A5', 4], [12, 'F#5', 4]],
  6: [[0, 'B5', 2], [2, 'A5', 2], [4, 'G5', 2], [6, 'E5', 2], [8, 'G5', 4], [12, 'B5', 4]],
  7: [[0, 'C6', 2], [2, 'B5', 2], [4, 'G5', 4], [8, 'E5', 4], [12, 'D5', 4]],
  8: [[0, 'B5', 4], [4, 'A5', 2], [6, 'G5', 2], [8, 'E5', 8]],
  9: [[0, 'C6', 4], [4, 'B5', 2], [6, 'G5', 2], [8, 'E5', 8]],
  10: [[0, 'B5', 2], [2, 'A5', 2], [4, 'B5', 2], [6, 'D6', 2], [8, 'D6', 8]],
  11: [[0, 'A5', 2], [2, 'B5', 2], [4, 'A5', 2], [6, 'F#5', 2], [8, 'A5', 8]],
  12: [[0, 'E5', 2], [2, 'G5', 2], [4, 'C6', 4], [8, 'B5', 2], [10, 'G5', 2], [12, 'E5', 4]],
  13: [[0, 'F#5', 2], [2, 'A5', 2], [4, 'D6', 4], [8, 'A5', 2], [10, 'F#5', 2], [12, 'D5', 4]],
  14: [[0, 'G5', 2], [2, 'B5', 2], [4, 'E6', 4], [8, 'D6', 2], [10, 'B5', 2], [12, 'G5', 4]],
  15: [[0, 'A5', 2], [2, 'F#5', 2], [4, 'A5', 2], [6, 'D6', 2], [8, 'A5', 4], [12, 'F#5', 2], [14, 'A5', 2]],
});

export const BATTLE: Score = {
  id: 'battle',
  bpm: 128,
  bars: 16,
  swing: 0,
  layers: 4,
  layerEdges: [0.25, 0.5, 0.75],
  fill(bar, step, sink) {
    const ch = BATTLE_CHORDS[bar] as BattleChord;
    const breakdown = bar === 8 || bar === 9;
    const chorus = bar >= 12;
    const phraseEnd = bar % 4 === 3;

    // ---- layer 0: bass, kick, closed hat
    if (breakdown) {
      if (step === 0) sink.note(Inst.bass, ch.bass, 0.85, 15, 0);
    } else if ((step & 1) === 0) {
      let off = BAT_BASS_OCT[step >> 1] as number;
      if (phraseEnd && step === 14) off = 7;
      sink.note(Inst.bass, ch.bass + off, step === 0 ? 1 : 0.8, 1.4, 0);
    }
    if (!breakdown) {
      const kick = bar === 11 ? BAT_KICK_BUILD8 : chorus ? BAT_KICK_CHORUS : BAT_KICK_STD;
      hit(sink, kick, step, Inst.kick, 36, 0);
    }
    hit(sink, breakdown ? BAT_HAT_BREAK : BAT_HAT, step, Inst.hat, 80, 0);

    // ---- layer 1: arpeggio + pad
    if (step === 0) sink.chord(Inst.pad, ch.pad, breakdown ? 0.75 : 0.5, 15.5, 1);
    if (!breakdown || (step & 1) === 0) {
      const idx = BAT_ARP_IDX[step] as number;
      const accent = BAT_ARP_VEL[step & 3] as number;
      sink.note(Inst.arp, ch.arp[idx] as number, breakdown ? 0.5 : accent * 0.55, breakdown ? 2.5 : 1.1, 1);
    }

    // ---- layer 2: lead hook + snare
    if (!breakdown) hit(sink, chorus ? BAT_SNARE_CHORUS : BAT_SNARE, step, Inst.snare, 60, 2);
    if (bar === 10) hit(sink, BAT_ROLL8, step, Inst.snare, 60, 2, 0.8);
    if (bar === 11) hit(sink, BAT_ROLL16, step, Inst.snare, 60, 2, 0.85);
    if (BATTLE_LEAD.has(bar, step)) {
      const m = BATTLE_LEAD.midi[bar * STEPS + step] as number;
      const d = BATTLE_LEAD.dur[bar * STEPS + step] as number;
      sink.note(Inst.lead, m, 0.8, d, 2);
      // ---- layer 3: the same hook an octave up
      sink.note(Inst.lead2, m + 12, 0.4, d, 3);
    }

    // ---- layer 3: open hats, fills, crashes
    if (!breakdown) hit(sink, BAT_OPEN, step, Inst.openHat, 80, 3);
    if (phraseEnd && bar !== 11 && bar !== 15 && step >= 12) sink.note(Inst.tom, BAT_TOMS[step - 12] as number, 0.75, 2, 3);
    if (bar === 15 && step >= 8) hit(sink, BAT_ROLL16, step, Inst.snare, 60, 3, 0.7);
    if (step === 0 && (bar === 0 || bar === 4 || bar === 12)) sink.note(Inst.crash, 76, 0.7, 8, 3);
  },
};

// ------------------------------------------------------------------ BOSS (142 BPM, D minor, tense)

interface BossChord {
  bass: number;
  stab: readonly number[];
  pad: readonly number[];
}

function bossChord(bass: string, stab: readonly string[], pad: readonly string[]): BossChord {
  return { bass: noteToMidi(bass), stab: midis(stab), pad: midis(pad) };
}

// The ostinato sits in the D3 octave (like a distorted guitar), not D2: phone speakers cannot play 73 Hz.
const X_DM = bossChord('D3', ['A3', 'D4', 'F4'], ['D3', 'A3', 'D4', 'F4']);
const X_GM = bossChord('G3', ['Bb3', 'D4', 'G4'], ['G3', 'Bb3', 'D4', 'G4']);
const X_BB = bossChord('Bb3', ['Bb3', 'D4', 'F4'], ['F3', 'Bb3', 'D4', 'F4']);
const X_A = bossChord('A3', ['A3', 'C#4', 'E4'], ['E3', 'A3', 'C#4', 'E4']);
const X_C = bossChord('C4', ['G3', 'C4', 'E4'], ['G3', 'C4', 'E4', 'G4']);

const BOSS_CHORDS: readonly BossChord[] = [
  X_DM, X_DM, X_BB, X_A,
  X_DM, X_GM, X_BB, X_A,
  X_DM, X_DM, X_BB, X_A,
  X_DM, X_BB, X_C, X_A,
];

const BOSS_BASS_VEL = rhythm('XgxgxgxoXgxgxgxo');
const BOSS_BASS_OCT = new Set([6, 14]);
const BOSS_KICK_A = rhythm('x..x..x.x..x..x.');
const BOSS_KICK_C = rhythm('x..xx.x.x..xx.xx');
const BOSS_KICK_BREAK = rhythm('x...x...x...x...');
const BOSS_KICK_BUILD = rhythm('x.x.x.x.x.x.x.x.');
const BOSS_SNARE = rhythm('....X.......X...');
const BOSS_SNARE_C = rhythm('....X..g....X.g.');
const BOSS_SNARE_ROLL = rhythm('o.o.x.x.xxxxXXXX');
const BOSS_HAT = rhythm('o.x.o.x.o.x.o.x.');
const BOSS_HAT_ROLL = rhythm('o.x.o.x.o.x.xoxo');
const BOSS_STAB_A = [rhythm('x..x..x.........'), rhythm('x..x..x...x.....')];
const BOSS_TOMS = [57, 53, 50, 45];
const BOSS_INTRO_ROLL = rhythm('o.o.o.o.xxxx....');
const BOSS_TENSION_ARP = [0, 2, 1, 2];

/** Brass riff in D minor (C# only as the leading tone of the A chord); bars 4-7 then an octave-lifted return. */
export const BOSS_LEAD = melody(16, {
  4: [[0, 'D5', 2], [2, 'A4', 1], [3, 'D5', 3], [6, 'F5', 2], [8, 'E5', 2], [10, 'D5', 2], [12, 'A4', 4]],
  5: [[0, 'D5', 2], [2, 'Bb4', 1], [3, 'D5', 3], [6, 'G5', 2], [8, 'F5', 2], [10, 'D5', 2], [12, 'Bb4', 4]],
  6: [[0, 'Bb4', 2], [2, 'D5', 1], [3, 'F5', 3], [6, 'D5', 2], [8, 'C5', 2], [10, 'Bb4', 2], [12, 'F4', 4]],
  7: [[0, 'A4', 2], [2, 'C#5', 1], [3, 'E5', 3], [6, 'C#5', 2], [8, 'A4', 2], [10, 'C#5', 2], [12, 'E5', 4]],
  12: [[0, 'D6', 2], [2, 'A5', 1], [3, 'D6', 3], [6, 'F6', 2], [8, 'E6', 2], [10, 'D6', 2], [12, 'A5', 4]],
  13: [[0, 'D6', 2], [2, 'Bb5', 1], [3, 'D6', 3], [6, 'F6', 2], [8, 'D6', 2], [10, 'Bb5', 2], [12, 'F5', 4]],
  14: [[0, 'C6', 2], [2, 'G5', 1], [3, 'C6', 3], [6, 'E6', 2], [8, 'D6', 2], [10, 'C6', 2], [12, 'G5', 4]],
  15: [[0, 'A5', 2], [2, 'C#6', 1], [3, 'E6', 3], [6, 'C#6', 2], [8, 'A5', 2], [10, 'E6', 2], [12, 'A6', 4]],
});

export const BOSS: Score = {
  id: 'boss',
  bpm: 142,
  bars: 16,
  swing: 0,
  layers: 1,
  layerEdges: [],
  // The arrival: a crash, the minor chord and a held D on the downbeat, three stabs, kicks on the beats, a snare roll that swells and a falling tom run into the loop.
  intro: {
    bars: 1,
    fill(_bar, step, sink) {
      if (step === 0) {
        sink.note(Inst.crash, 76, 0.9, 8, 0);
        sink.chord(Inst.pad, X_DM.pad, 0.8, 15.5, 0);
        sink.note(Inst.bass, X_DM.bass, 0.9, 15, 0);
      }
      if ((step & 3) === 0 && step < 12) sink.note(Inst.kick, 36, step === 0 ? 1 : 0.8, 1, 0);
      if (step === 0 || step === 3 || step === 6) sink.chord(Inst.stab, X_DM.stab, 0.85, 1.5, 0);
      hit(sink, BOSS_INTRO_ROLL, step, Inst.snare, 60, 0, 0.8);
      if (step >= 12) sink.note(Inst.tom, BOSS_TOMS[step - 12] as number, 0.85, 2, 0);
    },
  },
  fill(bar, step, sink) {
    const sec = bar >> 2;
    const ch = BOSS_CHORDS[bar] as BossChord;
    const breakdown = sec === 2 && bar < 10;
    const build = bar === 10 || bar === 11;
    const chorus = sec === 3;
    const phraseEnd = bar % 4 === 3;

    // Bass: relentless 16th ostinato (palm-muted), held pedal in the breakdown.
    if (breakdown) {
      if (step === 0) sink.note(Inst.bass, ch.bass, 0.9, 15, 0);
    } else {
      const v = BOSS_BASS_VEL[step] as number;
      const off = BOSS_BASS_OCT.has(step) ? 12 : 0;
      sink.note(Inst.bass, ch.bass + off, v, 0.85, 0);
    }

    // Drums.
    const kick = breakdown ? BOSS_KICK_BREAK : build ? BOSS_KICK_BUILD : chorus ? BOSS_KICK_C : BOSS_KICK_A;
    hit(sink, kick, step, Inst.kick, 36, 0);
    if (bar === 10) hit(sink, BOSS_SNARE_ROLL, step, Inst.snare, 60, 0, 0.7);
    else if (bar === 11) hit(sink, BOSS_SNARE_ROLL, step, Inst.snare, 60, 0, 0.9);
    else if (!breakdown) hit(sink, chorus ? BOSS_SNARE_C : BOSS_SNARE, step, Inst.snare, 60, 0);
    hit(sink, phraseEnd && sec !== 2 ? BOSS_HAT_ROLL : BOSS_HAT, step, Inst.hat, 80, 0, breakdown ? 0.6 : 1);
    if (phraseEnd && bar !== 11 && step >= 12) sink.note(Inst.tom, BOSS_TOMS[step - 12] as number, 0.8, 2, 0);
    if (step === 0 && (bar === 0 || bar === 4 || bar === 12)) sink.note(Inst.crash, 76, 0.8, 8, 0);

    // Dark pad: a held minor-chord string bed.
    if (step === 0) sink.chord(Inst.pad, ch.pad, breakdown ? 0.7 : 0.5, 15.5, 0);

    // Syncopated stabs over the opening and the climax.
    if (sec === 0 || chorus) {
      const pat = BOSS_STAB_A[bar & 1] as Float32Array;
      if ((pat[step] as number) > 0) sink.chord(Inst.stab, ch.stab, 0.8, 1.5, 0);
    }

    // Tension ticks: a high 16th arpeggio through the breakdown and build.
    if (breakdown || build) {
      const idx = BOSS_TENSION_ARP[step & 3] as number;
      sink.note(Inst.arp, (ch.pad[idx + 1] as number) + 24, build ? 0.55 : 0.4, 1, 0);
    }

    if (BOSS_LEAD.has(bar, step)) {
      sink.note(Inst.lead, BOSS_LEAD.midi[bar * STEPS + step] as number, 0.8, BOSS_LEAD.dur[bar * STEPS + step] as number, 0);
    }
  },
};

