/**
 * A small score language for the chapter tracks. A track is a chord per bar (16 of them) and a list of lanes; a lane is one instrument with
 * one 16-step pattern per section of four bars (and single-bar overrides for fills). The chords supply the notes, so a bass line is written as
 * degrees ("R..o..f."), a strum as a rhythm, an arpeggio as chord-tone numbers, and only the melody is written as notes ("F5:2 A5:2 r:4").
 * Compiling resolves every bar to plain arrays, so `fill` allocates nothing while it plays.
 */
import { STEPS, rhythm, type MusicTrackId, type NoteSink, type Score } from './scores';
import { noteToMidi } from './theory';

const BARS = 16;
const PITCH_CLASS: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QUALITY: Readonly<Record<string, readonly number[]>> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '7': [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  sus: [0, 5, 7],
  dim: [0, 3, 6],
  '6': [0, 4, 7, 9],
};
const NO_NOTE = -1;
const EMPTY = '.'.repeat(STEPS);

export interface Chord {
  /** Pitch class of the root, 0 = C. */
  pc: number;
  /** Semitones above the root: 3 or 4 tones. */
  tones: readonly number[];
}

/** "Bb", "F#m", "C7", "Em7", "Dmaj7", "Gsus", "Bdim", "C6". Throws on anything else so a typo fails in the tests. */
export function parseChord(name: string): Chord {
  const m = /^([A-G])([#b]?)(m7|maj7|m|7|sus|dim|6|)$/.exec(name);
  if (!m) throw new Error(`bad chord "${name}"`);
  const accidental = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return { pc: (((PITCH_CLASS[m[1] as string] as number) + accidental) % 12 + 12) % 12, tones: QUALITY[m[3] as string] as readonly number[] };
}

/** The bass note of a chord: its root between E2 and Eb3, the register a phone speaker can still play. */
export function bassRoot(chord: Chord): number {
  return 40 + ((chord.pc - 4 + 12) % 12);
}

/** The chord as stacked tones with its root at or above `low`. */
function stack(chord: Chord, low: number): number[] {
  const root = low + (((chord.pc - low) % 12) + 12) % 12;
  return chord.tones.map((t) => root + t);
}

/** Eight arpeggio notes: root, third, fifth, seventh (or the octave) and the same again an octave up. */
function arpNotes(chord: Chord, low: number): number[] {
  const root = low + (((chord.pc - low) % 12) + 12) % 12;
  const four = [0, chord.tones[1] as number, chord.tones[2] as number, chord.tones[3] ?? 12];
  return [...four, ...four.map((t) => t + 12)].map((t) => root + t);
}

/** Bass degrees: r root, t third, f fifth, o octave, s seventh (a dominant seventh when the chord has none), p a step up, w a sixth. Capitals are accented. */
function degree(letter: string, chord: Chord): number {
  switch (letter.toLowerCase()) {
    case 'r':
      return 0;
    case 't':
      return chord.tones[1] as number;
    case 'f':
      return chord.tones[2] as number;
    case 'o':
      return 12;
    case 's':
      return chord.tones[3] ?? 10;
    case 'p':
      return 2;
    case 'w':
      return 9;
    default:
      throw new Error(`bad bass degree "${letter}"`);
  }
}

export interface LaneSpec {
  kind: 'hit' | 'bass' | 'comp' | 'arp' | 'pool' | 'tune';
  inst: number;
  layer: number;
  /** One 16-step pattern per section of four bars; a shorter list repeats its last entry. */
  pats?: readonly string[];
  /** Patterns for single bars (fills, crashes). They replace the section's pattern in that bar. */
  bars?: Readonly<Record<number, string>>;
  /** 16 characters, '1' where the lane plays. Default every bar. */
  on?: string;
  /** hit: the midi note handed to the instrument. */
  midi?: number;
  /** Overall velocity scale, default 1. */
  vel?: number;
  /** hit: note length in steps (1). comp and arp: note length in steps. bass: the share of the gap to the next note that sounds (0.8). */
  dur?: number;
  /** comp and arp: the lowest midi note of the voicing. */
  low?: number;
  /** pool: the notes (names) the digits of a pattern pick from. */
  pool?: readonly string[];
  /** tune: one string per bar, "F5:2 A5:2 r:4" (note:steps, r for a rest). */
  tune?: readonly string[];
  /** tune: the same notes again on another instrument and layer, `shift` semitones away; with `minDur` only the notes that last that many steps (the held ones). */
  double?: { inst: number; layer: number; shift: number; vel: number; minDur?: number };
}

export interface TrackSpec {
  id: MusicTrackId;
  bpm: number;
  swing?: number;
  layers: number;
  layerEdges?: readonly number[];
  /** 16 chord names, one per bar, separated by spaces. */
  chords: string;
  lanes: readonly LaneSpec[];
  then?: MusicTrackId;
}

type StepFn = (bar: number, step: number, sink: NoteSink) => void;

const perBar = <T>(make: (bar: number) => T): T[] => Array.from({ length: BARS }, (_, bar) => make(bar));

function patternFor(lane: LaneSpec, bar: number): string {
  const own = lane.bars?.[bar];
  if (own !== undefined) return own;
  const list = lane.pats ?? [];
  return list[Math.min(bar >> 2, list.length - 1)] ?? EMPTY;
}

function mask(on: string | undefined): readonly boolean[] {
  if (on !== undefined && on.length !== BARS) throw new Error(`a lane mask needs ${BARS} characters: "${on}"`);
  return perBar((bar) => on === undefined || on.charAt(bar) === '1');
}

function digits(pattern: string): Int8Array {
  if (pattern.length !== STEPS) throw new Error(`a pattern needs ${STEPS} characters: "${pattern}"`);
  const out = new Int8Array(STEPS).fill(NO_NOTE);
  for (let i = 0; i < STEPS; i++) {
    const c = pattern.charCodeAt(i) - 48;
    if (c >= 0 && c <= 9) out[i] = c;
  }
  return out;
}

export interface Tune {
  midi: Int16Array;
  dur: Uint8Array;
}

/** "F5:2 A5:2 r:4" per bar to midi notes and lengths by (bar, step). A bar that overruns 16 steps throws. */
export function parseTune(bars: readonly string[]): Tune {
  if (bars.length !== BARS) throw new Error(`a tune needs ${BARS} bars, got ${bars.length}`);
  const midi = new Int16Array(BARS * STEPS).fill(NO_NOTE);
  const dur = new Uint8Array(BARS * STEPS);
  bars.forEach((text, bar) => {
    let step = 0;
    for (const token of text.split(/\s+/).filter((t) => t.length > 0)) {
      const [name, len] = token.split(':') as [string, string];
      const steps = Number(len);
      if (!(steps > 0)) throw new Error(`bad length in bar ${bar}: "${token}"`);
      if (name !== 'r') {
        midi[bar * STEPS + step] = noteToMidi(name);
        dur[bar * STEPS + step] = steps;
      }
      step += steps;
    }
    if (step > STEPS) throw new Error(`bar ${bar} is ${step} steps long`);
  });
  return { midi, dur };
}

function compileLane(lane: LaneSpec, chords: readonly Chord[]): StepFn {
  const on = mask(lane.on);
  const { inst, layer } = lane;
  const scale = lane.vel ?? 1;
  switch (lane.kind) {
    case 'hit': {
      const rhythms = perBar((bar) => rhythm(patternFor(lane, bar)));
      const midi = lane.midi ?? 60;
      const dur = lane.dur ?? 1;
      return (bar, step, sink) => {
        const v = (rhythms[bar] as Float32Array)[step] as number;
        if (v > 0 && on[bar]) sink.note(inst, midi, v * scale, dur, layer);
      };
    }
    case 'bass': {
      const gate = lane.dur ?? 0.8;
      const programs = perBar((bar) => {
        const pattern = patternFor(lane, bar);
        if (pattern.length !== STEPS) throw new Error(`a bass pattern needs ${STEPS} characters: "${pattern}"`);
        const chord = chords[bar] as Chord;
        const root = bassRoot(chord);
        const midi = new Int16Array(STEPS).fill(NO_NOTE);
        const vel = new Float32Array(STEPS);
        const len = new Float32Array(STEPS);
        let last = -1;
        for (let i = 0; i < STEPS; i++) {
          const c = pattern.charAt(i);
          if (c === '.') continue;
          if (last >= 0) len[last] = (i - last) * gate;
          midi[i] = root + degree(c, chord);
          vel[i] = c === c.toUpperCase() ? 1 : 0.8;
          last = i;
        }
        if (last >= 0) len[last] = (STEPS - last) * gate;
        return { midi, vel, len };
      });
      return (bar, step, sink) => {
        const p = programs[bar] as (typeof programs)[number];
        const m = p.midi[step] as number;
        if (m >= 0 && on[bar]) sink.note(inst, m, (p.vel[step] as number) * scale, p.len[step] as number, layer);
      };
    }
    case 'comp': {
      const rhythms = perBar((bar) => rhythm(patternFor(lane, bar)));
      const voicings = perBar((bar) => stack(chords[bar] as Chord, lane.low ?? 55));
      const dur = lane.dur ?? 1.5;
      return (bar, step, sink) => {
        const v = (rhythms[bar] as Float32Array)[step] as number;
        if (v > 0 && on[bar]) sink.chord(inst, voicings[bar] as number[], v * scale, dur, layer);
      };
    }
    case 'arp': {
      const picks = perBar((bar) => digits(patternFor(lane, bar)));
      const notes = perBar((bar) => arpNotes(chords[bar] as Chord, lane.low ?? 60));
      const dur = lane.dur ?? 1.5;
      return (bar, step, sink) => {
        const k = (picks[bar] as Int8Array)[step] as number;
        if (k < 0 || !on[bar]) return;
        const accent = step % 4 === 0 ? 1 : step % 2 === 0 ? 0.7 : 0.5;
        sink.note(inst, (notes[bar] as number[])[k] as number, accent * scale, dur, layer);
      };
    }
    case 'pool': {
      const picks = perBar((bar) => digits(patternFor(lane, bar)));
      const pool = (lane.pool ?? []).map(noteToMidi);
      const dur = lane.dur ?? 1;
      return (bar, step, sink) => {
        const k = (picks[bar] as Int8Array)[step] as number;
        if (k < 0 || !on[bar]) return;
        sink.note(inst, pool[k] as number, scale, dur, layer);
      };
    }
    case 'tune': {
      const tune = parseTune(lane.tune ?? []);
      const twin = lane.double;
      return (bar, step, sink) => {
        const i = bar * STEPS + step;
        const m = tune.midi[i] as number;
        if (m < 0 || !on[bar]) return;
        const d = tune.dur[i] as number;
        sink.note(inst, m, scale, d, layer);
        if (twin && d >= (twin.minDur ?? 0)) sink.note(twin.inst, m + twin.shift, twin.vel, d, twin.layer);
      };
    }
  }
}

/** Compile a spec into a Score. Chords, patterns and tunes are all validated here, once, when the module loads. */
export function compose(spec: TrackSpec): Score {
  const chords = spec.chords.trim().split(/\s+/).map(parseChord);
  if (chords.length !== BARS) throw new Error(`${spec.id}: ${BARS} chords needed, got ${chords.length}`);
  const lanes = spec.lanes.map((lane) => compileLane(lane, chords));
  return {
    id: spec.id,
    bpm: spec.bpm,
    bars: BARS,
    swing: spec.swing ?? 0,
    layers: spec.layers,
    layerEdges: spec.layerEdges ?? [],
    ...(spec.then ? { then: spec.then } : {}),
    fill(bar, step, sink) {
      for (const lane of lanes) lane(bar, step, sink);
    },
  };
}
