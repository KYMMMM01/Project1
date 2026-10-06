import { Ease, Tween, uiTweens, type EaseFn, type TweenOpts, type TweenProps } from '@/core/tween';

/** Global motion preferences. Components consult these instead of reading the media query themselves. */
export const motion = {
  /** Loops, big pops and shine sweeps are skipped when true (OS "reduce motion" or a settings toggle). */
  reduced: false,
};

if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  motion.reduced = mq.matches;
  mq.addEventListener('change', (e) => {
    motion.reduced = e.matches;
  });
}

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
    this.keyed.get(key)?.kill();
    const tw = this.run(opts);
    this.keyed.set(key, tw);
    return tw;
  }

  /** Stop the keyed tween for `key`, leaving the object where it is. */
  killKeyed(key: object): void {
    this.keyed.get(key)?.kill();
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
    for (const tw of this.list) tw.kill();
    this.list.length = 0;
    for (const tw of this.keyed.values()) tw.kill();
    this.keyed.clear();
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

/** Pop an object in: scale `from` -> 1 with an overshoot, and fade it in if it has alpha. */
export function popIn(
  bag: TweenBag,
  obj: Scalable & { alpha: number },
  opts: { from?: number; duration?: number; delay?: number; overshoot?: number; onDone?: () => void } = {},
): Tween {
  const from = opts.from ?? 0;
  obj.scale.set(from);
  obj.alpha = 0;
  return bag.run({
    duration: opts.duration ?? 0.22,
    delay: opts.delay ?? 0,
    ease: backOut(opts.overshoot ?? 2.0),
    onUpdate: (k) => {
      const s = from + (1 - from) * k;
      obj.scale.set(s);
      obj.alpha = Math.min(1, k * 4);
    },
    onComplete: () => {
      obj.scale.set(1);
      obj.alpha = 1;
      opts.onDone?.();
    },
  });
}

/** Quick scale punch 1 -> 1+amount -> 1 (counter changes, badge updates). */
export function punch(bag: TweenBag, obj: Scalable, amount = 0.2, duration = 0.18, base = 1): Tween {
  return bag.runKeyed(obj.scale, {
    duration,
    ease: Ease.linear,
    onUpdate: (k) => {
      // Fast attack, springy settle.
      const e = k < 0.35 ? Ease.quadOut(k / 0.35) : 1 - Ease.sineInOut((k - 0.35) / 0.65);
      obj.scale.set(base * (1 + amount * e));
    },
    onComplete: () => obj.scale.set(base),
  });
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
