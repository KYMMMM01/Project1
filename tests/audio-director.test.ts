import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MusicService } from '@/view/director/music';
import type { Stage } from '@/view/director/stage';

const calls = vi.hoisted(() => ({ music: [] as Array<[string, number | undefined]>, intensity: [] as number[], duck: [] as Array<[number, number]> }));
vi.mock('@/audio', async (orig) => {
  const real = await orig<typeof import('@/audio')>();
  return {
    ...real,
    audio: {
      music: (id: string, fade?: number) => calls.music.push([id, fade]),
      setIntensity: (v: number) => calls.intensity.push(v),
      duck: (depth: number, seconds: number) => calls.duck.push([depth, seconds]),
    },
  };
});

interface FakeBattle {
  init: { chapter: number; mode: string };
  wave: number;
  boss: object | null;
  enemyCount: number;
  enemyCap: number;
  totalWaves: number;
}

function setup(chapter: number, mode: string): { service: MusicService; battle: FakeBattle; frame: (dt: number) => void } {
  const battle: FakeBattle = { init: { chapter, mode }, wave: 1, boss: null, enemyCount: 4, enemyCap: 40, totalWaves: 24 };
  const frames: Array<(dt: number) => void> = [];
  const stage = { ctx: { battle }, addFrame: (cb: (dt: number) => void) => frames.push(cb) } as unknown as Stage;
  const service = new MusicService(stage);
  return { service, battle, frame: (dt) => frames.forEach((f) => f(dt)) };
}

const last = (): [string, number | undefined] => calls.music[calls.music.length - 1] as [string, number | undefined];

beforeEach(() => {
  calls.music.length = 0;
  calls.intensity.length = 0;
  calls.duck.length = 0;
});

describe('MusicService picks the track', () => {
  it('starts the music of the chapter it is in', () => {
    const expected = ['battle', 'kitchen', 'bath', 'garden', 'clinic'];
    expected.forEach((track, i) => {
      const { service } = setup(i + 1, 'chapter');
      service.start();
      expect(last()).toEqual([track, 1.2]);
    });
  });

  it('plays the gold dungeon track in the gold dungeon and the chapter music in the other modes', () => {
    setup(3, 'gold').service.start();
    expect(last()[0]).toBe('gold');
    for (const mode of ['endless', 'daily', 'tutorial']) {
      setup(2, mode).service.start();
      expect(last()[0], mode).toBe('kitchen');
    }
  });

  it('swaps to the boss track when a boss wave begins and back to the chapter track when the boss is gone', () => {
    const { service } = setup(4, 'chapter');
    service.start();
    service.setBoss(true);
    expect(last()).toEqual(['boss', 0.5]);
    service.setBoss(false);
    expect(last()).toEqual(['garden', 1.5]);
    // Said twice, played once.
    const n = calls.music.length;
    service.setBoss(false);
    expect(calls.music).toHaveLength(n);
  });

  it('plays the tension track from the warning of an elite wave until its elite falls', () => {
    const { service, battle, frame } = setup(2, 'chapter');
    service.start();
    battle.wave = 4;
    service.setElite(true);
    expect(last()).toEqual(['elite', 0.6]);
    // The wave is on, the elite has not arrived yet: the tension stays.
    frame(0.5);
    expect(last()[0]).toBe('elite');
    // The elite arrives, and is beaten.
    battle.boss = {};
    frame(0.5);
    expect(last()[0]).toBe('elite');
    battle.boss = null;
    frame(0.1);
    expect(last()).toEqual(['kitchen', 1.5]);
  });

  it('drops the tension when the wave moves on without the elite being beaten', () => {
    const { service, battle, frame } = setup(5, 'chapter');
    service.start();
    battle.wave = 4;
    service.setElite(true);
    frame(1);
    battle.wave = 5;
    frame(1);
    expect(last()).toEqual(['clinic', 1.5]);
  });

  it('lets the boss win over the elite, and gives the elite back when the boss goes', () => {
    const { service, battle } = setup(1, 'chapter');
    service.start();
    battle.wave = 4;
    service.setElite(true);
    service.setBoss(true);
    expect(last()[0]).toBe('boss');
    service.setBoss(false);
    expect(last()[0]).toBe('elite');
  });

  it('is silent at the end of a run and comes back to the right track after a revive', () => {
    const { service, battle } = setup(3, 'chapter');
    service.start();
    battle.wave = 4;
    service.setElite(true);
    service.silence(0.5);
    expect(last()).toEqual(['none', 0.5]);
    service.resume();
    expect(last()).toEqual(['elite', 0.6]);
  });
});

describe('MusicService intensity and ducks', () => {
  it('pushes the intensity of the crowd to the audio engine, rarely, and nothing while silent', () => {
    const { service, battle, frame } = setup(1, 'chapter');
    service.start();
    frame(0.05);
    battle.enemyCount = 36;
    for (let i = 0; i < 40; i++) frame(0.1);
    expect(calls.intensity.length).toBeGreaterThan(0);
    expect(calls.intensity.length).toBeLessThan(45);
    expect(calls.intensity[calls.intensity.length - 1]).toBeGreaterThan(calls.intensity[0] as number);
    service.silence(0.2);
    const n = calls.intensity.length;
    frame(1);
    expect(calls.intensity).toHaveLength(n);
  });

  it('passes ducks through and ignores empty ones', () => {
    const { service } = setup(1, 'chapter');
    service.duck(0.5, 1);
    service.duck(0, 1);
    service.duck(0.5, 0);
    expect(calls.duck).toEqual([[0.5, 1]]);
  });
});
