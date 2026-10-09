/** Shared helpers of the music tests: record every note a score emits, and replay a score through the engine's voice budget. */
import { voiceLength } from '@/audio/instruments';
import { INST_PRIORITY, STEPS, type NoteSink, type Score } from '@/audio/scores';
import { LayerMixer, StepClock, stepSeconds } from '@/audio/sequencer';
import { VoiceBudget } from '@/audio/voices';

export interface Note {
  bar: number;
  step: number;
  inst: number;
  midi: number;
  vel: number;
  dur: number;
  layer: number;
  at: number;
}

/** Records every note a score emits (a chord is one note per tone). */
export class Recorder implements NoteSink {
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

/** Every note of one pass over the score's 16-bar form. */
export function record(score: Score): Recorder {
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

/** Every note of the score's one-off intro. */
export function recordIntro(score: Score): Recorder {
  const r = new Recorder();
  const intro = score.intro;
  if (!intro) return r;
  for (let bar = 0; bar < intro.bars; bar++) {
    for (let step = 0; step < STEPS; step++) {
      r.bar = bar;
      r.step = step;
      intro.fill(bar, step, r);
    }
  }
  return r;
}

/** Replay a score through the same budget the engine uses and report how often notes were shed. */
export function simulate(score: Score, loops: number, layers: number): { total: number; dropped: number; peak: number; droppedBy: Record<number, number>; startedBy: Record<number, number> } {
  const clock = new StepClock(score.bpm, score.bars * STEPS);
  clock.start(0);
  const budget = new VoiceBudget(11, 12);
  const mixer = new LayerMixer(score.layers, score.layerEdges);
  mixer.setIntensity(layers >= 4 ? 1 : (layers - 1) * 0.3);
  mixer.snap();
  let total = 0;
  const droppedBy: Record<number, number> = {};
  const startedBy: Record<number, number> = {};
  const stepDur = stepSeconds(score.bpm);
  const sink: NoteSink = {
    note(inst, _midi, _vel, durSteps, layer, at = 0) {
      if (!mixer.audible(layer)) return;
      let start = clock.nextTime + at * stepDur;
      const stepInBar = clock.loopStep % STEPS;
      if (score.swing > 0 && stepInBar & 1) start += score.swing * stepDur;
      total++;
      startedBy[inst] = (startedBy[inst] ?? 0) + 1;
      if (!budget.tryAdd(start, start + voiceLength(score.id, inst, durSteps * stepDur), INST_PRIORITY[inst] as number)) droppedBy[inst] = (droppedBy[inst] ?? 0) + 1;
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
  return { total, dropped: budget.dropped, peak: budget.peak, droppedBy, startedBy };
}
