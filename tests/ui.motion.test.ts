import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { uiTweens } from '@/core/tween';
import { fadeTo, motion, popIn, TweenBag } from '@/ui/motion';

interface Thing {
  alpha: number;
  destroyed: boolean;
  scale: { x: number; y: number; set(x: number, y?: number): void };
}

function thing(): Thing {
  const t: Thing = {
    alpha: 1,
    destroyed: false,
    scale: {
      x: 1,
      y: 1,
      set(x: number, y = x) {
        t.scale.x = x;
        t.scale.y = y;
      },
    },
  };
  return t;
}

/** Run the shared UI clock for `seconds` in 1/60 s frames. */
function run(seconds: number): void {
  for (let n = Math.round(seconds * 60); n > 0; n--) uiTweens.update(1 / 60);
}

let bag: TweenBag;

beforeEach(() => {
  motion.reduced = false;
  bag = new TweenBag();
});

afterEach(() => {
  bag.killAll();
  uiTweens.killAll();
  motion.reduced = false;
});

describe('popIn', () => {
  it('hides the object at once and ends full size and opaque', () => {
    const t = thing();
    let done = 0;
    popIn(bag, t, { from: 0.3, duration: 0.3, delay: 0.1, onDone: () => done++ });
    expect([t.alpha, t.scale.x]).toEqual([0, 0.3]);
    run(0.1);
    uiTweens.update(0.004);
    expect(t.alpha).toBeGreaterThan(0);
    expect(t.alpha).toBeLessThan(1);
    run(0.4);
    expect([t.alpha, t.scale.x, t.scale.y, done]).toEqual([1, 1, 1, 1]);
  });

  it('killKeyed during the delay or mid-pop leaves it settled, without onDone', () => {
    for (const at of [0.05, 0.2]) {
      const t = thing();
      let done = 0;
      popIn(bag, t, { from: 0.3, duration: 0.3, delay: 0.1, onDone: () => done++ });
      run(at);
      bag.killKeyed(t);
      expect([t.alpha, t.scale.x, t.scale.y, done], `killed at ${at}`).toEqual([1, 1, 1, 0]);
      run(1);
      expect([t.alpha, t.scale.x]).toEqual([1, 1]);
    }
  });

  it('killAll (a screen torn down mid-pop) settles it as well', () => {
    const t = thing();
    popIn(bag, t, { duration: 0.4 });
    run(0.1);
    bag.killAll();
    expect([t.alpha, t.scale.x]).toEqual([1, 1]);
  });

  it('a plain runKeyed on the same object cuts it short at the end state', () => {
    const t = thing();
    popIn(bag, t, { from: 0.2, duration: 0.4 });
    run(0.1);
    bag.runKeyed(t, { duration: 0.1 });
    expect([t.alpha, t.scale.x]).toEqual([1, 1]);
  });

  it('a restart begins again from the start and still ends settled', () => {
    const t = thing();
    popIn(bag, t, { from: 0.3, duration: 0.3 });
    run(0.2);
    popIn(bag, t, { from: 0.3, duration: 0.3 });
    expect([t.alpha, t.scale.x]).toEqual([0, 0.3]);
    uiTweens.update(0.004);
    expect(t.alpha).toBeGreaterThan(0);
    expect(t.alpha).toBeLessThan(1);
    run(0.4);
    expect([t.alpha, t.scale.x]).toEqual([1, 1]);
  });

  it('a destroyed object ends the tween quietly', () => {
    const t = thing();
    popIn(bag, t, { duration: 0.3 });
    run(0.1);
    t.destroyed = true;
    t.alpha = 0.4;
    expect(() => run(0.5)).not.toThrow();
    expect(t.alpha).toBe(0.4);
    expect(uiTweens.count).toBe(0);
  });
});

describe('fadeTo', () => {
  it('fades from the current alpha and lands exactly on the target', () => {
    const t = thing();
    t.alpha = 0;
    let done = 0;
    fadeTo(bag, t, 1, { duration: 0.2, onDone: () => done++ });
    run(0.1);
    expect(t.alpha).toBeGreaterThan(0.3);
    expect(t.alpha).toBeLessThan(0.7);
    run(0.2);
    expect([t.alpha, done]).toEqual([1, 1]);
  });

  it('a fade the other way takes over from where the first one was', () => {
    const t = thing();
    t.alpha = 0;
    fadeTo(bag, t, 1, { duration: 0.4 });
    run(0.2);
    const mid = t.alpha;
    fadeTo(bag, t, 0, { duration: 0.4 });
    run(1 / 60);
    expect(Math.abs(t.alpha - mid)).toBeLessThan(0.1);
    run(0.5);
    expect(t.alpha).toBe(0);
  });

  it('killKeyed lands on the target, killAll too', () => {
    const t = thing();
    t.alpha = 0;
    fadeTo(bag, t, 1, { duration: 1 });
    run(0.2);
    bag.killKeyed(t);
    expect(t.alpha).toBe(1);
    t.alpha = 0.5;
    fadeTo(bag, t, 0, { duration: 1 });
    run(0.2);
    bag.killAll();
    expect(t.alpha).toBe(0);
  });

  it('with reduced motion the alpha is set on the call', () => {
    motion.reduced = true;
    const t = thing();
    let done = 0;
    fadeTo(bag, t, 0.25, { onDone: () => done++ });
    expect(t.alpha).toBe(0.25);
    run(0.1);
    expect(done).toBe(1);
  });
});
