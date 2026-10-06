import { clamp, damp } from '@/core/math';

/** Pure scroll physics (no Pixi): one axis of drag / inertia / rubber-band, so it is unit-testable. */

/** Pointer travel (design px) before a press becomes a drag; below it, child buttons still get the tap. */
export const DRAG_THRESHOLD = 8;

/**
 * iOS-style rubber band: maps raw overscroll `x` (px past the edge) to the displayed distance. It is
 * monotonic, starts with slope `c`, and never exceeds `dim` however far the finger travels.
 */
export function rubberBand(x: number, dim: number, c = 0.55): number {
  if (x <= 0 || dim <= 0) return 0;
  return (1 - 1 / ((x * c) / dim + 1)) * dim;
}

/** Inverse of rubberBand: the raw finger travel that produces displayed overscroll `y` (< dim). */
export function rubberBandInverse(y: number, dim: number, c = 0.55): number {
  if (y <= 0 || dim <= 0) return 0;
  const r = Math.min(y, dim * 0.999);
  return (dim * (1 / (1 - r / dim) - 1)) / c;
}

/** Fixed-size ring of recent (time, position) samples; velocity is read without allocating. */
export class VelocityTracker {
  private readonly t = new Float64Array(6);
  private readonly p = new Float64Array(6);
  private n = 0;
  private head = 0;

  reset(): void {
    this.n = 0;
    this.head = 0;
  }

  /** `time` in seconds, `pos` in px. */
  push(time: number, pos: number): void {
    this.t[this.head] = time;
    this.p[this.head] = pos;
    this.head = (this.head + 1) % this.t.length;
    if (this.n < this.t.length) this.n++;
  }

  /**
   * Average velocity (px/s) over samples no older than `window` seconds before the newest one.
   * Returns 0 when the finger paused long enough that a release should not fling.
   */
  velocity(now: number, window = 0.1): number {
    if (this.n < 2) return 0;
    const len = this.t.length;
    const newest = (this.head - 1 + len) % len;
    // A finger that rested before lifting must not fling with the stale motion.
    if (now - (this.t[newest] as number) > window) return 0;
    let oldest = newest;
    for (let i = 1; i < this.n; i++) {
      const idx = (newest - i + len) % len;
      if ((this.t[newest] as number) - (this.t[idx] as number) > window) break;
      oldest = idx;
    }
    const dt = (this.t[newest] as number) - (this.t[oldest] as number);
    if (dt <= 1e-4) return 0;
    return ((this.p[newest] as number) - (this.p[oldest] as number)) / dt;
  }
}

export interface AxisTuning {
  /** Exponential friction, 1/s. Higher stops sooner. */
  friction: number;
  /** Fling speed cap, px/s. */
  maxSpeed: number;
  /** Below this speed (px/s) inertia stops dead. */
  stopSpeed: number;
  /** Half-life (s) of the spring that pulls an overscrolled axis back. */
  springHalfLife: number;
  /** Rubber-band constant. */
  rubber: number;
}

export const DEFAULT_TUNING: AxisTuning = {
  friction: 3.4,
  maxSpeed: 6500,
  stopSpeed: 14,
  springHalfLife: 0.075,
  rubber: 0.55,
};

/**
 * One scroll axis. `pos` is how far the content has moved from its start (0..max, plus rubber-band
 * overscroll beyond either end). Drive it with beginDrag/dragBy/endDrag from pointer events, and
 * call update(dt) each frame while it reports motion.
 */
export class ScrollAxis {
  pos = 0;
  vel = 0;
  max = 0;
  /** Viewport length along this axis; scales the rubber band. */
  viewport = 1;
  dragging = false;
  /** Overscroll resistance: false clamps hard at the edges (short content, tooltips). */
  elastic = true;

  private raw = 0;
  private tuning: AxisTuning;

  constructor(tuning: Partial<AxisTuning> = {}) {
    this.tuning = { ...DEFAULT_TUNING, ...tuning };
  }

  /** Displayed position for an unconstrained "finger" position. */
  displayOf(raw: number): number {
    if (raw < 0) return this.elastic ? -rubberBand(-raw, this.viewport, this.tuning.rubber) : 0;
    if (raw > this.max) return this.max + (this.elastic ? rubberBand(raw - this.max, this.viewport, this.tuning.rubber) : 0);
    return raw;
  }

  /** How far outside [0, max] the axis currently sits (signed: negative above the start). */
  get overscroll(): number {
    return this.pos < 0 ? this.pos : this.pos > this.max ? this.pos - this.max : 0;
  }

  get moving(): boolean {
    return this.dragging || Math.abs(this.vel) > 0 || this.overscroll !== 0;
  }

  beginDrag(): void {
    this.dragging = true;
    this.vel = 0;
    // Resume from where the content is, including any rubber-band stretch already showing.
    if (this.pos < 0) this.raw = -rubberBandInverse(-this.pos, this.viewport, this.tuning.rubber);
    else if (this.pos > this.max)
      this.raw = this.max + rubberBandInverse(this.pos - this.max, this.viewport, this.tuning.rubber);
    else this.raw = this.pos;
  }

  /** `delta` is the content movement this event (finger moved up by 10px => +10). */
  dragBy(delta: number): void {
    this.raw += delta;
    this.pos = this.displayOf(this.raw);
  }

  /** Release with a fling velocity (px/s, content direction). */
  endDrag(velocity: number): void {
    this.dragging = false;
    this.vel = clamp(velocity, -this.tuning.maxSpeed, this.tuning.maxSpeed);
  }

  /** Jump (no animation), clamped to the range. */
  jump(pos: number): void {
    this.pos = clamp(pos, 0, this.max);
    this.vel = 0;
    this.raw = this.pos;
  }

  /** Change the scrollable length, keeping the position valid. */
  setMax(max: number): void {
    this.max = Math.max(0, max);
    if (!this.dragging) this.pos = clamp(this.pos, 0, this.max);
  }

  /** Advance inertia / spring-back. Returns true while there is still motion to animate. */
  update(dt: number): boolean {
    if (this.dragging) return true;
    const over = this.overscroll;
    if (over !== 0) {
      // Past an edge: bleed off the fling and let a critically damped pull return to the boundary.
      this.vel *= Math.exp(-14 * dt);
      const edge = over < 0 ? 0 : this.max;
      this.pos += this.vel * dt;
      this.pos = damp(this.pos, edge, this.tuning.springHalfLife, dt);
      if (Math.abs(this.pos - edge) < 0.25) {
        this.pos = edge;
        this.vel = 0;
      }
      return this.pos !== edge || this.vel !== 0;
    }
    if (this.vel === 0) return false;
    this.pos += this.vel * dt;
    this.vel *= Math.exp(-this.tuning.friction * dt);
    if (Math.abs(this.vel) < this.tuning.stopSpeed) {
      this.vel = 0;
      this.pos = clamp(this.pos, 0, this.max);
      return false;
    }
    if (!this.elastic) {
      if (this.pos < 0 || this.pos > this.max) {
        this.pos = clamp(this.pos, 0, this.max);
        this.vel = 0;
        return false;
      }
    }
    return true;
  }
}
