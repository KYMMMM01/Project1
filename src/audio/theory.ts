/**
 * Pure music-theory helpers (no WebAudio, no globals) so the pentatonic ladder and pitch maths can be
 * unit tested in a node environment and shared by the SFX recipes, the stingers and the music scores.
 */

/** Major pentatonic: any run of these degrees is consonant, so combo/streak ladders can never clash. */
const PENTATONIC = [0, 2, 4, 7, 9] as const;

/** playStep never climbs above two octaves; a lower floor keeps negative steps usable but sane. */
export const MAX_STEP_SEMITONES = 24;
const MIN_STEP_SEMITONES = -12;

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function semitoneRatio(semitones: number): number {
  return Math.pow(2, semitones / 12);
}

/** Semitone offset of scale step `step` on the major pentatonic (0 = root, 5 = one octave up). */
export function pentatonicSemitones(step: number): number {
  const s = Math.round(Number.isFinite(step) ? step : 0);
  const octave = Math.floor(s / 5);
  const degree = s - octave * 5;
  const semis = octave * 12 + (PENTATONIC[degree] as number);
  return Math.min(MAX_STEP_SEMITONES, Math.max(MIN_STEP_SEMITONES, semis));
}

/** Playback-rate ratio of `step` pentatonic degrees, climbing at most `maxSemitones` (a sound may ask for less than two octaves). */
export function stepRatio(step: number, maxSemitones = MAX_STEP_SEMITONES): number {
  return semitoneRatio(Math.min(maxSemitones, pentatonicSemitones(step)));
}

const NOTE_BASE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C4" -> 60, "F#3" -> 54, "Bb2" -> 46. Throws on malformed input so score typos fail loudly in tests. */
export function noteToMidi(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note name "${name}"`);
  const accidental = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return (NOTE_BASE[m[1] as string] as number) + accidental + (Number(m[3]) + 1) * 12;
}

/** Frequency of a note name, e.g. hz('A4') === 440. */
export function hz(name: string): number {
  return midiToHz(noteToMidi(name));
}
