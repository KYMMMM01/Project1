/**
 * Look-ahead music sequencer. A 25 ms timer asks each running track which steps start within the
 * next 120 ms of ctx.currentTime and hands those notes to WebAudio with exact start times, so timing
 * never depends on the timer's jitter. Tracks cross-fade with equal-power curves; a new track enters
 * on the next bar line of the one it replaces (the next beat when the bar is further away), and its
 * one-off intro, if it has one, plays first. A track that names a successor (the menu pair) hands over
 * to it at the end of its loop, on the bar line. The chapter tracks' four intensity layers fade
 * smoothly on their own gain nodes, starting on a bar line.
 */
import type { MusicId } from './api';
import { equalPowerCurve } from './envelopes';
import { SCORES } from './library';
import { INST_PRIORITY, Inst, STEPS, type MusicTrackId, type NoteSink, type Score } from './scores';
import { LOOKAHEAD_S, LayerMixer, StepClock, TIMER_MS, barPosition } from './sequencer';
import { Synth } from './synth';
import { playVoice, voiceLength } from './instruments';
import { VoiceBudget } from './voices';

/** Mix level of each track relative to the music bus. */
const TRACK_LEVEL: Readonly<Record<MusicTrackId, number>> = {
  home: 1,
  home2: 0.97,
  battle: 0.9,
  kitchen: 0.91,
  bath: 0.77,
  garden: 0.72,
  clinic: 0.86,
  elite: 0.9,
  boss: 1,
  gold: 0.89,
  win: 0.78,
  lose: 0.74,
};
/** Reverb send per track: close-miked and dry, the menus and the bathroom get the most room, battle stays tight. */
const TRACK_VERB: Readonly<Record<MusicTrackId, number>> = {
  home: 0.25,
  home2: 0.25,
  battle: 0.1,
  kitchen: 0.1,
  bath: 0.35,
  garden: 0.3,
  clinic: 0.12,
  elite: 0.15,
  boss: 0.15,
  gold: 0.1,
  win: 0.25,
  lose: 0.35,
};
const MAX_RUNS = 3;
const FADE_POINTS = 48;
const STEPS_PER_BEAT = 4;
/** A track change waits for the next bar line when that is not further away than this... */
const MAX_BAR_WAIT_S = 2.6;
/** ...and otherwise for the next beat when that is not further away than this. */
const MAX_BEAT_WAIT_S = 0.7;
/** A track that cross-fades over another comes in this fast at most... */
const FADE_IN_MAX_S = 0.3;
/** ...and its fade-in starts this long before the bar line it enters on (nothing of it sounds yet), so the downbeat lands at about -1 dB instead of rising out of silence. */
const FADE_LEAD_S = 0.2;
/**
 * The hand-over from a track to its successor: the old one stops on the bar line and its tail fades under the new downbeat. The hand-over is
 * only noticed one look-ahead (0.12 s) before the line, so the new track's ramp is short enough to be nearly open when its downbeat comes.
 */
const CHAIN_OUT_S = 0.7;
const CHAIN_IN_S = 0.15;
/** Fade a run is given when too many are alive at once (rapid track switching). */
const HURRY_FADE_S = 0.04;

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
  /** Intensity the layer gains were last set for; a differing target is applied at the next bar line. */
  applied: number;
  /** Context time at which the run is retired (Infinity while it is the live track). */
  stopAt: number;
  /** The run has handed over to its successor: it schedules nothing more and only lets its tail fade. */
  chained: boolean;
}

export interface MusicStats {
  /** The track the game asked for. */
  track: MusicId;
  /** The score that is actually sounding (differs from `track` for the menu pair, and while a hand-over is pending). */
  playing: MusicId;
  /** The scheduler timer is active (it stops while the tab is hidden and when nothing is playing). */
  running: boolean;
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
  private homeVisits = 0;
  private readonly budget = new VoiceBudget(11, 12);
  private live = 0;
  private liveMax = 0;
  private created = 0;
  private skipped = 0;

  // Per-step scratch state the NoteSink methods read (no per-step allocation).
  private cur: Run | null = null;
  private stepTime = 0;
  private stepInBar = 0;
  private readonly pos = { bar: 0, step: 0 };
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

  /** The run that is the live track (not one fading out). */
  private liveRun(): Run | undefined {
    return this.runs.find((r) => r.stopAt === Infinity);
  }

  /** The menu pair alternates which of the two a visit starts with, so a short visit never always hears the same one. */
  private entryOf(id: MusicTrackId): MusicTrackId {
    if (id !== 'home') return id;
    return this.homeVisits++ % 2 === 0 ? 'home' : 'home2';
  }

  /** Cross-fade to `id` over `fade` seconds ('none' fades everything out). */
  play(id: MusicId, fade: number): void {
    if (id === this.current) return;
    const now = this.ctx.currentTime;
    const len = Math.max(0.05, fade);
    this.current = id;

    // Entering a new track on the outgoing track's next bar line keeps the pulse unbroken through the
    // cross-fade. Fading to silence, or starting from silence, does not wait.
    const outgoing = id === 'none' ? undefined : this.liveRun();
    let at = now;
    if (outgoing) {
      const after = now + 0.03;
      const bar = outgoing.clock.nextBoundary(after, STEPS);
      const beat = outgoing.clock.nextBoundary(after, STEPS_PER_BEAT);
      if (bar - now <= MAX_BAR_WAIT_S) at = bar;
      else if (beat - now <= MAX_BEAT_WAIT_S) at = beat;
    }
    this.enter(id === 'none' ? 'none' : this.entryOf(id), at, len, outgoing ? Math.min(len, FADE_IN_MAX_S) : len, outgoing ? FADE_LEAD_S : 0);
    this.start();
    this.pump(LOOKAHEAD_S);
  }

  /** Fade the live run out from `at` over `outLen` and start `track` at `at`, fading in over `inLen` from `lead` seconds before `at`. */
  private enter(track: MusicTrackId | 'none', at: number, outLen: number, inLen: number, lead: number): void {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const from = Math.max(at, now);
    for (const run of this.runs) {
      if (run.stopAt !== Infinity) continue;
      const g = run.fade.gain;
      const cur = g.value;
      const curve = equalPowerCurve(FADE_POINTS, false);
      for (let i = 0; i < curve.length; i++) curve[i] = (curve[i] as number) * cur;
      g.cancelScheduledValues(now);
      g.setValueAtTime(cur, now);
      g.setValueCurveAtTime(curve, from, outLen);
      run.stopAt = from + outLen + 0.1;
    }
    // Rapid switching can stack fade-outs: the oldest slow one is shortened (not cut) so it never
    // clicks. Runs that were already hurried retire on their own within a few frames.
    if (this.runs.length >= MAX_RUNS) {
      const slow = this.runs.find((r) => r.stopAt > now + HURRY_FADE_S + 0.05);
      if (slow) this.hurry(slow, now);
    }
    if (track === 'none') return;

    const score = SCORES[track];
    const fadeGain = ctx.createGain();
    fadeGain.gain.setValueAtTime(0, now);
    fadeGain.gain.setValueCurveAtTime(equalPowerCurve(FADE_POINTS, true), Math.max(now, from - lead), inLen);
    const level = ctx.createGain();
    level.gain.value = TRACK_LEVEL[track];
    fadeGain.connect(level);
    level.connect(this.bus);
    const verb = ctx.createGain();
    verb.gain.value = TRACK_VERB[track];
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
    const clock = new StepClock(score.bpm, score.bars * STEPS, STEPS_PER_BEAT, (score.intro?.bars ?? 0) * STEPS);
    clock.start(at > now ? at : now + 0.06);
    this.runs.push({ score, clock, fade: fadeGain, level, verb, layers, mixer, applied: this.intensity, stopAt: Infinity, chained: false });
  }

  /** Target intensity 0..1. The layer gains follow on the next bar line, so a new layer enters on a downbeat. */
  setIntensity(v: number): void {
    this.intensity = Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
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
      playing: this.liveRun()?.score.id ?? 'none',
      running: this.running,
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

  /** Stop the scheduler and release every run; the player is unusable afterwards. */
  dispose(): void {
    this.pause();
    for (const run of this.runs) this.retire(run);
    this.runs.length = 0;
    this.current = 'none';
  }

  private retire(run: Run): void {
    run.fade.disconnect();
    run.level.disconnect();
    run.verb.disconnect();
    for (const l of run.layers) l.disconnect();
  }

  /** Cut a run's remaining fade short with a 40 ms ramp; pump() retires it once that has played. */
  private hurry(run: Run, now: number): void {
    const g = run.fade.gain;
    const cur = g.value;
    g.cancelScheduledValues(now);
    g.setValueAtTime(cur, now);
    g.linearRampToValueAtTime(0, now + HURRY_FADE_S);
    run.stopAt = now + HURRY_FADE_S + 0.02;
  }

  /** Point a live run's layer gains at the current intensity, starting exactly at `time` (a bar line). */
  private applyIntensity(run: Run, time: number): void {
    run.applied = this.intensity;
    run.mixer.setIntensity(this.intensity);
    for (let l = 1; l < run.layers.length; l++) {
      (run.layers[l] as GainNode).gain.setTargetAtTime(run.mixer.targets[l] as number, time, run.mixer.tc);
    }
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

    // Forward, so a run started by a hand-over below gets its first steps scheduled in this very pass.
    for (let i = 0; i < this.runs.length; i++) {
      const run = this.runs[i] as Run;
      if (now >= run.stopAt) {
        this.retire(run);
        this.runs.splice(i, 1);
        i--;
        continue;
      }
      run.mixer.update(dt);
      this.skipped += run.clock.skipLate(now);
      if (run.chained) continue;
      const clock = run.clock;
      this.cur = run;
      while (clock.due(horizon)) {
        const intro = clock.inIntro;
        barPosition(clock.loopStep, this.pos);
        this.stepInBar = this.pos.step;
        this.stepTime = clock.nextTime;
        const live = run.stopAt === Infinity;
        if (!intro && live && run.score.then && clock.loops >= 1 && this.stepInBar === 0) {
          run.chained = true;
          this.enter(run.score.then, this.stepTime, CHAIN_OUT_S, CHAIN_IN_S, FADE_LEAD_S);
          break;
        }
        if (this.stepInBar === 0 && live && run.applied !== this.intensity) this.applyIntensity(run, this.stepTime);
        if (intro) (run.score.intro as NonNullable<Score['intro']>).fill(this.pos.bar, this.pos.step, this);
        else run.score.fill(this.pos.bar, this.pos.step, this);
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
    const pitched = inst >= Inst.bass && inst <= Inst.stab;
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
