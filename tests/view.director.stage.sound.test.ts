import { beforeEach, describe, expect, it, vi } from 'vitest';

const played = vi.hoisted(() => ({ play: [] as Array<[string, Record<string, number> | undefined]>, step: [] as Array<[string, number, Record<string, number> | undefined]> }));

vi.mock('@/audio', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/audio')>()),
  audio: {
    play: (id: string, opts?: Record<string, number>) => played.play.push([id, opts]),
    playStep: (id: string, step: number, opts?: Record<string, number>) => played.step.push([id, step, opts]),
  },
}));

import { Stage } from '@/view/director/stage';
import type { BattleContext } from '@/view/context';

function stage(width = 720): Stage {
  return new Stage({ fx: {}, layout: { w: width } } as unknown as BattleContext);
}

beforeEach(() => {
  played.play.length = 0;
  played.step.length = 0;
});

describe('the director\'s sound for the skills', () => {
  it('places a sound at scene x on the stereo field: the middle is the middle, the edges are 0.6 to the side, and nothing goes past that', () => {
    const s = stage();
    expect(s.panOf(360)).toBe(0);
    expect(s.panOf(0)).toBe(-0.6);
    expect(s.panOf(720)).toBe(0.6);
    expect(s.panOf(-500)).toBe(-0.6);
    expect(s.panOf(5000)).toBe(0.6);
    expect(s.panOf(540)).toBe(0.3);
    expect(s.panOf(180)).toBe(-0.3);
    // a scene that is narrower puts its edge where its edge is
    expect(stage(600).panOf(600)).toBe(0.6);
    // a context with no layout (a test's stand-in) is the design width
    expect(new Stage({ fx: {} } as unknown as BattleContext).panOf(720)).toBe(0.6);
  });

  it('passes the pan and the delay on to the engine only when there is one, so that every other sound is asked for exactly as before', () => {
    const s = stage();
    s.play(s.rules.skill, 'sp_tiger_roar', 1, 1, 0);
    s.play(s.rules.skill, 'sp_cut_clash', 0.9, 1.1, 0, 0.4, 0.04);
    s.play(s.rules.skill, 'sp_seal_stamp', 0.9, 1, 0, 0, 0.09);
    expect(played.play[0]).toEqual(['sp_tiger_roar', { volume: 1, pitch: 1 }]);
    expect(played.play[1]).toEqual(['sp_cut_clash', { volume: 0.9, pitch: 1.1, pan: 0.4, delay: 0.04 }]);
    expect(played.play[2]).toEqual(['sp_seal_stamp', { volume: 0.9, pitch: 1, delay: 0.09 }]);
    s.playStep(s.rules.skillTick, 'sp_star_ping', 3, 0.8, 1, -0.3);
    s.now = 1;
    s.playStep(s.rules.skillTick, 'sp_note', 1, 0.8);
    expect(played.step[0]).toEqual(['sp_star_ping', 3, { volume: 0.8, pitch: 1, pan: -0.3 }]);
    expect(played.step[1]).toEqual(['sp_note', 1, { volume: 0.8, pitch: 1 }]);
  });

  it('holds a bunch of sounds back into a quick run: the first at once, each next at least a gap behind the one before, at most three gaps, and the queue empties by itself', () => {
    const s = stage();
    s.now = 5;
    expect(s.stagger('note', 0.05)).toBe(0);
    expect(s.stagger('note', 0.05)).toBeCloseTo(0.05, 9);
    expect(s.stagger('note', 0.05)).toBeCloseTo(0.1, 9);
    expect(s.stagger('note', 0.05)).toBeCloseTo(0.15, 9);
    // a bigger bunch than three gaps piles up at the end of the run
    expect(s.stagger('note', 0.05)).toBeCloseTo(0.15, 9);
    // a sound that comes while the queue is still running waits for its turn, not for a fresh start
    s.now = 5.06;
    expect(s.stagger('note', 0.05)).toBeCloseTo(0.14, 9);
    // after it has run out the next one is at once
    s.now = 6;
    expect(s.stagger('note', 0.05)).toBe(0);
    // kinds are told apart
    expect(s.stagger('hop', 0.06)).toBe(0);
    expect(s.stagger('hop', 0.06)).toBeCloseTo(0.06, 9);
    expect(s.stagger('note', 0.05)).toBeCloseTo(0.05, 9);
  });

  it('does not thin a skill\'s signature however busy the fight is, and counts what it played', () => {
    const s = stage();
    // a fight that has used up its shared pool of sounds
    for (let i = 0; i < 30; i++) {
      s.now = 1 + i * 0.01;
      s.play(s.rules.shoot, 'atk_w_paw');
    }
    const heard = played.play.length;
    expect(heard).toBeLessThan(30);
    s.now = 2;
    expect(s.play(s.rules.skill, 'sp_meteor_boom', 1, 1, 0)).toBe(true);
    expect(s.play(s.rules.skillTick, 'sp_stomp', 0.85, 1, 0)).toBe(true);
    expect(played.play.length).toBe(heard + 2);
    expect(s.played.sp_meteor_boom).toBe(1);
    expect(s.played.sp_stomp).toBe(1);
  });
});
