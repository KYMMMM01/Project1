import { REDUCED, fxSettings } from './settings';

/** Anything with a mutable clock speed: a Tweener, a battle simulation wrapper, an audio rate... */
export interface TimeScaled {
  timeScale: number;
}

export interface TimeFreezeOpts {
  /** Longest single freeze in seconds; the guide's hard cap for global hit-stop. */
  maxSeconds?: number;
  /** Minimum gap between two freezes, measured from the start of the previous one. */
  cooldown?: number;
}

const SLOTS = 8;

/**
 * Hit-stop / slow-motion for gameplay only. Targets (typically the battle scene's Tweener and
 * simulation) are slowed while UI, particles and audio keep their own clocks.
 *
 * Several freezes may overlap: each is an independent hold with its own remaining time and speed, the
 * effective speed is the slowest active one, and the freeze ends when the longest hold ends — so a
 * 50 ms stop inside a 200 ms slow-mo neither shortens nor cancels it. Every target is restored to
 * the speed it had when the first hold began, and `cancel()` / `dispose()` always restore too.
 *
 * Drive it with *real* (unscaled) seconds from game.onUpdate; see bindTimeFreeze in screen.ts.
 */
export class TimeFreeze {
  private readonly remaining = new Float64Array(SLOTS);
  private readonly speed = new Float64Array(SLOTS);
  private readonly targets: TimeScaled[] = [];
  private readonly base: number[] = [];
  private applied = 1;
  private active = false;
  private sinceLast = Infinity;
  private readonly maxSeconds: number;
  private readonly cooldown: number;

  /** @param apply optional extra sink that receives the current speed factor on every change. */
  constructor(
    private readonly apply?: (factor: number) => void,
    opts: TimeFreezeOpts = {},
  ) {
    this.maxSeconds = opts.maxSeconds ?? 0.2;
    this.cooldown = opts.cooldown ?? 0.4;
  }

  /** Register a target; it is slowed from the next freeze on. */
  addTarget(t: TimeScaled): this {
    if (!this.targets.includes(t)) {
      this.targets.push(t);
      this.base.push(t.timeScale);
      if (this.active) this.write(this.applied);
    }
    return this;
  }

  removeTarget(t: TimeScaled): void {
    const i = this.targets.indexOf(t);
    if (i < 0) return;
    if (this.active) t.timeScale = this.base[i] as number;
    this.targets.splice(i, 1);
    this.base.splice(i, 1);
  }

  get isFrozen(): boolean {
    return this.active;
  }

  /** Current speed factor in (0..1]; 1 when idle. */
  get factor(): number {
    return this.applied;
  }

  /**
   * Hold gameplay at `speed` (0 = full stop) for `seconds`.
   * @returns false when refused by the cooldown or because the duration rounds to nothing.
   */
  freeze(seconds: number, speed = 0): boolean {
    let d = Math.min(seconds, this.maxSeconds);
    if (fxSettings.reducedMotion) {
      // Reduced motion keeps a crisp hit-stop but drops slow-motion entirely.
      if (speed > 0) return false;
      d = Math.min(d, REDUCED.hitStopMaxSeconds);
    }
    if (!(d > 0)) return false;
    if (this.sinceLast < this.cooldown) return false;
    let slot = -1;
    for (let i = 0; i < SLOTS; i++) {
      if ((this.remaining[i] as number) <= 0) {
        slot = i;
        break;
      }
    }
    if (slot < 0) {
      // All slots busy: replace the hold that ends soonest, it matters least.
      slot = 0;
      for (let i = 1; i < SLOTS; i++) if ((this.remaining[i] as number) < (this.remaining[slot] as number)) slot = i;
    }
    this.remaining[slot] = d;
    this.speed[slot] = speed < 0 ? 0 : speed > 1 ? 1 : speed;
    this.sinceLast = 0;
    if (!this.active) {
      this.active = true;
      for (let i = 0; i < this.targets.length; i++) this.base[i] = (this.targets[i] as TimeScaled).timeScale;
    }
    this.refresh();
    return true;
  }

  /** Advance by real seconds. */
  update(realDt: number): void {
    if (this.sinceLast < Infinity) this.sinceLast += realDt;
    if (!this.active) return;
    let any = false;
    for (let i = 0; i < SLOTS; i++) {
      const r = this.remaining[i] as number;
      if (r <= 0) continue;
      const left = r - realDt;
      this.remaining[i] = left > 0 ? left : 0;
      if (left > 0) any = true;
    }
    if (any) this.refresh();
    else this.end();
  }

  /** Drop every hold and restore targets now. */
  cancel(): void {
    this.remaining.fill(0);
    if (this.active) this.end();
  }

  private refresh(): void {
    let f = 1;
    for (let i = 0; i < SLOTS; i++) {
      if ((this.remaining[i] as number) > 0 && (this.speed[i] as number) < f) f = this.speed[i] as number;
    }
    if (f === this.applied) return;
    this.applied = f;
    this.write(f);
  }

  private end(): void {
    this.active = false;
    this.applied = 1;
    for (let i = 0; i < this.targets.length; i++) (this.targets[i] as TimeScaled).timeScale = this.base[i] as number;
    this.apply?.(1);
  }

  private write(factor: number): void {
    for (let i = 0; i < this.targets.length; i++) {
      (this.targets[i] as TimeScaled).timeScale = (this.base[i] as number) * factor;
    }
    this.apply?.(factor);
  }
}
