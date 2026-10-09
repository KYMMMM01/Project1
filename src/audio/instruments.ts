/**
 * Music instruments: how each Inst id of each track is synthesised. A small acoustic combo built from the
 * same oscillator / noise voices as the SFX, so no samples are needed: a felt kick and a wooden rim, a
 * paper shaker for the hats, a marimba and a kalimba for the melody, a ukulele and a plucked bass for the
 * harmony, a soft triangle pad. Nothing here is a raw saw, a square or a distorted lead: the battle layers
 * add rhythm and counter-melody, not drive. A voice is one envelope group (a chord is a single voice of
 * several oscillators) which is what the polyphony budget counts. The three original tracks are voiced below; every newer track has a kit in kits.ts.
 */
import { crash, hat, kick, marimba, mutedBass, pluck, snare, tine, tom, ukulele, upright } from './parts';
import { KITS, KIT_TAILS } from './kits';
import { Inst, type MusicTrackId } from './scores';
import { midiToHz } from './theory';
import type { Synth } from './synth';

const f = midiToHz;

/**
 * Seconds a voice keeps sounding after its note starts, release included (for the voice budget).
 * Must track the envelopes below: an over-long estimate sheds notes that were never really overlapping.
 */
export function voiceLength(track: MusicTrackId, inst: number, durSec: number): number {
  const tail = KIT_TAILS[track]?.[inst];
  if (tail !== undefined) return durSec + tail;
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
    case Inst.perc:
      return 0.26;
    case Inst.perc2:
      return 0.2;
    case Inst.orn:
      return 0.45;
    default:
      return durSec + 0.14;
  }
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
      ukulele(s, notes, vel, dur);
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
    case Inst.bass:
      mutedBass(s, f(notes[0] as number), vel, dur);
      break;
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
  const kit = KITS[track];
  if (kit) kit[inst]?.(s, notes, vel, durSec);
  else if (track === 'home') homeVoice(s, inst, notes, vel, durSec);
  else if (track === 'battle') battleVoice(s, inst, notes, vel, durSec);
  else bossVoice(s, inst, notes, vel, durSec);
}
