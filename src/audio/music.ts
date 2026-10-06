/**
 * Look-ahead music sequencer. A 25 ms timer asks each running track which steps start within the
 * next 120 ms of ctx.currentTime and hands those notes to WebAudio with exact start times, so timing
 * never depends on the timer's jitter. Tracks cross-fade with equal-power curves; the battle
 * track's four intensity layers fade smoothly on their own gain nodes.
 */
import type { MusicId } from './api';
import { equalPowerCurve } from './envelopes';
import { INST_PRIORITY, Inst, SCORES, STEPS, type NoteSink, type Score } from './scores';
import { LOOKAHEAD_S, LayerMixer, StepClock, TIMER_MS } from './sequencer';
import { Synth } from './synth';
import { playVoice, voiceLength } from './instruments';
import { VoiceBudget } from './voices';

/** Mix level of each track relative to the music bus. */
const TRACK_LEVEL: Record<string, number> = { home: 0.8, battle: 0.85, boss: 0.85 };
/** Reverb send per track: home sits in a soft room, battle stays tight and punchy. */
const TRACK_VERB: Record<string, number> = { home: 0.4, battle: 0.14, boss: 0.24 };
const MAX_RUNS = 3;
const FADE_POINTS = 48;

interface Run {
  score: Score;
  clock: StepClock;
  /** Cross-fade gain (equal-power curves). */
  fade: GainNode;
  /** Static track level; the reverb send taps it. */
  level: GainNode;
  verb: GainNode;
  layers: GainNode[];
  mixer: LayerMixer;
  /** Context time at which the run is retired (Infinity while it is the live track). */
  stopAt: number;
}

export interface MusicStats {
  track: MusicId;
  intensity: number;
  runs: number;
  /** Voices scheduled and not yet ended (includes the look-ahead window). */
  liveVoices: number;
  /** Highest simultaneous live voices since the last reset. */
  liveVoicesMax: number;
  /** Highest overlap the polyphony budget ever admitted. */
  peakOverlap: number;
  droppedByBudget: number;
  skippedSteps: number;
  voicesCreated: number;
}

export class MusicPlayer implements NoteSink {
  private runs: Run[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;
  private intensity = 0;
  private current: MusicId = 'none';
  private readonly budget = new VoiceBudget(12, 14);
  private live = 0;
  private liveMax = 0;
  private created = 0;
  private skipped = 0;

  // Per-step scratch state the NoteSink methods read (no per-step allocation).
  private cur: Run | null = null;
  private stepTime = 0;
  private stepInBar = 0;
  private readonly one: number[] = [0];

  /** Shared completion callback so live-voice counting allocates nothing per note. */
  private readonly onVoiceEnd = (): void => {
    this.live = Math.max(0, this.live - 1);
  };

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly bus: AudioNode,
    private readonly reverbIn: AudioNode,
  ) {}

  get track(): MusicId {
    return this.current;
  }

  get running(): boolean {
    return this.timer !== null;
  }

  /** Cross-fade to `id` over `fade` seconds ('none' fades everything out). */
  play(id: MusicId, fade: number): void {
    if (id === this.current) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const len = Math.max(0.05, fade);
    this.current = id;

    for (const run of this.runs) {
      if (run.stopAt !== Infinity) continue;
      const g = run.fade.gain;
      const cur = g.value;
      const curve = equalPowerCurve(FADE_POINTS, false);
      for (let i = 0; i < curve.length; i++) curve[i] = (curve[i] as number) * cur;
      g.cancelScheduledValues(now);
      g.setValueAtTime(cur, now);
      g.setValueCurveAtTime(curve, now, len);
      run.stopAt = now + len + 0.1;
    }
    while (this.runs.length >= MAX_RUNS) this.retire(this.runs.shift() as Run);

    if (id !== 'none') {
      const score = SCORES[id];
      const fadeGain = ctx.createGain();
      fadeGain.gain.setValueAtTime(0, now);
      fadeGain.gain.setValueCurveAtTime(equalPowerCurve(FADE_POINTS, true), now, len);
      const level = ctx.createGain();
      level.gain.value = TRACK_LEVEL[id] ?? 0.8;
      fadeGain.connect(level);
      level.connect(this.bus);
      const verb = ctx.createGain();
      verb.gain.value = TRACK_VERB[id] ?? 0.2;
      level.connect(verb);
      verb.connect(this.reverbIn);

      const mixer = new LayerMixer(score.layers, score.layerEdges);
      mixer.setIntensity(this.intensity);
      mixer.snap();
      const layers: GainNode[] = [];
      for (let l = 0; l < score.layers; l++) {
        const lg = ctx.createGain();
        lg.gain.value = mixer.targets[l] as number;
        lg.connect(fadeGain);
        layers.push(lg);
      }
      const clock = new StepClock(score.bpm, score.bars * STEPS);
      clock.start(now + 0.06);
      this.runs.push({ score, clock, fade: fadeGain, level, verb, layers, mixer, stopAt: Infinity });
    }
    this.start();
    this.pump(LOOKAHEAD_S);
  }

  setIntensity(v: number): void {
    this.intensity = Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
    const now = this.ctx.currentTime;
    for (const run of this.runs) {
      if (run.stopAt !== Infinity) continue;
      run.mixer.setIntensity(this.intensity);
      for (let l = 1; l < run.layers.length; l++) {
        (run.layers[l] as GainNode).gain.setTargetAtTime(run.mixer.targets[l] as number, now, run.mixer.tc);
      }
    }
  }

  /** Stop the scheduler (tab hidden). Voices already handed to WebAudio finish on their own. */
  pause(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Restart after pause(); steps that fell into the past are skipped, never replayed in a burst. */
  resume(): void {
    if (this.runs.length === 0) return;
    const now = this.ctx.currentTime;
    for (const run of this.runs) this.skipped += run.clock.skipLate(now);
    this.lastTick = now;
    this.start();
  }

  stats(): MusicStats {
    return {
      track: this.current,
      intensity: this.intensity,
      runs: this.runs.length,
      liveVoices: this.live,
      liveVoicesMax: this.liveMax,
      peakOverlap: this.budget.peak,
      droppedByBudget: this.budget.dropped,
      skippedSteps: this.skipped,
      voicesCreated: this.created,
    };
  }

  resetStats(): void {
    this.liveMax = this.live;
    this.budget.peak = 0;
    this.budget.dropped = 0;
    this.skipped = 0;
    this.created = 0;
  }

  private start(): void {
    if (this.timer !== null) return;
    this.lastTick = this.ctx.currentTime;
    this.timer = setInterval(() => this.pump(LOOKAHEAD_S), TIMER_MS);
  }

  private retire(run: Run): void {
    run.fade.disconnect();
    run.level.disconnect();
    run.verb.disconnect();
    for (const l of run.layers) l.disconnect();
  }

  /**
   * Hand every step that starts within `ahead` seconds of now to WebAudio. The timer calls this
   * with the 120 ms look-ahead; an offline render calls it once with the whole clip length.
   */
  pump(ahead: number): void {
    const now = this.ctx.currentTime;
    const dt = now - this.lastTick;
    this.lastTick = now;
    const horizon = now + ahead;

    for (let i = this.runs.length - 1; i >= 0; i--) {
      const run = this.runs[i] as Run;
      if (now >= run.stopAt) {
        this.retire(run);
        this.runs.splice(i, 1);
        continue;
      }
      run.mixer.update(dt);
      this.skipped += run.clock.skipLate(now);
      const clock = run.clock;
      this.cur = run;
      while (clock.due(horizon)) {
        const loop = clock.loopStep;
        const bar = Math.floor(loop / STEPS);
        this.stepInBar = loop - bar * STEPS;
        this.stepTime = clock.nextTime;
        run.score.fill(bar, this.stepInBar, this);
        clock.advance();
      }
    }
    this.cur = null;
    if (this.runs.length === 0 && this.current === 'none') this.pause();
  }

  note(inst: number, midi: number, vel: number, durSteps: number, layer: number, at = 0): void {
    this.one[0] = midi;
    this.emit(inst, this.one, vel, durSteps, layer, at);
  }

  chord(inst: number, midis: readonly number[], vel: number, durSteps: number, layer: number, at = 0): void {
    this.emit(inst, midis, vel, durSteps, layer, at);
  }

  private emit(inst: number, notes: readonly number[], vel: number, durSteps: number, layer: number, at: number): void {
    const run = this.cur;
    if (!run || !run.mixer.audible(layer)) return;
    const stepDur = run.clock.stepDur;
    let start = this.stepTime + at * stepDur;
    // Swing delays the off 16ths; a hair of timing/velocity jitter keeps repeats from sounding sequenced.
    if (run.score.swing > 0 && (this.stepInBar & 1) === 1) start += run.score.swing * stepDur;
    const pitched = inst >= Inst.bass;
    if (pitched) start += (Math.random() - 0.5) * 0.008;
    const v = vel * (0.94 + Math.random() * 0.12);
    const dur = durSteps * stepDur;
    const end = start + voiceLength(run.score.id, inst, dur);
    if (!this.budget.tryAdd(start, end, INST_PRIORITY[inst] as number)) return;

    const s = new Synth(this.ctx, run.layers[layer] as GainNode, start, Math.random, true);
    playVoice(s, run.score.id, inst, notes, v, dur);
    s.seal(this.onVoiceEnd);
    this.created++;
    this.live++;
    if (this.live > this.liveMax) this.liveMax = this.live;
  }
}
