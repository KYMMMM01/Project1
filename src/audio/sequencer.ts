/**
 * Pure scheduling maths for the look-ahead music sequencer: step clock, bar/beat positions and the
 * smoothed intensity layers. The engine drives these with ctx.currentTime; tests drive them with
 * made-up clocks, so the tricky parts (loop wrap, stall recovery, layer fades) are verifiable.
 */
import { smoothstep } from './envelopes';

export const STEPS_PER_BAR = 16;
/** How far ahead of ctx.currentTime notes are handed to WebAudio, and how often the timer fires. */
export const LOOKAHEAD_S = 0.12;
export const TIMER_MS = 25;

export function stepSeconds(bpm: number, stepsPerBeat = 4): number {
  return 60 / bpm / stepsPerBeat;
}

export class StepClock {
  readonly stepDur: number;
  /** Absolute step counter since start (never wraps; use `loopStep`). */
  stepIndex = 0;
  /** Context time at which `stepIndex` should sound. */
  nextTime = 0;

  constructor(
    bpm: number,
    private readonly loopSteps: number,
    stepsPerBeat = 4,
    /** Steps played once before the loop; a multiple of a bar so bar lines stay on multiples of 16. */
    readonly introSteps = 0,
  ) {
    this.stepDur = stepSeconds(bpm, stepsPerBeat);
  }

  start(time: number): void {
    this.stepIndex = 0;
    this.nextTime = time;
  }

  /** The one-off intro is still playing. */
  get inIntro(): boolean {
    return this.stepIndex < this.introSteps;
  }

  /** Passes of the loop completed so far (0 during the intro and the first pass). */
  get loops(): number {
    return this.inIntro ? 0 : Math.floor((this.stepIndex - this.introSteps) / this.loopSteps);
  }

  /** Position inside the intro while it plays, inside the looping form afterwards. */
  get loopStep(): number {
    return this.inIntro ? this.stepIndex : (this.stepIndex - this.introSteps) % this.loopSteps;
  }

  /** True while the next step begins before `horizon`; the caller schedules it then calls advance(). */
  due(horizon: number): boolean {
    return this.nextTime < horizon;
  }

  advance(): void {
    this.stepIndex++;
    this.nextTime += this.stepDur;
  }

  /**
   * Context time of the first step at or after `after` whose index is a multiple of `every`
   * (every = 4 gives the next beat, 16 the next bar). Nothing is advanced: callers use it to line
   * a new track or a layer change up with this clock's grid.
   */
  nextBoundary(after: number, every: number): number {
    const ahead = Math.max(0, Math.ceil((after - this.nextTime) / this.stepDur - 1e-9));
    let index = this.stepIndex + ahead;
    const rem = index % every;
    if (rem !== 0) index += every - rem;
    return this.nextTime + (index - this.stepIndex) * this.stepDur;
  }

  /**
   * After a stall (throttled timer, hidden tab, long GC) jump over steps that are already in the
   * past instead of firing them all at once. Returns how many steps were skipped.
   */
  skipLate(now: number, tolerance = 0.04): number {
    const late = now - tolerance - this.nextTime;
    if (late <= 0) return 0;
    const n = Math.ceil(late / this.stepDur);
    this.stepIndex += n;
    this.nextTime += n * this.stepDur;
    return n;
  }
}

/** Decompose a loop step into bar and step-in-bar (allocation free: writes into `out`). */
export function barPosition(loopStep: number, out: { bar: number; step: number }): void {
  out.bar = Math.floor(loopStep / STEPS_PER_BAR);
  out.step = loopStep - out.bar * STEPS_PER_BAR;
}

/**
 * Intensity (0..1) -> per-layer gain targets with a one-pole smoother mirroring the AudioParam
 * ramp. The JS shadow lets the scheduler skip notes of a layer that is still inaudible instead of
 * spending voices on a gain of zero.
 */
export class LayerMixer {
  /** Intensity at which each layer reaches half level; layer 0 is always on. */
  private readonly edges: readonly number[];
  readonly targets: Float64Array;
  readonly smooth: Float64Array;
  intensity = 0;

  constructor(
    readonly layers: number,
    edges: readonly number[],
    /** Fade time constant in seconds; 4 constants is ~98%, so 0.45 gives a ~1.8 s crossfade. */
    readonly tc = 0.45,
  ) {
    this.edges = edges;
    this.targets = new Float64Array(layers);
    this.smooth = new Float64Array(layers);
    this.targets[0] = 1;
    this.smooth[0] = 1;
  }

  setIntensity(v: number): void {
    this.intensity = Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
    for (let i = 1; i < this.layers; i++) {
      const e = this.edges[i - 1] as number;
      this.targets[i] = smoothstep(e - 0.1, e + 0.1, this.intensity);
    }
  }

  update(dt: number): void {
    const k = 1 - Math.exp(-Math.max(0, dt) / this.tc);
    for (let i = 0; i < this.layers; i++) {
      this.smooth[i] = (this.smooth[i] as number) + ((this.targets[i] as number) - (this.smooth[i] as number)) * k;
    }
  }

  /** Whether notes for `layer` are worth scheduling right now. */
  audible(layer: number): boolean {
    return (this.smooth[layer] as number) > 0.02 || (this.targets[layer] as number) > 0.02;
  }

  snap(): void {
    this.smooth.set(this.targets);
  }
}
