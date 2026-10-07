import { Ease, Tween, uiTweens, type EaseFn, type TweenOpts, type TweenProps } from '@/core/tween';

/** Global motion preferences. Components consult these instead of reading the media query themselves. */
export const motion = {
  /**
   * Loops, big pops and shine sweeps are skipped when true. Only the player's own "reduce motion"
   * setting turns it on: the OS flag is not followed, because many desktop players switch system
   * animations off for speed and a game without its motion reads as broken.
   */
  reduced: false,
};

const backCache = new Map<number, EaseFn>();

/** easeOutBack with a custom overshoot constant (1.70158 = 10%, 2.0 = 13%, 2.5 = 19%, 3.0 = 25%). */
export function backOut(s: number): EaseFn {
  let fn = backCache.get(s);
  if (!fn) {
    fn = (t: number) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
    backCache.set(s, fn);
  }
  return fn;
}

/**
 * A component's private view of the shared UI clock: every tween it starts is remembered so destroy()
 * can kill them all. Without this a tween would keep poking a destroyed display object.
 */
export class TweenBag {
  private list: Tween[] = [];
  private keyed = new Map<object, Tween>();
  /** End-state painters of the running settled tweens, see runSettled(). */
  private settlers = new Map<Tween, () => void>();

  to<T extends object>(target: T, props: TweenProps<T>, opts: TweenOpts): Tween {
    return this.track(uiTweens.to(target, props, opts));
  }

  from<T extends object>(target: T, props: TweenProps<T>, opts: TweenOpts): Tween {
    return this.track(uiTweens.from(target, props, opts));
  }

  run(opts: TweenOpts): Tween {
    return this.track(uiTweens.run(opts));
  }

  /** Property-less tween that replaces any earlier one started for the same `key`. */
  runKeyed(key: object, opts: TweenOpts): Tween {
    this.stop(this.keyed.get(key));
    const tw = this.run(opts);
    this.keyed.set(key, tw);
    return tw;
  }

  /**
   * A keyed tween that never leaves its object half-way: `settle` paints the end state when the tween
   * is cut short by killKeyed(), killAll() or a plain runKeyed() on the same key. Starting another
   * runSettled() on the key is a restart instead: the old run just stops and the new one carries on
   * from wherever the object is. `settle` must be safe to call on a destroyed object.
   */
  runSettled(key: object, opts: TweenOpts, settle: () => void): Tween {
    const old = this.keyed.get(key);
    if (old) this.settlers.delete(old);
    const tw = this.runKeyed(key, {
      ...opts,
      onComplete: () => {
        this.settlers.delete(tw);
        opts.onComplete?.();
      },
    });
    this.settlers.set(tw, settle);
    return tw;
  }

  /** Stop the keyed tween for `key`; a settled one is left at its end state, any other where it is. */
  killKeyed(key: object): void {
    this.stop(this.keyed.get(key));
    this.keyed.delete(key);
  }

  call(seconds: number, fn: () => void): Tween {
    return this.track(uiTweens.call(seconds, fn));
  }

  wait(seconds: number): Promise<void> {
    return this.run({ duration: seconds, ease: Ease.linear }).finished;
  }

  /** Kill tweens in this bag that animate `target`. */
  killOf(target: object, complete = false): void {
    for (const tw of this.list) if (tw.target === target) tw.kill(complete);
  }

  killAll(): void {
    for (const tw of this.list) this.stop(tw);
    this.list.length = 0;
    for (const tw of this.keyed.values()) this.stop(tw);
    this.keyed.clear();
  }

  private stop(tw: Tween | undefined): void {
    if (!tw) return;
    tw.kill();
    const settle = this.settlers.get(tw);
    if (!settle) return;
    this.settlers.delete(tw);
    settle();
  }

  private track(tw: Tween): Tween {
    this.list.push(tw);
    if (this.list.length > 12) {
      let w = 0;
      for (const t of this.list) if (t.alive) this.list[w++] = t;
      this.list.length = w;
    }
    return tw;
  }
}

interface Scalable {
  scale: { x: number; y: number; set(x: number, y?: number): void };
}

/** A display object destroyed mid-tween (its owner forgot the tween) must end the tween, not throw every frame. */
function isGone(obj: object): boolean {
  return (obj as { destroyed?: boolean }).destroyed === true;
}

/**
 * Pop an object in: scale `from` -> 1 with an overshoot, and fade it in if it has alpha. Keyed on the
 * object: calling it again restarts the pop, and killKeyed(obj) / killAll() / a plain runKeyed(obj)
 * leave the object full size and opaque instead of stranded half-way (or invisible, during `delay`).
 * `onDone` runs after a complete pop only.
 */
export function popIn(
  bag: TweenBag,
  obj: Scalable & { alpha: number },
  opts: { from?: number; duration?: number; delay?: number; overshoot?: number; onDone?: () => void } = {},
): Tween {
  const from = opts.from ?? 0;
  obj.scale.set(from);
  obj.alpha = 0;
  const settle = (): void => {
    if (isGone(obj)) return;
    obj.scale.set(1);
    obj.alpha = 1;
  };
  const tw = bag.runSettled(
    obj,
    {
      duration: opts.duration ?? 0.22,
      delay: opts.delay ?? 0,
      ease: backOut(opts.overshoot ?? 2.0),
      onUpdate: (k) => {
        if (isGone(obj)) return void tw.kill();
        const s = from + (1 - from) * k;
        obj.scale.set(s);
        obj.alpha = Math.min(1, k * 4);
      },
      onComplete: () => {
        if (isGone(obj)) return;
        settle();
        opts.onDone?.();
      },
    },
    settle,
  );
  return tw;
}

/**
 * Fade an object to `alpha` from wherever it is now. Keyed on the object like popIn: a fade the other
 * way round simply takes over from the current alpha, and a kill through the bag lands on `alpha`.
 * With reduced motion the alpha is set at once. `onDone` runs after a complete fade only.
 */
export function fadeTo(
  bag: TweenBag,
  obj: { alpha: number },
  alpha: number,
  opts: { duration?: number; delay?: number; ease?: EaseFn; onDone?: () => void } = {},
): Tween {
  const settle = (): void => {
    if (!isGone(obj)) obj.alpha = alpha;
  };
  if (motion.reduced) {
    bag.killKeyed(obj);
    settle();
    return bag.run({ duration: 0, onComplete: opts.onDone });
  }
  const from = obj.alpha;
  const tw = bag.runSettled(
    obj,
    {
      duration: opts.duration ?? 0.2,
      delay: opts.delay ?? 0,
      ease: opts.ease ?? Ease.linear,
      onUpdate: (k) => {
        if (isGone(obj)) return void tw.kill();
        obj.alpha = from + (alpha - from) * k;
      },
      onComplete: () => {
        settle();
        if (!isGone(obj)) opts.onDone?.();
      },
    },
    settle,
  );
  return tw;
}

/** Quick scale punch 1 -> 1+amount -> 1 (counter changes, badge updates). */
export function punch(bag: TweenBag, obj: Scalable, amount = 0.2, duration = 0.18, base = 1): Tween {
  const tw = bag.runKeyed(obj.scale, {
    duration,
    ease: Ease.linear,
    onUpdate: (k) => {
      if (isGone(obj)) return void tw.kill();
      // Fast attack, springy settle.
      const e = k < 0.35 ? Ease.quadOut(k / 0.35) : 1 - Ease.sineInOut((k - 0.35) / 0.65);
      obj.scale.set(base * (1 + amount * e));
    },
    onComplete: () => {
      if (!isGone(obj)) obj.scale.set(base);
    },
  });
  return tw;
}

/** Decaying horizontal shake around `baseX` (disabled-button tap, "not enough currency"). */
export function shakeX(
  bag: TweenBag,
  obj: { x: number },
  baseX: number,
  amplitude = 6,
  cycles = 3,
  duration = 0.18,
): Tween {
  return bag.runKeyed(obj, {
    duration,
    ease: Ease.linear,
    onUpdate: (k) => {
      obj.x = baseX + Math.sin(k * Math.PI * 2 * cycles) * amplitude * (1 - k);
    },
    onComplete: () => {
      obj.x = baseX;
    },
  });
}
