import { REDUCED, fxSettings } from './settings';

/** Anything with a mutable clock speed: a Tweener, a battle simulation wrapper, an audio rate... */
export interface TimeScaled {
  timeScale: number;
}

export interface TimeFreezeOpts {
  /** Longest full stop (speed 0) in seconds; the guide's hard cap for global hit-stop. */
  maxSeconds?: number;
  /** Longest slow-motion hold (speed > 0) in seconds; the guide's hard cap is longer than a stop. */
  maxSlowSeconds?: number;
  /** Seconds of normal speed required between the end of one freeze event and the start of the next. */
  cooldown?: number;
}

const SLOTS = 8;

/**
 * Hit-stop / slow-motion for gameplay only. Targets (typically the battle scene's Tweener and
 * simulation) are slowed while UI, particles and audio keep their own clocks.
 *
 * A freeze *event* starts when the game is at normal speed and lasts until its last hold ends. Only
 * starting an event is rationed by the cooldown; a hold requested while an event is running joins
 * it, so "hit-stop then slow-mo" can be asked for in two calls. To keep joins from chaining into a
 * permanent freeze, an event may never outlast one full stop plus one slow-motion (0.6 s by default).
 *
 * Each hold has its own remaining time and speed, the effective speed is the slowest active one, and
 * the event ends when the longest hold ends. Every target is restored to the speed it had when the
 * event began, and `cancel()` always restores too.
 *
 * Drive it with *real* (unscaled) seconds from game.onUpdate; see createHitStop in screen.ts.
 */
export class TimeFreeze {
  private readonly remaining = new Float64Array(SLOTS);
  private readonly speed = new Float64Array(SLOTS);
  private readonly targets: TimeScaled[] = [];
  private readonly base: number[] = [];
  private applied = 1;
  private active = false;
  private eventAge = 0;
  private sinceEnd = Infinity;
  private readonly maxStop: number;
  private readonly maxSlow: number;
  private readonly cooldown: number;

  /** @param apply optional extra sink that receives the current speed factor on every change. */
  constructor(
    private readonly apply?: (factor: number) => void,
    opts: TimeFreezeOpts = {},
  ) {
    this.maxStop = opts.maxSeconds ?? 0.2;
    this.maxSlow = opts.maxSlowSeconds ?? 0.4;
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

  /** Current speed factor in [0..1]; 1 when idle. */
  get factor(): number {
    return this.applied;
  }

  /**
   * Hold gameplay at `speed` (0 = full stop) for `seconds`, capped at maxSeconds for a stop and at
   * maxSlowSeconds for slow-motion.
   * @returns false when refused: cooling down, no room left in the running event, or the duration
   *   rounds to nothing (slow-motion is dropped entirely under reduced motion).
   */
  freeze(seconds: number, speed = 0): boolean {
    const sp = speed < 0 ? 0 : speed > 1 ? 1 : speed;
    let d = Math.min(seconds, sp === 0 ? this.maxStop : this.maxSlow);
    if (fxSettings.reducedMotion) {
      // Reduced motion keeps a crisp hit-stop but drops slow-motion entirely.
      if (sp > 0) return false;
      d = Math.min(d, REDUCED.hitStopMaxSeconds);
    }
    d = Math.min(d, this.room());
    if (!(d > 0)) return false;
    this.begin();
    this.hold(d, sp);
    this.refresh();
    return true;
  }

  /**
   * A full stop immediately followed by slow-motion as one event (the guide's H5: mythic creation,
   * boss death). The slow-motion lasts `slowSeconds` *after* the stop ends.
   */
  freezeThenSlow(stopSeconds: number, slowSeconds: number, slowSpeed = 0.3): boolean {
    const sp = slowSpeed < 0 ? 0 : slowSpeed > 1 ? 1 : slowSpeed;
    let stop = Math.max(0, Math.min(stopSeconds, this.maxStop));
    let slow = Math.max(0, Math.min(slowSeconds, this.maxSlow));
    if (fxSettings.reducedMotion) {
      slow = 0;
      stop = Math.min(stop, REDUCED.hitStopMaxSeconds);
    }
    const total = Math.min(stop + slow, this.room());
    if (!(total > 0)) return false;
    stop = Math.min(stop, total);
    slow = total - stop;
    this.begin();
    if (stop > 0) this.hold(stop, 0);
    if (slow > 0) this.hold(stop + slow, sp);
    this.refresh();
    return true;
  }

  /** Advance by real seconds. */
  update(realDt: number): void {
    if (!this.active) {
      if (this.sinceEnd < Infinity) this.sinceEnd += realDt;
      return;
    }
    this.eventAge += realDt;
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

  /** Drop every hold and restore targets now. Not counted as an event: no cooldown follows. */
  cancel(): void {
    this.remaining.fill(0);
    if (this.active) this.end();
    this.sinceEnd = Infinity;
  }

  /** Seconds a new hold may still last: the rest of the running event, or a whole one when allowed. */
  private room(): number {
    const horizon = this.maxStop + this.maxSlow;
    if (this.active) return horizon - this.eventAge;
    return this.sinceEnd < this.cooldown ? 0 : horizon;
  }

  private begin(): void {
    if (this.active) return;
    this.active = true;
    this.eventAge = 0;
    for (let i = 0; i < this.targets.length; i++) this.base[i] = (this.targets[i] as TimeScaled).timeScale;
  }

  private hold(d: number, speed: number): void {
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
    this.speed[slot] = speed;
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
    this.sinceEnd = 0;
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
