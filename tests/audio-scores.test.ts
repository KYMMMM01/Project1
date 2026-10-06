import { describe, expect, it } from 'vitest';
import { voiceLength } from '@/audio/instruments';
import {
  BATTLE,
  BATTLE_LEAD,
  BOSS,
  BOSS_LEAD,
  HOME,
  HOME_LEAD,
  INST_PRIORITY,
  Inst,
  SCORES,
  STEPS,
  rhythm,
  type MusicTrackId,
  type NoteSink,
  type Score,
} from '@/audio/scores';
import { LayerMixer, StepClock, stepSeconds } from '@/audio/sequencer';
import { noteToMidi } from '@/audio/theory';
import { VoiceBudget } from '@/audio/voices';

interface Note {
  bar: number;
  step: number;
  inst: number;
  midi: number;
  vel: number;
  dur: number;
  layer: number;
  at: number;
}

/** Records every note a score emits over `loops` passes of its form. */
class Recorder implements NoteSink {
  readonly notes: Note[] = [];
  bar = 0;
  step = 0;

  note(inst: number, midi: number, vel: number, dur: number, layer: number, at = 0): void {
    this.notes.push({ bar: this.bar, step: this.step, inst, midi, vel, dur, layer, at });
  }

  chord(inst: number, midis: readonly number[], vel: number, dur: number, layer: number, at = 0): void {
    for (const m of midis) this.note(inst, m, vel, dur, layer, at);
  }
}

function record(score: Score): Recorder {
  const r = new Recorder();
  for (let bar = 0; bar < score.bars; bar++) {
    for (let step = 0; step < STEPS; step++) {
      r.bar = bar;
      r.step = step;
      score.fill(bar, step, r);
    }
  }
  return r;
}

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

/** True when `midi` belongs to the scale built on `root`. */
function inScale(midi: number, root: number, intervals: readonly number[]): boolean {
  return intervals.includes((((midi - root) % 12) + 12) % 12);
}

const PITCHED = new Set<number>([Inst.bass, Inst.chord, Inst.pad, Inst.arp, Inst.lead, Inst.lead2, Inst.stab]);

describe('score structure', () => {
  it('every track has a 16-bar form at its documented tempo', () => {
    expect(HOME.bpm).toBe(96);
    expect(BATTLE.bpm).toBe(128);
    expect(BOSS.bpm).toBe(142);
    for (const s of Object.values(SCORES)) expect(s.bars).toBe(16);
    expect(BATTLE.layers).toBe(4);
    expect(BATTLE.layerEdges).toHaveLength(3);
  });

  it('home stays in C major', () => {
    for (const n of record(HOME).notes) {
      if (PITCHED.has(n.inst)) expect(inScale(n.midi, 60, MAJOR_SCALE), `${n.midi} @ bar ${n.bar}:${n.step} inst ${n.inst}`).toBe(true);
    }
  });

  it('battle stays in G major', () => {
    for (const n of record(BATTLE).notes) {
      if (PITCHED.has(n.inst)) expect(inScale(n.midi, 67, MAJOR_SCALE), `${n.midi} @ bar ${n.bar}:${n.step} inst ${n.inst}`).toBe(true);
    }
  });

  it('boss stays in D minor (C# only as the leading tone of the A chord)', () => {
    const minorOrLeading = (m: number) => inScale(m, 62, MINOR_SCALE) || (((m % 12) + 12) % 12 === 1);
    for (const n of record(BOSS).notes) {
      if (PITCHED.has(n.inst)) expect(minorOrLeading(n.midi), `${n.midi} @ bar ${n.bar}:${n.step} inst ${n.inst}`).toBe(true);
    }
    const sharps = record(BOSS).notes.filter((n) => PITCHED.has(n.inst) && n.midi % 12 === 1);
    // Every C# belongs to a bar whose chord is A major (bars 3, 7, 11, 15).
    for (const n of sharps) expect(n.bar % 4).toBe(3);
  });

  it('lead melodies sit in a singable, phone-friendly register', () => {
    for (const grid of [HOME_LEAD, BATTLE_LEAD, BOSS_LEAD]) {
      let notes = 0;
      for (let i = 0; i < grid.midi.length; i++) {
        const midi = grid.midi[i] as number;
        if (midi < 0) continue;
        notes++;
        expect(midi).toBeGreaterThanOrEqual(noteToMidi('F4'));
        expect(midi).toBeLessThanOrEqual(noteToMidi('A6'));
        expect(grid.dur[i] as number).toBeGreaterThan(0);
        expect((i % STEPS) + (grid.dur[i] as number)).toBeLessThanOrEqual(STEPS + 8);
      }
      expect(notes).toBeGreaterThan(20);
    }
  });

  it('bass lines stay in a register a phone speaker can reproduce (home D2-C4, boss D3-D4+, battle E2-D4)', () => {
    const range = (score: Score) => {
      const m = record(score).notes.filter((x) => x.inst === Inst.bass).map((x) => x.midi);
      return [Math.min(...m), Math.max(...m)] as const;
    };
    const [hLo, hHi] = range(HOME);
    expect(hLo).toBeGreaterThanOrEqual(noteToMidi('D2'));
    expect(hHi).toBeLessThanOrEqual(noteToMidi('C4'));
    const [xLo, xHi] = range(BOSS);
    expect(xLo).toBeGreaterThanOrEqual(noteToMidi('D3'));
    expect(xHi).toBeLessThanOrEqual(noteToMidi('D5'));
    const [bLo, bHi] = range(BATTLE);
    expect(bLo).toBeGreaterThanOrEqual(noteToMidi('E2'));
    expect(bHi).toBeLessThanOrEqual(noteToMidi('D4'));
  });

  it('varies from section to section instead of repeating the same four bars', () => {
    for (const score of Object.values(SCORES)) {
      const rec = record(score);
      const sig = (sec: number) =>
        rec.notes
          .filter((n) => n.bar >> 2 === sec)
          .map((n) => `${n.step}:${n.inst}:${n.midi % 12}`)
          .sort()
          .join('|');
      const sigs = [0, 1, 2, 3].map(sig);
      expect(new Set(sigs).size, `${score.id} sections`).toBe(4);
    }
  });

  it('adds and drops instruments across the form', () => {
    for (const score of Object.values(SCORES)) {
      const rec = record(score);
      const insts = (sec: number) => new Set(rec.notes.filter((n) => n.bar >> 2 === sec).map((n) => n.inst));
      const counts = [0, 1, 2, 3].map((s) => insts(s).size);
      expect(Math.max(...counts), `${score.id}`).toBeGreaterThan(Math.min(...counts));
    }
    // Battle: the breakdown (bars 8-9) has no kick or snare, the chorus has both.
    const bat = record(BATTLE);
    const bd = bat.notes.filter((n) => n.bar === 8 || n.bar === 9);
    expect(bd.some((n) => n.inst === Inst.kick || n.inst === Inst.snare)).toBe(false);
    expect(bat.notes.some((n) => n.bar === 12 && n.inst === Inst.kick)).toBe(true);
  });

  it('battle layers build up: kick/bass/hat, then arp, then lead + snare, then octave lead + open hat + fills', () => {
    const rec = record(BATTLE);
    const layerInsts = (l: number) => new Set(rec.notes.filter((n) => n.layer === l).map((n) => n.inst));
    expect(layerInsts(0)).toEqual(new Set([Inst.kick, Inst.bass, Inst.hat]));
    expect(layerInsts(1)).toEqual(new Set([Inst.arp, Inst.pad]));
    expect(layerInsts(2)).toEqual(new Set([Inst.snare, Inst.lead]));
    for (const inst of [Inst.lead2, Inst.openHat, Inst.tom, Inst.crash]) expect(layerInsts(3).has(inst)).toBe(true);
    // The octave lead doubles the hook exactly one octave up.
    const lead = rec.notes.filter((n) => n.inst === Inst.lead);
    const lead2 = rec.notes.filter((n) => n.inst === Inst.lead2);
    expect(lead2.length).toBe(lead.length);
    lead.forEach((n, i) => expect((lead2[i] as Note).midi).toBe(n.midi + 12));
  });

  it('every battle layer is busy in every non-breakdown bar so a fade-in is audible immediately', () => {
    const rec = record(BATTLE);
    for (let bar = 0; bar < 16; bar++) {
      if (bar === 8 || bar === 9) continue;
      for (const layer of [0, 1, 2]) {
        expect(rec.notes.some((n) => n.bar === bar && n.layer === layer), `bar ${bar} layer ${layer}`).toBe(true);
      }
    }
  });

  it('layer 0 alone is a sparse bed (bass + kick + hat) with far fewer notes than the full mix', () => {
    const rec = record(BATTLE);
    const l0 = rec.notes.filter((n) => n.layer === 0).length;
    expect(l0).toBeGreaterThan(40);
    expect(l0).toBeLessThan(rec.notes.length / 2);
  });

  it('only emits valid instrument ids, velocities and durations', () => {
    for (const score of Object.values(SCORES)) {
      for (const n of record(score).notes) {
        expect(n.inst).toBeGreaterThanOrEqual(0);
        expect(n.inst).toBeLessThan(INST_PRIORITY.length);
        expect(n.vel).toBeGreaterThan(0);
        expect(n.vel).toBeLessThanOrEqual(1.01);
        expect(n.dur).toBeGreaterThan(0);
        expect(n.layer).toBeGreaterThanOrEqual(0);
        expect(n.layer).toBeLessThan(score.layers);
      }
    }
  });
});

/** Replay a score through the same budget the engine uses and report how often notes were shed. */
function simulate(score: Score, loops: number, layers: number): { total: number; dropped: number; peak: number } {
  const clock = new StepClock(score.bpm, score.bars * STEPS);
  clock.start(0);
  const budget = new VoiceBudget(11, 12);
  const mixer = new LayerMixer(score.layers, score.layerEdges);
  mixer.setIntensity(layers >= 4 ? 1 : (layers - 1) * 0.3);
  mixer.snap();
  let total = 0;
  const stepDur = stepSeconds(score.bpm);
  const sink: NoteSink = {
    note(inst, _midi, _vel, durSteps, layer, at = 0) {
      if (!mixer.audible(layer)) return;
      let start = clock.nextTime + at * stepDur;
      const stepInBar = clock.loopStep % STEPS;
      if (score.swing > 0 && stepInBar & 1) start += score.swing * stepDur;
      total++;
      budget.tryAdd(start, start + voiceLength(score.id, inst, durSteps * stepDur), INST_PRIORITY[inst] as number);
    },
    chord(inst, _midis, vel, durSteps, layer, at = 0) {
      this.note(inst, 0, vel, durSteps, layer, at);
    },
  };
  for (let i = 0; i < loops * score.bars * STEPS; i++) {
    const loop = clock.loopStep;
    const bar = Math.floor(loop / STEPS);
    score.fill(bar, loop - bar * STEPS, sink);
    clock.advance();
  }
  return { total, dropped: budget.dropped, peak: budget.peak };
}

describe('music polyphony budget', () => {
  const cases: Array<[MusicTrackId, number, number]> = [
    ['home', 1, 0.02],
    ['battle', 1, 0.02],
    ['battle', 4, 0.05],
    ['boss', 1, 0.03],
  ];
  for (const [id, layers, maxDropped] of cases) {
    it(`${id} (${layers} layers) stays within 12 voices and sheds little`, () => {
      const r = simulate(SCORES[id], 2, layers);
      expect(r.peak).toBeLessThanOrEqual(12);
      expect(r.dropped / r.total).toBeLessThanOrEqual(maxDropped);
    });
  }
});

describe('rhythm()', () => {
  it('parses velocities and rejects bad lengths', () => {
    const r = rhythm('X.xog...........');
    expect(r[0]).toBe(1);
    expect(r[1]).toBe(0);
    expect(r[2]).toBeGreaterThan(r[3] as number);
    expect(r[3]).toBeGreaterThan(r[4] as number);
    expect(() => rhythm('x.x')).toThrow();
  });
});
