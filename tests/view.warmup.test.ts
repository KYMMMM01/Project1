import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Texture } from 'pixi.js';

const KEYS = ['enemy_cucumber', 'enemy_clock', 'enemy_pill', 'boss_vacuum', 'unit_w_paw', 'relic_lucky_coin', 'icon_chest_wood', 'icon_hand', 'icon_fish', 'bg_kitchen'];

vi.mock('@/core/assets', () => ({
  imageKeys: () => KEYS,
  hasTex: (k: string) => KEYS.includes(k),
  tex: () => Texture.EMPTY,
  putTex: () => undefined,
}));
vi.mock('@/fx/textures', () => ({
  ensureFxTextures: () => undefined,
  fxTex: () => ({ texture: Texture.WHITE, w: 64, h: 64, ax: 0.5, ay: 0.5 }),
  fxTexture: () => Texture.WHITE,
  fxVignette: () => Texture.WHITE,
}));
vi.mock('@/fx/areaArt', () => ({ bakeArea: () => new Texture() }));
const warmParticles = vi.fn();
vi.mock('@/fx/particles', async (orig) => ({ ...(await orig<typeof import('@/fx/particles')>()), warmParticles: () => warmParticles() }));

import { areaBaked, warm } from '@/fx';
import type { BattleApi, WavePreviewEntry } from '@/game';
import { BattleWarmup } from '@/view/warmup';

interface FakeBattle {
  wave: number;
  phase: string;
  previewWave: (w?: number) => WavePreviewEntry[];
}

function fake(lists: Record<number, WavePreviewEntry[]>): { b: FakeBattle; asked: number[] } {
  const asked: number[] = [];
  const b: FakeBattle = {
    wave: 0,
    phase: 'prep',
    previewWave: (w = 0) => {
      asked.push(w);
      return lists[w] ?? [];
    },
  };
  return { b, asked };
}

/** Frames until nothing is left to warm. */
function drain(max = 400): number {
  let frames = 0;
  while (warm.pending > 0 && frames < max) {
    warm.update(1 / 60);
    frames++;
  }
  return frames;
}

describe('the battle warm-up', () => {
  beforeEach(() => {
    warm.reset();
    warm.now = () => performance.now();
    warmParticles.mockClear();
  });

  it('links the particle shader first, before any picture', () => {
    const { b } = fake({});
    new BattleWarmup(b as unknown as BattleApi);
    warm.update(1 / 60);
    expect(warmParticles).toHaveBeenCalledTimes(1);
    expect(warm.has('pipe:particles')).toBe(true);
  });

  it('keeps the cats, toys, chests, paw and every kind of enemy ready, but not the backgrounds or the currency icons', () => {
    const { b } = fake({});
    new BattleWarmup(b as unknown as BattleApi);
    drain();
    for (const key of ['enemy_cucumber', 'enemy_clock', 'enemy_pill', 'boss_vacuum', 'unit_w_paw', 'relic_lucky_coin', 'icon_chest_wood', 'icon_hand']) {
      expect(warm.has(`img:${key}`)).toBe(true);
    }
    expect(warm.has('img:bg_kitchen')).toBe(false);
    expect(warm.has('img:icon_fish')).toBe(false);
  });

  it('bakes every ground area, a piece a frame', () => {
    const { b } = fake({});
    new BattleWarmup(b as unknown as BattleApi);
    const frames = drain();
    for (const kind of ['frost', 'brew', 'void', 'haste', 'heal'] as const) expect(areaBaked(kind)).toBe(true);
    expect(frames).toBeGreaterThan(5);
  });

  it('does the shader first, then the coming wave, then the one after it, then what may be needed some time', () => {
    const { b, asked } = fake({
      1: [{ enemy: 'clock', count: 3 }],
      2: [{ enemy: 'pill', count: 2 }],
    });
    const w = new BattleWarmup(b as unknown as BattleApi);
    w.update();
    expect(asked).toEqual([1, 2]);
    // Every piece "takes" 5 ms, so a pass runs exactly one and the key read before it is the order the queue works in.
    let t = 0;
    warm.now = () => (t += 5);
    const order: string[] = [];
    for (let guard = 0; warm.next !== null && guard < 500; guard++) {
      order.push(warm.next);
      warm.update(1 / 60);
    }
    const at = (key: string): number => order.indexOf(key);
    expect(at('pipe:particles')).toBe(0);
    expect(at('img:enemy_clock')).toBeLessThan(at('img:enemy_pill'));
    expect(at('area:haste:0')).toBeLessThan(at('area:heal:0'));
    expect(at('img:enemy_pill')).toBeLessThan(at('img:unit_w_paw'));
    expect(at('area:heal:3')).toBeLessThan(at('area:frost:0'));
  });

  it('looks at the preview again only when the wave or the phase has moved', () => {
    const { b, asked } = fake({ 2: [{ enemy: 'clock', count: 1 }], 3: [] });
    const w = new BattleWarmup(b as unknown as BattleApi);
    w.update();
    w.update();
    expect(asked).toEqual([1, 2]);
    b.wave = 1;
    w.update();
    expect(asked).toEqual([1, 2, 2, 3]);
    b.phase = 'choice';
    w.update();
    expect(asked).toEqual([1, 2, 2, 3, 2, 3]);
  });

  it('asks nothing of a finished run, and forgets what is waiting when the battle goes', () => {
    const { b, asked } = fake({});
    const w = new BattleWarmup(b as unknown as BattleApi);
    b.phase = 'won';
    w.update();
    expect(asked).toEqual([]);
    w.destroy();
    expect(warm.pending).toBe(0);
  });
});
