import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { uiTweens } from '@/core/tween';
import { motion } from '@/ui/motion';
import { Staged } from '@/ui/staged';

/** One frame of the shared UI clock. */
function frame(): void {
  uiTweens.update(1 / 60);
}

function stages(log: string[]): Array<() => void> {
  return ['a', 'b', 'c'].map((name) => () => void log.push(name));
}

beforeEach(() => {
  motion.reduced = false;
});

afterEach(() => {
  uiTweens.killAll();
  motion.reduced = false;
});

describe('Staged', () => {
  it('leaves the first frame to the caller, runs the first stage on the second and one more each frame after', () => {
    const log: string[] = [];
    const s = new Staged(stages(log));
    s.start();
    expect(log).toEqual([]);
    frame();
    expect(log).toEqual([]);
    frame();
    expect(log).toEqual(['a']);
    frame();
    expect(log).toEqual(['a', 'b']);
    expect(s.done).toBe(false);
    frame();
    expect(log).toEqual(['a', 'b', 'c']);
    expect(s.done).toBe(true);
    frame();
    frame();
    expect(log).toEqual(['a', 'b', 'c']);
  });

  it('builds everything at once without motion: there is no entrance to hide the later stages behind', () => {
    motion.reduced = true;
    const log: string[] = [];
    const s = new Staged(stages(log));
    s.start();
    expect(log).toEqual(['a', 'b', 'c']);
    expect(s.done).toBe(true);
  });

  it('finish() runs what is left, in order and once, and the frames after it add nothing', () => {
    const log: string[] = [];
    const s = new Staged(stages(log));
    s.start();
    frame();
    frame();
    s.finish();
    expect(log).toEqual(['a', 'b', 'c']);
    s.finish();
    frame();
    frame();
    expect(log).toEqual(['a', 'b', 'c']);
  });

  it('finish() before the first frame runs every stage', () => {
    const log: string[] = [];
    const s = new Staged(stages(log));
    s.start();
    s.finish();
    expect(log).toEqual(['a', 'b', 'c']);
  });

  it('destroy() drops the stages not yet run, and finish() after it does not bring them back', () => {
    const log: string[] = [];
    const s = new Staged(stages(log));
    s.start();
    frame();
    frame();
    s.destroy();
    s.finish();
    frame();
    frame();
    expect(log).toEqual(['a']);
    expect(s.done).toBe(true);
  });

  it('a screen with no stages is done at once', () => {
    const s = new Staged([]);
    s.start();
    expect(s.done).toBe(true);
    frame();
  });
});
