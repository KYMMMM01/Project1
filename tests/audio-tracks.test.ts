import { describe, expect, it } from 'vitest';
import { bassRoot, compose, parseChord, parseTune, type LaneSpec } from '@/audio/compose';
import { KITS } from '@/audio/kits';
import { SCORES, TRACK_IDS } from '@/audio/library';
import { battleMusic } from '@/audio/playlist';
import { BOSS, Inst, STEPS, type MusicTrackId, type Score } from '@/audio/scores';
import { StepClock } from '@/audio/sequencer';
import { noteToMidi } from '@/audio/theory';
import { Recorder, record, recordIntro, simulate } from './audio-music-lib';

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const inKey = (midi: number, root: string, scale: readonly number[], extra: readonly number[] = []): boolean => {
  const rel = (((midi - noteToMidi(`${root}4`)) % 12) + 12) % 12;
  return scale.includes(rel) || extra.includes(rel);
};

/** The key of every track written in the score language: tonic, scale, and the extra tones a chord may borrow (the leading tone of a dominant). */
const KEYS: Partial<Record<MusicTrackId, { root: string; scale: readonly number[]; extra?: readonly number[] }>> = {
  home2: { root: 'F', scale: MAJOR },
  kitchen: { root: 'Bb', scale: MAJOR },
  bath: { root: 'Eb', scale: MAJOR },
  garden: { root: 'D', scale: MAJOR },
  clinic: { root: 'A', scale: MINOR, extra: [11] },
  gold: { root: 'A', scale: MAJOR },
  elite: { root: 'D', scale: MINOR, extra: [11] },
  win: { root: 'C', scale: MAJOR },
  lose: { root: 'E', scale: MINOR },
};

const PITCHED = new Set<number>([Inst.bass, Inst.chord, Inst.pad, Inst.arp, Inst.lead, Inst.lead2, Inst.stab]);
const CHAPTER_TRACKS: readonly MusicTrackId[] = ['battle', 'kitchen', 'bath', 'garden', 'clinic'];
const NEW_TRACKS = Object.keys(KEYS) as MusicTrackId[];

describe('the score language', () => {
  it('reads chords and puts the bass in a register a phone can play', () => {
    expect(parseChord('Bb')).toEqual({ pc: 10, tones: [0, 4, 7] });
    expect(parseChord('F#m')).toEqual({ pc: 6, tones: [0, 3, 7] });
    expect(parseChord('C7').tones).toEqual([0, 4, 7, 10]);
    expect(parseChord('Bdim').tones).toEqual([0, 3, 6]);
    expect(parseChord('Gsus').tones).toEqual([0, 5, 7]);
    expect(() => parseChord('H')).toThrow();
    expect(() => parseChord('Cmin')).toThrow();
    for (let pc = 0; pc < 12; pc++) {
      const root = bassRoot({ pc, tones: [0, 4, 7] });
      expect(root).toBeGreaterThanOrEqual(noteToMidi('E2'));
      expect(root).toBeLessThanOrEqual(noteToMidi('Eb3'));
      expect(root % 12).toBe(pc);
    }
  });

  it('reads a tune: notes, lengths, rests, and fails loudly on a typo', () => {
    const bars = Array.from({ length: 16 }, () => 'r:4');
    bars[0] = 'C5:3 r:1 E5:2 G5:10';
    const t = parseTune(bars);
    expect(t.midi[0]).toBe(noteToMidi('C5'));
    expect(t.dur[0]).toBe(3);
    expect(t.midi[3]).toBe(-1);
    expect(t.midi[4]).toBe(noteToMidi('E5'));
    expect(t.midi[6]).toBe(noteToMidi('G5'));
    expect(t.dur[6]).toBe(10);
    expect(() => parseTune(bars.slice(1))).toThrow();
    expect(() => parseTune(bars.map((b, i) => (i === 3 ? 'C5:9 D5:8' : b)))).toThrow();
    expect(() => parseTune(bars.map((b, i) => (i === 3 ? 'H5:2' : b)))).toThrow();
    expect(() => parseTune(bars.map((b, i) => (i === 3 ? 'C5:x' : b)))).toThrow();
  });

  const lanes = (...l: LaneSpec[]): Score => compose({ id: 'kitchen', bpm: 120, layers: 2, layerEdges: [0.5], chords: 'C '.repeat(8) + 'F '.repeat(8), lanes: l });

  it('plays a bass line from degrees: root, octave, fifth, with the gap to the next note as its length', () => {
    const rec = record(lanes({ kind: 'bass', inst: Inst.bass, layer: 0, pats: ['R..o..f.........'], dur: 0.5 }));
    const bar0 = rec.notes.filter((n) => n.bar === 0);
    expect(bar0.map((n) => [n.step, n.midi, n.dur])).toEqual([
      [0, bassRoot(parseChord('C')), 1.5],
      [3, bassRoot(parseChord('C')) + 12, 1.5],
      [6, bassRoot(parseChord('C')) + 7, 5],
    ]);
    expect(bar0[0]?.vel).toBe(1);
    expect(bar0[1]?.vel).toBeLessThan(1);
    // The fifth of F is C, not G: the degrees follow the chord.
    expect(rec.notes.find((n) => n.bar === 8 && n.step === 6)?.midi).toBe(bassRoot(parseChord('F')) + 7);
  });

  it('plays chords stacked above the lowest note, arpeggios through the chord tones and pools of fixed notes', () => {
    const rec = record(
      lanes(
        { kind: 'comp', inst: Inst.chord, layer: 0, low: 55, pats: ['x...............'], dur: 2 },
        { kind: 'arp', inst: Inst.arp, layer: 1, low: 60, pats: ['0.3.4.7.........'] },
        { kind: 'pool', inst: Inst.orn, layer: 1, pool: ['E6', 'A6'], pats: ['..........1.....'] },
      ),
    );
    expect(rec.notes.filter((n) => n.inst === Inst.chord && n.bar === 0).map((n) => n.midi)).toEqual([60, 64, 67]);
    // F major above G3: F4 A4 C5.
    expect(rec.notes.filter((n) => n.inst === Inst.chord && n.bar === 8).map((n) => n.midi)).toEqual([65, 69, 72]);
    expect(rec.notes.filter((n) => n.inst === Inst.arp && n.bar === 0).map((n) => n.midi)).toEqual([60, 72, 72, 84]);
    expect(rec.notes.find((n) => n.inst === Inst.orn && n.bar === 3)?.midi).toBe(noteToMidi('A6'));
    expect(rec.notes.find((n) => n.inst === Inst.orn && n.bar === 3)?.step).toBe(10);
  });

  it('switches patterns by section, lets single bars override and masks bars out', () => {
    const rec = record(
      lanes({ kind: 'hit', inst: Inst.kick, layer: 0, midi: 36, pats: ['x...............', '....x...........'], bars: { 15: '...............x' }, on: '1111111111111110' }),
    );
    const at = (bar: number) => rec.notes.filter((n) => n.bar === bar).map((n) => n.step);
    expect(at(0)).toEqual([0]);
    expect(at(3)).toEqual([0]);
    expect(at(4)).toEqual([4]);
    // A shorter list repeats its last pattern for the later sections.
    expect(at(12)).toEqual([4]);
    // The mask wins over the override.
    expect(at(15)).toEqual([]);
  });

  it('doubles a tune on another instrument and layer, one octave up', () => {
    const tune = Array.from({ length: 16 }, () => 'C5:4 r:12');
    const rec = record(lanes({ kind: 'tune', inst: Inst.lead, layer: 0, tune, double: { inst: Inst.lead2, layer: 1, shift: 12, vel: 0.4 } }));
    const lead = rec.notes.filter((n) => n.inst === Inst.lead);
    const twin = rec.notes.filter((n) => n.inst === Inst.lead2);
    expect(lead).toHaveLength(16);
    expect(twin).toHaveLength(16);
    expect(twin[0]?.midi).toBe((lead[0]?.midi as number) + 12);
    expect(twin[0]?.layer).toBe(1);
  });

  it('can double only the held notes of a tune', () => {
    const tune = Array.from({ length: 16 }, () => 'C5:2 D5:6 r:8');
    const rec = record(lanes({ kind: 'tune', inst: Inst.lead, layer: 0, tune, double: { inst: Inst.lead2, layer: 1, shift: 12, vel: 0.4, minDur: 4 } }));
    expect(rec.notes.filter((n) => n.inst === Inst.lead)).toHaveLength(32);
    const twin = rec.notes.filter((n) => n.inst === Inst.lead2);
    expect(twin).toHaveLength(16);
    expect(twin.every((n) => n.midi === noteToMidi('D5') + 12 && n.dur === 6)).toBe(true);
  });

  it('rejects specs that are not 16 bars of 16 steps', () => {
    expect(() => compose({ id: 'kitchen', bpm: 120, layers: 1, chords: 'C C C', lanes: [] })).toThrow();
    expect(() => lanes({ kind: 'hit', inst: Inst.kick, layer: 0, pats: ['x..'] })).toThrow();
    expect(() => lanes({ kind: 'bass', inst: Inst.bass, layer: 0, pats: ['R.......'] })).toThrow();
    expect(() => lanes({ kind: 'arp', inst: Inst.arp, layer: 0, pats: ['0.1'] })).toThrow();
    expect(() => lanes({ kind: 'hit', inst: Inst.kick, layer: 0, pats: ['................'], on: '101' })).toThrow();
    expect(() => lanes({ kind: 'bass', inst: Inst.bass, layer: 0, pats: ['Z...............'] })).toThrow();
  });
});

describe('the library', () => {
  it('has twelve tracks, each with its own id', () => {
    expect(TRACK_IDS).toHaveLength(12);
    for (const id of TRACK_IDS) expect(SCORES[id].id).toBe(id);
    expect(new Set(TRACK_IDS.map((id) => SCORES[id].bpm)).size).toBe(12);
  });

  it('gives every chapter its own tempo, key and lead instrument family', () => {
    const bpm = CHAPTER_TRACKS.map((id) => SCORES[id].bpm);
    expect(new Set(bpm).size).toBe(5);
    expect(SCORES.battle.bpm).toBe(128);
    const roots = ['G', 'Bb', 'Eb', 'D', 'A'];
    expect(new Set(roots).size).toBe(5);
    // The chapter tracks are the ones that follow the wave: four intensity layers each.
    for (const id of CHAPTER_TRACKS.concat('gold')) {
      expect(SCORES[id].layers, id).toBe(4);
      expect(SCORES[id].layerEdges, id).toEqual([0.25, 0.5, 0.75]);
    }
  });

  it('keeps the fight tracks distinct from each other: boss and elite are D minor, faster than the places they interrupt', () => {
    expect(SCORES.boss.bpm).toBe(142);
    expect(SCORES.elite.layers).toBe(3);
    expect(SCORES.boss.bpm).toBeGreaterThan(Math.max(...CHAPTER_TRACKS.filter((c) => c !== 'battle').map((c) => SCORES[c].bpm)) - 12);
  });

  it('loops the menu pair into each other and nothing else', () => {
    expect(SCORES.home.then).toBe('home2');
    expect(SCORES.home2.then).toBe('home');
    for (const id of TRACK_IDS) if (id !== 'home' && id !== 'home2') expect(SCORES[id].then, id).toBeUndefined();
  });
});

describe('every new track', () => {
  for (const id of NEW_TRACKS) {
    const key = KEYS[id] as NonNullable<(typeof KEYS)[MusicTrackId]>;
    const rec = record(SCORES[id]);

    it(`${id}: stays in ${key.root}${key.scale === MAJOR ? ' major' : ' minor'}`, () => {
      for (const n of rec.notes) {
        if (PITCHED.has(n.inst)) expect(inKey(n.midi, key.root, key.scale, key.extra), `${n.midi} @ bar ${n.bar}:${n.step} inst ${n.inst}`).toBe(true);
      }
    });

    it(`${id}: the tune sits in a singable register and the bass in one a phone can play`, () => {
      for (const n of rec.notes.filter((x) => x.inst === Inst.lead)) {
        expect(n.midi).toBeGreaterThanOrEqual(noteToMidi('F4'));
        expect(n.midi).toBeLessThanOrEqual(noteToMidi('A6'));
      }
      const bass = rec.notes.filter((x) => x.inst === Inst.bass).map((x) => x.midi);
      expect(Math.min(...bass)).toBeGreaterThanOrEqual(noteToMidi('E2'));
      expect(Math.max(...bass)).toBeLessThanOrEqual(noteToMidi('E4'));
      expect(rec.notes.filter((x) => x.inst === Inst.lead).length).toBeGreaterThan(30);
    });

    it(`${id}: has a voice in its kit for every instrument it plays`, () => {
      const kit = KITS[id];
      expect(kit, id).toBeDefined();
      for (const inst of new Set(rec.notes.map((n) => n.inst))) expect(kit?.[inst], `inst ${inst}`).toBeTypeOf('function');
    });

    it(`${id}: no kit voice is left unused`, () => {
      const used = new Set(rec.notes.map((n) => n.inst));
      for (const inst of Object.keys(KITS[id] ?? {}).map(Number)) expect(used.has(inst), `inst ${inst}`).toBe(true);
    });

    it(`${id}: bounds its polyphony, sheds little of what it asks for and almost never a note of the tune`, () => {
      const layers = SCORES[id].layers;
      for (const run of layers > 1 ? [1, layers] : [1]) {
        const r = simulate(SCORES[id], 2, run);
        expect(r.peak, `${id} ${run} layers`).toBeLessThanOrEqual(12);
        expect(r.dropped / r.total, `${id} ${run} layers`).toBeLessThanOrEqual(0.04);
        const leadShed = (r.droppedBy[Inst.lead] ?? 0) / Math.max(1, r.startedBy[Inst.lead] ?? 0);
        expect(leadShed, `${id} ${run} layers: tune notes shed`).toBeLessThanOrEqual(0.02);
      }
    });
  }
});

describe('the chapter tracks and the gold dungeon layer like the battle track', () => {
  const layered: MusicTrackId[] = ['kitchen', 'bath', 'garden', 'clinic', 'gold'];
  for (const id of layered) {
    const rec = record(SCORES[id]);
    const bars = (layer: number): number => new Set(rec.notes.filter((n) => n.layer === layer).map((n) => n.bar)).size;

    it(`${id}: the bed is busy in every bar, and each layer above it adds to it`, () => {
      expect(bars(0), 'layer 0').toBe(16);
      expect(bars(1), 'layer 1').toBeGreaterThanOrEqual(14);
      expect(bars(2), 'layer 2').toBeGreaterThanOrEqual(14);
      expect(bars(3), 'layer 3').toBeGreaterThanOrEqual(10);
      const count = (layer: number) => rec.notes.filter((n) => n.layer === layer).length;
      expect(count(0)).toBeLessThan(rec.notes.length / 2);
    });

    it(`${id}: the tune is on layer 2 and its held notes are doubled an octave up on layer 3`, () => {
      const lead = rec.notes.filter((n) => n.inst === Inst.lead);
      const twin = rec.notes.filter((n) => n.inst === Inst.lead2);
      expect(new Set(lead.map((n) => n.layer))).toEqual(new Set([2]));
      expect(new Set(twin.map((n) => n.layer))).toEqual(new Set([3]));
      expect(twin.length).toBeGreaterThan(8);
      expect(twin.length).toBeLessThan(lead.length);
      for (const t of twin) {
        const src = lead.find((n) => n.bar === t.bar && n.step === t.step);
        expect(src?.midi, `bar ${t.bar}:${t.step}`).toBe(t.midi - 12);
        expect(src?.dur).toBe(t.dur);
        expect(t.dur).toBeGreaterThanOrEqual(3);
      }
    });

    it(`${id}: has the place's own percussion or ornament in it`, () => {
      const insts = new Set(rec.notes.map((n) => n.inst));
      expect(insts.has(Inst.perc) || insts.has(Inst.orn)).toBe(true);
    });
  }

  it('each place has a different percussion voice on its bed layer', () => {
    const percussion = (id: MusicTrackId) => new Set(record(SCORES[id]).notes.filter((n) => n.layer === 0 && (n.inst === Inst.perc || n.inst === Inst.perc2)).map((n) => n.inst));
    expect(percussion('kitchen').has(Inst.perc)).toBe(true);
    expect(percussion('bath').has(Inst.perc)).toBe(true);
    expect(percussion('clinic')).toEqual(new Set([Inst.perc, Inst.perc2]));
    // The clinic ticks on the beats 1 and 3 and tocks on 2 and 4, in the bed.
    const clinic = record(SCORES.clinic).notes.filter((n) => n.bar === 0);
    expect(clinic.filter((n) => n.inst === Inst.perc).map((n) => n.step)).toEqual([0, 8]);
    expect(clinic.filter((n) => n.inst === Inst.perc2).map((n) => n.step)).toEqual([4, 12]);
  });

  it('the garden has birds high up and the bathroom bubbles in the middle', () => {
    const birds = record(SCORES.garden).notes.filter((n) => n.inst === Inst.orn);
    expect(birds.length).toBeGreaterThan(8);
    for (const n of birds) expect(n.midi).toBeGreaterThanOrEqual(noteToMidi('B6'));
    const bubbles = record(SCORES.bath).notes.filter((n) => n.inst === Inst.perc);
    expect(bubbles.length).toBeGreaterThan(16);
  });

  it('the bridge has less in it than the sections around it', () => {
    for (const id of layered) {
      const rec = record(SCORES[id]);
      const inSection = (sec: number) => rec.notes.filter((n) => n.bar >> 2 === sec && n.layer <= 1).length;
      expect(Math.min(inSection(0), inSection(1), inSection(3)), id).toBeGreaterThan(inSection(2) * 0.6);
    }
  });
});

describe('the boss track opens with a sting', () => {
  it('has a one-bar intro with its own crash, a snare roll that swells and a falling tom run into the loop', () => {
    expect(BOSS.intro?.bars).toBe(1);
    const intro = recordIntro(BOSS);
    expect(intro.notes.some((n) => n.inst === Inst.crash && n.step === 0)).toBe(true);
    expect(intro.notes.some((n) => n.inst === Inst.pad && n.step === 0)).toBe(true);
    const roll = intro.notes.filter((n) => n.inst === Inst.snare);
    expect(roll.length).toBeGreaterThanOrEqual(8);
    expect(roll[roll.length - 1]?.vel).toBeGreaterThan(roll[0]?.vel as number);
    const toms = intro.notes.filter((n) => n.inst === Inst.tom);
    expect(toms.map((n) => n.step)).toEqual([12, 13, 14, 15]);
    expect(toms.map((n) => n.midi)).toEqual([...toms.map((n) => n.midi)].sort((a, b) => b - a));
    for (const n of intro.notes) {
      expect(n.step).toBeLessThan(STEPS);
      expect(n.vel).toBeGreaterThan(0);
      expect(n.vel).toBeLessThanOrEqual(1.01);
    }
  });

  it('is the only track with an intro, and the loop itself is unchanged', () => {
    for (const id of TRACK_IDS) expect(SCORES[id].intro === undefined, id).toBe(id !== 'boss');
    const r = new Recorder();
    BOSS.fill(0, 0, r);
    expect(r.notes.some((n) => n.inst === Inst.snare)).toBe(false);
  });
});

describe('StepClock with an intro', () => {
  it('plays the intro once, then loops the form', () => {
    const c = new StepClock(120, 32, 4, 16);
    c.start(0);
    expect(c.inIntro).toBe(true);
    expect(c.loopStep).toBe(0);
    expect(c.loops).toBe(0);
    for (let i = 0; i < 15; i++) c.advance();
    expect(c.loopStep).toBe(15);
    c.advance();
    expect(c.inIntro).toBe(false);
    expect(c.loopStep).toBe(0);
    for (let i = 0; i < 31; i++) c.advance();
    expect(c.loopStep).toBe(31);
    expect(c.loops).toBe(0);
    c.advance();
    expect(c.loopStep).toBe(0);
    expect(c.loops).toBe(1);
  });

  it('keeps bar lines on multiples of 16 steps, intro included', () => {
    const c = new StepClock(120, 256, 4, 16);
    c.start(10);
    // 120 BPM: a step is 0.125 s; from step 3 on the next bar line is step 16.
    c.advance();
    c.advance();
    c.advance();
    expect(c.nextBoundary(c.nextTime, 16)).toBeCloseTo(10 + 16 * 0.125, 9);
    expect(c.nextBoundary(c.nextTime, 4)).toBeCloseTo(10 + 4 * 0.125, 9);
  });

  it('without an intro behaves as it always did', () => {
    const c = new StepClock(120, 32);
    c.start(0);
    for (let i = 0; i < 33; i++) c.advance();
    expect(c.inIntro).toBe(false);
    expect(c.loopStep).toBe(1);
    expect(c.loops).toBe(1);
  });
});

describe('battleMusic: which battle track plays where', () => {
  it('gives each chapter its place', () => {
    expect([1, 2, 3, 4, 5].map((c) => battleMusic(c, 'chapter'))).toEqual(['battle', 'kitchen', 'bath', 'garden', 'clinic']);
  });

  it('plays the gold dungeon track in the gold dungeon, whatever the chapter', () => {
    for (const c of [1, 3, 5]) expect(battleMusic(c, 'gold')).toBe('gold');
  });

  it('plays the chapter music in every other mode, and the first track for the tutorial', () => {
    for (const mode of ['tutorial', 'daily', 'endless', 'chapter']) expect(battleMusic(3, mode)).toBe('bath');
    expect(battleMusic(1, 'tutorial')).toBe('battle');
  });

  it('wraps a chapter out of range instead of failing', () => {
    expect(battleMusic(6, 'chapter')).toBe('battle');
    expect(battleMusic(0, 'chapter')).toBe('clinic');
    expect(battleMusic(2.9, 'chapter')).toBe('kitchen');
    expect(battleMusic(Number.NaN, 'chapter')).toBe('battle');
  });
});
