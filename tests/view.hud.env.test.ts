import { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import type { GuideProgress } from '@/guide';
import { EnvImpl } from '@/view/hud/env';
import type { Hints } from '@/view/hud/hints';
import type { LaserTeach } from '@/view/hud/laserTeach';
import { revealFlags } from '@/view/hud/policy';

function env(opts: { mode?: string; taught?: string[]; skipped?: boolean } = {}): EnvImpl {
  const taught = new Set(opts.taught ?? []);
  const progress = { isTaught: (id: string) => taught.has(id), skipped: opts.skipped ?? false } as unknown as GuideProgress;
  const ctx = { battle: { init: { mode: opts.mode ?? 'tutorial' } }, run: { sandbox: false } };
  return new EnvImpl(ctx as never, revealFlags(true), progress, {} as Hints, new Container(), {} as LaserTeach);
}

describe('what a popup may say about the lesson it carries (EnvImpl.lessonOn)', () => {
  it('is on while the tutorial has not taught the topic and has not skipped', () => {
    expect(env().lessonOn('toys')).toBe(true);
    expect(env({ taught: ['toys'] }).lessonOn('toys')).toBe(false);
    expect(env({ skipped: true }).lessonOn('toys')).toBe(false);
    expect(env({ mode: 'chapter' }).lessonOn('toys')).toBe(false);
  });

  it('is off for a lesson the tutorial has given up on, so its popup and its card are no longer waiting for a lesson that will not come', () => {
    const e = env();
    const left = new Set(['pick3', 'toys']);
    e.lessonLeft = (topic) => left.has(topic);
    expect(e.lessonOn('toys')).toBe(true);
    left.delete('toys');
    expect(e.lessonOn('toys')).toBe(false);
    expect(e.lessonOn('pick3')).toBe(true);
  });

  it('knows when the player has the pause menu open', () => {
    const e = env();
    expect(e.userPause).toBe(false);
    let open = false;
    e.userPaused = () => open;
    expect(e.userPause).toBe(false);
    open = true;
    expect(e.userPause).toBe(true);
    e.dispose();
    expect(e.userPause).toBe(false);
  });
});
