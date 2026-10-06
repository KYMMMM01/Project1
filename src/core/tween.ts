export type EaseFn = (t: number) => number;

const c1 = 1.70158;
const c2 = c1 * 1.525;
const c3 = c1 + 1;
const c4 = (2 * Math.PI) / 3;

function bounceOut(t: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
}

export const Ease = {
  linear: (t: number) => t,
  quadIn: (t: number) => t * t,
  quadOut: (t: number) => 1 - (1 - t) * (1 - t),
  quadInOut: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  cubicIn: (t: number) => t * t * t,
  cubicOut: (t: number) => 1 - Math.pow(1 - t, 3),
  cubicInOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  quartOut: (t: number) => 1 - Math.pow(1 - t, 4),
  quintOut: (t: number) => 1 - Math.pow(1 - t, 5),
  expoIn: (t: number) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
  expoOut: (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  sineIn: (t: number) => 1 - Math.cos((t * Math.PI) / 2),
  sineOut: (t: number) => Math.sin((t * Math.PI) / 2),
  sineInOut: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  backIn: (t: number) => c3 * t * t * t - c1 * t * t,
  backOut: (t: number) => 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2),
  backInOut: (t: number) =>
    t < 0.5
      ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
      : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2,
  elasticOut: (t: number) =>
    t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1,
  bounceOut,
  /** 0 -> 1 -> 0 half-sine; handy for one-shot punches driven through onUpdate. */
  arc: (t: number) => Math.sin(t * Math.PI),
} satisfies Record<string, EaseFn>;

export interface TweenOpts {
  /** Seconds. */
  duration: number;
  ease?: EaseFn;
  /** Seconds to wait before the first frame of motion. */
  delay?: number;
  /** Extra plays after the first; -1 loops forever. */
  repeat?: number;
  /** With repeat, play every other pass in reverse. */
  yoyo?: boolean;
  onStart?: () => void;
  /** Receives eased progress in [0,1] (may overshoot for back/elastic). */
  onUpdate?: (k: number) => void;
  onComplete?: () => void;
}

type NumericProps = Record<string, number>;
type NumKeys<T> = { [K in keyof T]: T[K] extends number ? K : never }[keyof T];
/** Only the numeric fields of T, all optional — what a tween may animate. */
export type TweenProps<T> = Partial<Record<NumKeys<T>, number>>;

export class Tween {
  /** Resolves when the tween completes OR is killed, so an awaiting sequence can never hang. */
  readonly finished: Promise<void>;
  alive = true;

  private resolve!: () => void;
  private elapsed = 0;
  private started = false;
  private pass = 0;
  private keys: string[] = [];
  private from: number[] = [];
  private to: number[] = [];

  constructor(
    readonly target: object | null,
    private readonly props: NumericProps | null,
    private readonly opts: TweenOpts,
  ) {
    this.finished = new Promise<void>((res) => {
      this.resolve = res;
    });
    this.elapsed = -(opts.delay ?? 0);
  }

  private begin(): void {
    this.started = true;
    if (this.target && this.props) {
      const t = this.target as NumericProps;
      for (const k of Object.keys(this.props)) {
        this.keys.push(k);
        this.from.push(t[k] as number);
        this.to.push(this.props[k] as number);
      }
    }
    this.opts.onStart?.();
  }

  private apply(k: number): void {
    if (this.target) {
      const t = this.target as NumericProps;
      for (let i = 0; i < this.keys.length; i++) {
        const a = this.from[i] as number;
        t[this.keys[i] as string] = a + ((this.to[i] as number) - a) * k;
      }
    }
    this.opts.onUpdate?.(k);
  }

  /** @returns true while still running. */
  step(dt: number): boolean {
    if (!this.alive) return false;
    this.elapsed += dt;
    if (this.elapsed < 0) return true;
    if (!this.started) this.begin();

    const d = this.opts.duration;
    const ease = this.opts.ease ?? Ease.quadOut;
    const repeat = this.opts.repeat ?? 0;

    while (this.alive) {
      const raw = d <= 0 ? 1 : Math.min(1, this.elapsed / d);
      const reversed = !!this.opts.yoyo && this.pass % 2 === 1;
      this.apply(ease(reversed ? 1 - raw : raw));
      if (raw < 1) return true;
      if (repeat >= 0 && this.pass >= repeat) {
        this.alive = false;
        this.opts.onComplete?.();
        this.resolve();
        return false;
      }
      this.pass++;
      this.elapsed -= d;
      if (d <= 0) return true; // zero-length loop: advance one pass per frame instead of spinning
    }
    return false;
  }

  /** Stop now. `complete` jumps to the end values and fires onComplete first. */
  kill(complete = false): void {
    if (!this.alive) return;
    if (complete) {
      if (!this.started) this.begin();
      this.apply((this.opts.ease ?? Ease.quadOut)(1));
      this.opts.onComplete?.();
    }
    this.alive = false;
    this.resolve();
  }
}

/**
 * A clock that owns a set of tweens. Each Scene has its own so that pausing, hit-stop or speed-up of
 * the battle never touches UI animation, and leaving a scene kills everything it started.
 */
export class Tweener {
  timeScale = 1;
  paused = false;
  private list: Tween[] = [];
  private adding: Tween[] = [];

  get count(): number {
    return this.list.length + this.adding.length;
  }

  to<T extends object>(target: T, props: TweenProps<T>, opts: TweenOpts): Tween {
    return this.add(new Tween(target, props as NumericProps, opts));
  }

  /** Start at `props` and animate back to the current values. */
  from<T extends object>(target: T, props: TweenProps<T>, opts: TweenOpts): Tween {
    // Snap to the start values immediately so the object does not flash at its end state during a delay.
    const t = target as unknown as NumericProps;
    const p = props as NumericProps;
    const restore: NumericProps = {};
    for (const k of Object.keys(p)) {
      restore[k] = t[k] as number;
      t[k] = p[k] as number;
    }
    return this.add(new Tween(target, restore, opts));
  }

  /** A property-less tween: drive anything from onUpdate(k). */
  run(opts: TweenOpts): Tween {
    return this.add(new Tween(null, null, opts));
  }

  /** Promise that resolves after `seconds` on this clock. */
  wait(seconds: number): Promise<void> {
    return this.run({ duration: seconds, ease: Ease.linear }).finished;
  }

  /** Call `fn` after `seconds` on this clock. */
  call(seconds: number, fn: () => void): Tween {
    return this.run({ duration: 0, delay: seconds, onComplete: fn });
  }

  killOf(target: object, complete = false): void {
    for (const tw of this.list) if (tw.target === target) tw.kill(complete);
    for (const tw of this.adding) if (tw.target === target) tw.kill(complete);
  }

  killAll(): void {
    for (const tw of this.list) tw.kill();
    for (const tw of this.adding) tw.kill();
    this.list.length = 0;
    this.adding.length = 0;
  }

  update(dt: number): void {
    if (this.paused) return;
    const step = dt * this.timeScale;
    if (this.adding.length) {
      for (const tw of this.adding) this.list.push(tw);
      this.adding.length = 0;
    }
    let w = 0;
    let i = 0;
    try {
      for (; i < this.list.length; i++) {
        const tw = this.list[i] as Tween;
        if (tw.step(step)) this.list[w++] = tw;
      }
    } finally {
      // A callback that throws drops only its own tween; the ones behind it stay queued for the next frame.
      for (i++; i < this.list.length; i++) this.list[w++] = this.list[i] as Tween;
      this.list.length = w;
    }
  }

  private add(tw: Tween): Tween {
    // Tweens created during update() join on the next frame; keeps iteration stable.
    this.adding.push(tw);
    return tw;
  }
}

/** Global, never-paused clock for UI shell animation (buttons, popups, toasts). */
export const uiTweens = new Tweener();
