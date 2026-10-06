/**
 * Music instruments: how each Inst id of each track is synthesised. A small acoustic combo built from the
 * same oscillator / noise voices as the SFX, so no samples are needed: a felt kick and a wooden rim, a
 * paper shaker for the hats, a marimba and a kalimba for the melody, a ukulele and a plucked bass for the
 * harmony, a soft triangle pad. Nothing here is a raw saw, a square or a distorted lead: the battle layers
 * add rhythm and counter-melody, not drive. A voice is one envelope group (a chord is a single voice of
 * several oscillators) which is what the polyphony budget counts.
 */
import { Inst, type MusicTrackId } from './scores';
import { midiToHz } from './theory';
import type { Synth } from './synth';

/**
 * Seconds a voice keeps sounding after its note starts, release included (for the voice budget).
 * Must track the envelopes below: an over-long estimate sheds notes that were never really overlapping.
 */
export function voiceLength(track: MusicTrackId, inst: number, durSec: number): number {
  switch (inst) {
    case Inst.kick:
      return 0.3;
    case Inst.snare:
      return 0.22;
    case Inst.hat:
      return 0.06;
    case Inst.openHat:
      return 0.2;
    case Inst.shaker:
      return 0.1;
    case Inst.tom:
      return 0.32;
    case Inst.crash:
      return 0.95;
    case Inst.rim:
      return 0.08;
    case Inst.bass:
      return durSec + (track === 'home' ? 0.12 : 0.08);
    case Inst.chord:
      return durSec + 0.32;
    case Inst.pad:
      return durSec + (track === 'battle' ? 0.32 : 0.57);
    case Inst.arp:
      return durSec + (track === 'home' ? 0.14 : 0.08);
    case Inst.lead:
      return durSec + (track === 'home' ? 0.37 : 0.12);
    case Inst.lead2:
      return durSec + 0.12;
    default:
      return durSec + 0.14;
  }
}

const f = midiToHz;

/** Felt-beater kick on a soft drum: a sine drop with just enough saturation for a phone speaker, and no click. */
function kick(s: Synth, vel: number, f0: number, f1: number, len: number): void {
  s.tone({ f: f0, f2: f1, sw: 0.07, dur: len, v: vel, a: 0.004, s: 0.003, r: 0.05, sat: 0.3 });
  s.noise({ dur: 0.02, v: vel * 0.12, a: 0.004, s: 0.01, filter: { t: 'lowpass', f: 1200 } });
}

/** A brush on a cardboard box: a band-passed paper rustle and a short wooden body, no snare wires. */
function snare(s: Synth, vel: number, body: number, bright: number): void {
  s.noise({ dur: 0.14, v: vel * 0.6, a: 0.002, s: 0.006, filter: [{ t: 'highpass', f: 600 }, { t: 'bandpass', f: bright, q: 0.7 }] });
  s.tone({ w: 'triangle', f: body, f2: body * 0.75, sw: 0.05, dur: 0.09, v: vel * 0.5, a: 0.002, s: 0.01 });
}

/** Paper shaker: band-passed noise with a 6 ms swell, so it brushes instead of ticking. */
function hat(s: Synth, vel: number, dur: number, centre: number): void {
  s.noise({ dur, v: vel * 0.35, a: 0.006, d: dur * 0.7, s: 0.02, filter: { t: 'bandpass', f: centre, q: 0.9 } });
}

/** A felt mallet on a wooden box, a fifth-ish below the key: low enough to be a drum, mid enough for a phone to play. */
function tom(s: Synth, vel: number, midi: number): void {
  const base = f(midi - 12);
  s.tone({ f: base * 1.35, f2: base, sw: 0.07, dur: 0.28, v: vel, a: 0.003, s: 0.004, sat: 0.2 });
  s.noise({ dur: 0.02, v: vel * 0.2, a: 0.001, s: 0.01, filter: { t: 'bandpass', f: 1000, q: 1 } });
}

/** A bell tree in the key's pentatonic set run quickly upward under a swell of paper: the soft cymbal. */
function crash(s: Synth, vel: number, len: number, midis: readonly number[]): void {
  s.noise({ kind: 'pink', dur: len, v: vel * 0.22, a: 0.04, d: len * 0.8, s: 0.02, filter: { t: 'bandpass', f: 3500, q: 0.6 } });
  midis.forEach((m, k) => s.tone({ f: f(m), at: k * 0.035, dur: len * 0.7, v: vel * 0.07, a: 0.002, s: 0.01 }));
}

/** Marimba bar: the fundamental rings, the 4th partial (the bar's wood) dies fast, a felt knock opens it. */
function marimba(s: Synth, fr: number, vel: number, dur: number, tail: number): void {
  s.tone({ f: fr, dur: dur + tail, v: vel, a: 0.004, d: dur + tail - 0.1, s: 0.06, r: 0.3 });
  s.tone({ f: fr * 4, dur: Math.min(dur * 0.3, 0.07) + 0.03, v: vel * 0.2, a: 0.003, s: 0.01 });
  s.noise({ dur: 0.01, v: vel * 0.1, a: 0.002, s: 0.01, filter: { t: 'lowpass', f: 2400 } });
}

/** Nylon-string pluck: a triangle whose low-pass closes as the string settles. */
function pluck(s: Synth, fr: number, vel: number, dur: number): void {
  s.tone({ w: 'triangle', f: fr, dur, v: vel, a: 0.003, d: dur - 0.05, s: 0.03, r: 0.05, filter: { t: 'lowpass', f: fr * 5, f2: fr * 1.5, sw: 0.16, q: 0.5 } });
}

/** Kalimba tine: a pure fundamental and a short ping at 5.4x. */
function tine(s: Synth, fr: number, vel: number, dur: number): void {
  s.tone({ f: fr, dur, v: vel, a: 0.003, d: dur - 0.02, s: 0.02, r: 0.02 });
  s.tone({ f: fr * 5.4, dur: 0.04, v: vel * 0.1, a: 0.002, s: 0.01 });
}

/** Upright bass: a soft sine with a little saturation (so a phone speaker finds the harmonics), its octave, a mid-range finger tick. */
function upright(s: Synth, fr: number, vel: number, dur: number, hold: number): void {
  s.tone({ f: fr, dur: dur + 0.06, v: vel * 0.3, a: 0.006, d: dur * hold, s: 0.3, r: 0.05, sat: 0.35, filter: { t: 'lowpass', f: 800 } });
  s.tone({ w: 'triangle', f: fr * 2, dur: dur * 0.5 + 0.04, v: vel * 0.2, a: 0.004, s: 0.02, filter: { t: 'lowpass', f: 1200 } });
  s.noise({ dur: 0.02, v: vel * 0.25, a: 0.003, s: 0.01, filter: { t: 'bandpass', f: 900, q: 1 } });
}

function homeVoice(s: Synth, inst: number, notes: readonly number[], vel: number, dur: number): void {
  switch (inst) {
    case Inst.kick:
      kick(s, 0.3 * vel, 140, 65, 0.24);
      break;
    case Inst.rim:
      // Claves: a high wooden tok and its click.
      s.tone({ f: 1100, f2: 950, sw: 0.02, dur: 0.05, v: vel * 0.3, a: 0.002, s: 0.01 });
      s.noise({ dur: 0.04, v: vel * 0.3, a: 0.001, s: 0.01, filter: { t: 'bandpass', f: 1900, q: 3 } });
      break;
    case Inst.shaker:
      s.noise({ dur: 0.09, v: vel * 0.32, a: 0.013, s: 0.04, filter: { t: 'bandpass', f: 5200, q: 0.9 } });
      break;
    case Inst.tom:
      tom(s, 0.5 * vel, (notes[0] as number) + 12);
      break;
    case Inst.bass:
      upright(s, f(notes[0] as number), vel, dur, 0.6);
      break;
    case Inst.chord:
      // A ukulele strum: every string a nylon pluck, 12 ms apart, with a quiet octave on each.
      notes.forEach((n, k) => {
        const fr = f(n);
        const at = k * 0.012;
        s.tone({ w: 'triangle', f: fr, at, dur: dur + 0.2, v: vel * 0.26, a: 0.003, d: dur * 0.9 + 0.1, s: 0.05, r: 0.15, filter: { t: 'lowpass', f: fr * 5, f2: fr * 1.6, sw: 0.25, q: 0.5 } });
        s.tone({ f: fr * 2, at, dur: 0.15, v: vel * 0.04, a: 0.002, s: 0.01 });
      });
      break;
    case Inst.pad:
      // A felt bed: slow triangles a few cents apart, low-passed warm. No saw, no shimmer.
      for (const n of notes) {
        s.tone({ w: 'triangle', f: f(n), dur: dur + 0.5, v: vel * 0.05, a: 0.45, s: 1, r: 0.55, uni: [6], filter: { t: 'lowpass', f: 900, f2: 1400, sw: dur } });
      }
      break;
    case Inst.arp:
      pluck(s, f(notes[0] as number), vel * 0.55, dur + 0.12);
      break;
    case Inst.lead:
      // Marimba: a soft hook that rings, with the wooden 4th partial.
      marimba(s, f(notes[0] as number), vel * 0.5, dur, 0.35);
      break;
    default:
      break;
  }
}

function battleVoice(s: Synth, inst: number, notes: readonly number[], vel: number, dur: number): void {
  switch (inst) {
    case Inst.kick:
      kick(s, 0.5 * vel, 150, 60, 0.22);
      break;
    case Inst.snare:
      snare(s, vel * 0.9, 220, 1800);
      break;
    case Inst.hat:
      hat(s, vel, 0.06, 5400);
      break;
    case Inst.openHat:
      hat(s, vel * 0.8, 0.16, 4800);
      break;
    case Inst.tom:
      tom(s, 0.8 * vel, notes[0] as number);
      break;
    case Inst.crash:
      crash(s, vel, 0.95, [79, 81, 83, 86, 88]);
      break;
    case Inst.bass:
      upright(s, f(notes[0] as number), vel * 0.85, dur, 0.3);
      break;
    case Inst.pad:
      for (const n of notes) {
        s.tone({ w: 'triangle', f: f(n), dur: dur + 0.3, v: vel * 0.045, a: 0.15, s: 1, r: 0.3, uni: [8], filter: { t: 'lowpass', f: 1500, f2: 2200, sw: dur } });
      }
      break;
    case Inst.arp:
      // The ukulele counter-line: bright at the pick, round a moment later.
      pluck(s, f(notes[0] as number), vel * 0.65, dur + 0.06);
      break;
    case Inst.lead:
      // The hook is a marimba, doubled by a quiet nylon pluck for presence.
      marimba(s, f(notes[0] as number), vel * 0.6, dur, 0.08);
      pluck(s, f(notes[0] as number), vel * 0.16, dur + 0.08);
      break;
    case Inst.lead2:
      // The same hook an octave up, as kalimba tines.
      tine(s, f(notes[0] as number), vel * 0.3, dur + 0.1);
      break;
    default:
      break;
  }
}

function bossVoice(s: Synth, inst: number, notes: readonly number[], vel: number, dur: number): void {
  switch (inst) {
    case Inst.kick:
      kick(s, 0.55 * vel, 140, 58, 0.28);
      break;
    case Inst.snare:
      snare(s, vel, 170, 1500);
      break;
    case Inst.hat:
      hat(s, vel * 0.9, 0.05, 6000);
      break;
    case Inst.tom:
      tom(s, 0.85 * vel, notes[0] as number);
      break;
    case Inst.crash:
      crash(s, vel, 1.3, [74, 77, 81, 86, 89]);
      break;
    case Inst.bass: {
      // A muted pluck, palm on the strings: the same upright with a short hold and a darker triangle on top.
      const fr = f(notes[0] as number);
      upright(s, fr, vel * 0.85, dur, 0.15);
      s.tone({ w: 'triangle', f: fr, dur: dur + 0.04, v: vel * 0.2, a: 0.003, d: 0.06, s: 0.2, r: 0.03, filter: { t: 'lowpass', f: 900, f2: 300, sw: 0.07 } });
      break;
    }
    case Inst.stab:
      // Pizzicato: every note a short muted pluck.
      notes.forEach((n) => pluck(s, f(n), vel * 0.2, dur + 0.12));
      break;
    case Inst.pad:
      for (const n of notes) {
        s.tone({ w: 'triangle', f: f(n), dur: dur + 0.55, v: vel * 0.04, a: 0.45, s: 1, r: 0.55, uni: [8], filter: { t: 'lowpass', f: 700, f2: 950, sw: dur } });
      }
      break;
    case Inst.arp:
      // Tension ticks: high kalimba tines.
      tine(s, f(notes[0] as number), vel * 0.3, dur + 0.06);
      break;
    case Inst.lead: {
      // The riff on a marimba with a nylon pluck under it, so the minor line has some bite without any edge.
      const fr = f(notes[0] as number);
      marimba(s, fr, vel * 0.55, dur, 0.1);
      pluck(s, fr, vel * 0.25, dur + 0.1);
      break;
    }
    default:
      break;
  }
}

/** Build one voice of `inst` for `track` into `s` (whose t0 is the start time). */
export function playVoice(s: Synth, track: MusicTrackId, inst: number, notes: readonly number[], vel: number, durSec: number): void {
  if (track === 'home') homeVoice(s, inst, notes, vel, durSec);
  else if (track === 'battle') battleVoice(s, inst, notes, vel, durSec);
  else bossVoice(s, inst, notes, vel, durSec);
}
