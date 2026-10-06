/**
 * Music instruments: how each Inst id of each track is synthesised. Everything is built from the
 * same oscillator / noise voices as the SFX, so no samples are needed. A voice is one envelope
 * group (a chord pad is a single voice of several oscillators) which is what the polyphony budget counts.
 */
import { Inst, type MusicTrackId } from './scores';
import { midiToHz } from './theory';
import type { Synth } from './synth';

/** Seconds a voice keeps sounding after its note starts, release included (for the voice budget). */
export function voiceLength(inst: number, durSec: number): number {
  switch (inst) {
    case Inst.kick:
      return 0.32;
    case Inst.snare:
      return 0.26;
    case Inst.hat:
      return 0.07;
    case Inst.openHat:
      return 0.26;
    case Inst.shaker:
      return 0.1;
    case Inst.tom:
      return 0.36;
    case Inst.crash:
      return 1.0;
    case Inst.rim:
      return 0.1;
    case Inst.bass:
      return durSec + 0.12;
    case Inst.chord:
      return durSec + 0.35;
    case Inst.pad:
      return durSec + 0.6;
    case Inst.arp:
      return durSec + 0.14;
    case Inst.lead:
      return durSec + 0.4;
    case Inst.lead2:
      return durSec + 0.3;
    default:
      return durSec + 0.3;
  }
}

const f = midiToHz;

/** Shared drum voices; the per-track kits tune them. */
function kick(s: Synth, vel: number, f0: number, f1: number, len: number, click: number): void {
  s.tone({ f: f0, f2: f1, sw: 0.075, dur: len, v: vel, a: 0.002, s: 0.003, r: 0.05 });
  s.noise({ dur: 0.012, v: vel * click, a: 0.001, s: 0.01, filter: { t: 'lowpass', f: 2500 } });
}

function snare(s: Synth, vel: number, body: number, bright: number, sat = 0): void {
  s.noise({ dur: 0.2, v: vel * 0.7, a: 0.001, s: 0.006, sat, filter: [{ t: 'highpass', f: 500 }, { t: 'bandpass', f: bright, q: 0.7 }] });
  s.tone({ w: 'triangle', f: body, f2: body * 0.7, sw: 0.06, dur: 0.1, v: vel * 0.55, a: 0.001, s: 0.01 });
}

function hat(s: Synth, vel: number, dur: number, hp: number): void {
  s.noise({ dur, v: vel * 0.3, a: 0.001, s: 0.01, filter: { t: 'highpass', f: hp } });
}

function tom(s: Synth, vel: number, midi: number): void {
  const base = f(midi - 24);
  s.tone({ f: base * 1.6, f2: base, sw: 0.09, dur: 0.3, v: vel, a: 0.002, s: 0.004 });
  s.noise({ dur: 0.02, v: vel * 0.2, a: 0.001, s: 0.01, filter: { t: 'bandpass', f: 1200, q: 1 } });
}

function crash(s: Synth, vel: number, len: number): void {
  s.noise({ dur: len, v: vel * 0.3, a: 0.003, s: 0.004, filter: [{ t: 'highpass', f: 4800 }, { t: 'peaking', f: 8500, q: 0.8, g: 5 }] });
}

function homeVoice(s: Synth, inst: number, notes: readonly number[], vel: number, dur: number): void {
  switch (inst) {
    case Inst.kick:
      kick(s, 0.75 * vel, 120, 48, 0.28, 0.1);
      break;
    case Inst.rim:
      s.noise({ dur: 0.05, v: vel * 0.5, a: 0.001, s: 0.01, filter: { t: 'bandpass', f: 1900, q: 3 } });
      s.tone({ w: 'triangle', f: 820, f2: 600, sw: 0.03, dur: 0.05, v: vel * 0.25, a: 0.001, s: 0.01 });
      break;
    case Inst.shaker:
      s.noise({ dur: 0.09, v: vel * 0.32, a: 0.013, s: 0.04, filter: { t: 'bandpass', f: 6500, q: 0.9 } });
      break;
    case Inst.tom:
      tom(s, 0.5 * vel, (notes[0] as number) + 12);
      break;
    case Inst.bass: {
      const fr = f(notes[0] as number);
      s.tone({ f: fr, dur: dur + 0.1, v: vel * 0.9, a: 0.01, d: dur * 0.6, s: 0.5, r: 0.1, filter: { t: 'lowpass', f: 900 } });
      s.tone({ w: 'triangle', f: fr * 2, dur: dur + 0.1, v: vel * 0.2, a: 0.01, d: dur * 0.5, s: 0.3, r: 0.1 });
      break;
    }
    case Inst.chord:
      // Rhodes-like: a sine carrier with a decaying 1:1 FM "bark", a quiet tine an octave up, soft lowpass.
      for (const n of notes) {
        const fr = f(n);
        const filter = { t: 'lowpass' as const, f: 3200 };
        s.tone({ f: fr, dur: dur + 0.3, v: vel * 0.2, a: 0.005, d: dur * 1.2, s: 0.08, r: 0.28, fm: { ratio: 1, idx: 1.4, idx2: 0.12, idxT: 0.5 }, filter });
        s.tone({ f: fr * 2, dur: dur * 0.6 + 0.2, v: vel * 0.035, a: 0.003, s: 0.01, filter });
      }
      break;
    case Inst.pad:
      for (const n of notes) {
        s.tone({ w: 'sawtooth', f: f(n), dur: dur + 0.5, v: vel * 0.05, a: 0.4, s: 1, r: 0.55, uni: [-9, 9], filter: { t: 'lowpass', f: 850, f2: 1300, sw: dur } });
      }
      break;
    case Inst.arp: {
      const fr = f(notes[0] as number);
      s.tone({ w: 'triangle', f: fr, dur: dur + 0.12, v: vel * 0.5, a: 0.003, s: 0.01, filter: { t: 'lowpass', f: 3600, f2: 1100, sw: 0.16 } });
      s.tone({ f: fr * 2, dur: dur * 0.6 + 0.06, v: vel * 0.1, a: 0.002, s: 0.01 });
      break;
    }
    case Inst.lead: {
      // Music-box / glockenspiel: a sine with a quiet octave and twelfth that fade first.
      const fr = f(notes[0] as number);
      s.tone({ f: fr, dur: dur + 0.35, v: vel * 0.42, a: 0.005, d: dur + 0.2, s: 0.08, r: 0.3 });
      s.tone({ f: fr * 2, dur: dur * 0.7 + 0.2, v: vel * 0.12, a: 0.004, s: 0.01 });
      s.tone({ f: fr * 3, dur: dur * 0.35 + 0.1, v: vel * 0.05, a: 0.003, s: 0.01 });
      break;
    }
    default:
      break;
  }
}

function battleVoice(s: Synth, inst: number, notes: readonly number[], vel: number, dur: number): void {
  switch (inst) {
    case Inst.kick:
      kick(s, 1.0 * vel, 165, 46, 0.22, 0.25);
      break;
    case Inst.snare:
      snare(s, vel * 0.9, 200, 2400);
      break;
    case Inst.hat:
      hat(s, vel, 0.05, 8000);
      break;
    case Inst.openHat:
      hat(s, vel * 0.8, 0.22, 7000);
      break;
    case Inst.tom:
      tom(s, 0.8 * vel, notes[0] as number);
      break;
    case Inst.crash:
      crash(s, vel, 0.95);
      break;
    case Inst.bass: {
      const fr = f(notes[0] as number);
      s.tone({ w: 'sawtooth', f: fr, dur: dur + 0.06, v: vel * 0.5, a: 0.004, d: 0.12, s: 0.45, r: 0.05, filter: { t: 'lowpass', f: 900, f2: 380, sw: 0.12, q: 1.5 } });
      s.tone({ f: fr, dur: dur + 0.06, v: vel * 0.75, a: 0.004, s: 0.5, r: 0.05 });
      break;
    }
    case Inst.pad:
      for (const n of notes) {
        s.tone({ w: 'sawtooth', f: f(n), dur: dur + 0.3, v: vel * 0.045, a: 0.15, s: 1, r: 0.3, uni: [-10, 10], filter: { t: 'lowpass', f: 1500, f2: 2300, sw: dur } });
      }
      break;
    case Inst.arp: {
      const fr = f(notes[0] as number);
      s.tone({ w: 'square', f: fr, dur: dur + 0.06, v: vel * 0.2, a: 0.002, s: 0.02, filter: { t: 'lowpass', f: 2800, f2: 1100, sw: 0.1 } });
      s.tone({ w: 'triangle', f: fr, dur: dur + 0.06, v: vel * 0.3, a: 0.002, s: 0.02 });
      break;
    }
    case Inst.lead: {
      const fr = f(notes[0] as number);
      s.tone({ w: 'sawtooth', f: fr, dur: dur + 0.08, v: vel * 0.2, a: 0.008, s: 0.7, r: 0.08, uni: [-6, 6], vib: { rate: 5.5, cents: 16, delay: 0.12 }, filter: { t: 'lowpass', f: 3200 } });
      s.tone({ w: 'square', f: fr, dur: dur + 0.08, v: vel * 0.1, a: 0.008, s: 0.7, r: 0.08, filter: { t: 'lowpass', f: 2400 } });
      break;
    }
    case Inst.lead2: {
      const fr = f(notes[0] as number);
      s.tone({ f: fr, dur: dur + 0.1, v: vel * 0.25, a: 0.01, s: 0.6, r: 0.1, vib: { rate: 5.5, cents: 14, delay: 0.15 } });
      s.tone({ w: 'triangle', f: fr, dur: dur + 0.1, v: vel * 0.12, a: 0.01, s: 0.6, r: 0.1 });
      break;
    }
    default:
      break;
  }
}

function bossVoice(s: Synth, inst: number, notes: readonly number[], vel: number, dur: number): void {
  switch (inst) {
    case Inst.kick:
      kick(s, 1.1 * vel, 140, 38, 0.3, 0.3);
      break;
    case Inst.snare:
      snare(s, vel, 170, 1800, 0.3);
      break;
    case Inst.hat:
      hat(s, vel * 0.9, 0.045, 9000);
      break;
    case Inst.tom:
      tom(s, 0.85 * vel, notes[0] as number);
      break;
    case Inst.crash:
      crash(s, vel, 1.3);
      break;
    case Inst.bass: {
      // Palm-muted chug: a saw through a fast-closing resonant lowpass, saturated, over a clean sub sine.
      const fr = f(notes[0] as number);
      s.tone({ w: 'sawtooth', f: fr, dur: dur + 0.04, v: vel * 0.55, a: 0.003, d: 0.06, s: 0.25, r: 0.03, sat: 0.3, filter: { t: 'lowpass', f: 1000, f2: 260, sw: 0.07, q: 2.5 } });
      s.tone({ f: fr, dur: dur + 0.04, v: vel * 0.6, a: 0.003, s: 0.4, r: 0.03 });
      break;
    }
    case Inst.stab:
      for (const n of notes) {
        s.tone({ w: 'sawtooth', f: f(n), dur: dur + 0.12, v: vel * 0.11, a: 0.004, d: 0.1, s: 0.25, r: 0.1, uni: [-9, 9], sat: 0.2, filter: { t: 'lowpass', f: 2200, f2: 600, sw: 0.16 } });
      }
      break;
    case Inst.pad:
      for (const n of notes) {
        s.tone({ w: 'sawtooth', f: f(n), dur: dur + 0.55, v: vel * 0.05, a: 0.45, s: 1, r: 0.55, uni: [-12, 12], filter: { t: 'lowpass', f: 700, f2: 950, sw: dur } });
      }
      break;
    case Inst.arp: {
      const fr = f(notes[0] as number);
      s.tone({ w: 'triangle', f: fr, dur: dur + 0.06, v: vel * 0.35, a: 0.002, s: 0.02, filter: { t: 'lowpass', f: 3000 } });
      s.tone({ f: fr * 2, dur: dur * 0.5 + 0.04, v: vel * 0.08, a: 0.002, s: 0.02 });
      break;
    }
    case Inst.lead: {
      const fr = f(notes[0] as number);
      s.tone({ w: 'sawtooth', f: fr, dur: dur + 0.1, v: vel * 0.22, a: 0.014, s: 0.8, r: 0.1, uni: [-8, 8], sat: 0.3, vib: { rate: 5, cents: 15, delay: 0.15 }, filter: { t: 'lowpass', f: 1500, f2: 3600, sw: 0.08 } });
      s.tone({ w: 'square', f: fr, dur: dur + 0.1, v: vel * 0.08, a: 0.014, s: 0.8, r: 0.1, filter: { t: 'lowpass', f: 1800 } });
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
