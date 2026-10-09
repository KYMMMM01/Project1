import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, Sprite, Texture } from 'pixi.js';

vi.mock('@/fx/textures', () => ({
  ensureFxTextures: () => undefined,
  fxTex: () => ({ texture: Texture.WHITE, w: 64, h: 64, ax: 0.5, ay: 0.5 }),
  fxTexture: () => Texture.WHITE,
  fxVignette: () => Texture.WHITE,
}));

import { SPECIAL_CELL_IDS } from '@/game/api';
import { CELL_LOOKS, EMBLEM, specialCell } from '@/fx/cells';
import type { FxEnv, Loop } from '@/fx/loops';
import { makeSpritePool } from '@/fx/rays';
import { setFxSettings } from '@/fx/settings';
import type { EmitDef, EmitterHandle } from '@/fx/particles';

const rect = { x: 100, y: 200, w: 100, h: 88 };
const DT = 1 / 60;

function makeEnv(): { env: FxEnv; ground: Container; emitters: Array<{ alive: boolean; def: EmitDef; rate: number }> } {
  const ground = new Container();
  const emitters: Array<{ alive: boolean; def: EmitDef; rate: number }> = [];
  const env: FxEnv = {
    ps: {
      emit: (def: EmitDef, _x: number, _y: number, rate: number) => {
        const e = { alive: true, def, rate, stop: () => void (e.alive = false) };
        emitters.push(e);
        return e as unknown as EmitterHandle;
      },
      alloc: () => null,
    } as unknown as FxEnv['ps'],
    ground,
    sprites: makeSpritePool(),
    run: () => {
      throw new Error('cells must not need the tweener');
    },
    burst: () => undefined,
    add: () => undefined,
  };
  return { env, ground, emitters };
}

function run(loop: Loop, seconds: number): void {
  for (let t = 0; t < seconds - 1e-9; t += DT) loop.update(DT);
}

beforeEach(() => {
  setFxSettings({ reducedMotion: false, tier: 'mid', quality: 1 });
});

describe('a special cell on the board', () => {
  it('draws the tile, a halo, a glint, a ring and the emblem for every kind, and removes them all when it ends', () => {
    for (const id of SPECIAL_CELL_IDS) {
      const { env, ground } = makeEnv();
      const h = specialCell(env, rect, id) as Loop;
      expect(ground.children.length).toBe(1);
      const parts = h.container.children;
      expect(parts.filter((c) => c instanceof Sprite).length).toBe(2);
      run(h, 3);
      expect(h.alive).toBe(true);
      h.stop();
      run(h, 1);
      expect(h.alive).toBe(false);
      expect(ground.children.length).toBe(0);
    }
  });

  it('sits on the cell: the loop is centred on the rect and the emblem is in its top left corner, inside the cell', () => {
    const { env } = makeEnv();
    const h = specialCell(env, rect, 'sun') as Loop;
    run(h, 1);
    expect(h.container.position.x).toBe(rect.x + rect.w / 2);
    expect(h.container.position.y).toBe(rect.y + rect.h / 2);
    const emblem = h.container.children[h.container.children.length - 1] as Sprite;
    expect(emblem.x).toBeLessThan(0);
    expect(emblem.y).toBeLessThan(0);
    expect(emblem.x - EMBLEM / 2).toBeGreaterThanOrEqual(-rect.w / 2 - 2);
    expect(emblem.y - EMBLEM / 2).toBeGreaterThanOrEqual(-rect.h / 2 - 2);
  });

  it('breathes: the halo is brighter and dimmer at different moments of the loop, and never goes dark', () => {
    const { env } = makeEnv();
    const h = specialCell(env, rect, 'bubble') as Loop;
    const halo = h.container.children[0] as Container;
    let lo = 1;
    let hi = 0;
    for (let i = 0; i < 300; i++) {
      h.update(DT);
      if (i > 60) {
        lo = Math.min(lo, halo.alpha);
        hi = Math.max(hi, halo.alpha);
      }
    }
    expect(hi - lo).toBeGreaterThan(0.1);
    expect(lo).toBeGreaterThan(0.4);
  });

  it('starts one sparkle emitter, rising for bubbles and hearts and twinkling in place for the others', () => {
    for (const id of SPECIAL_CELL_IDS) {
      const { env, emitters } = makeEnv();
      specialCell(env, rect, id);
      expect(emitters.length).toBe(1);
      expect(emitters[0]?.def.tex).toBe(CELL_LOOKS[id].spark);
      const rising = emitters[0]?.def.dir === -Math.PI / 2;
      expect(rising).toBe(CELL_LOOKS[id].rises);
    }
  });

  it('arrives after its delay: hidden, then dropped in a little bigger with a flash that settles', () => {
    const { env } = makeEnv();
    const h = specialCell(env, rect, 'stump', { delay: 0.4 }) as Loop;
    run(h, 0.3);
    expect(h.container.alpha).toBe(0);
    run(h, 0.2);
    expect(h.container.alpha).toBeGreaterThan(0.9);
    const tile = h.container.children[1] as Sprite;
    const glint = h.container.children[2] as Container;
    const bigger = tile.scale.x;
    expect(glint.alpha).toBeGreaterThan(0.3);
    run(h, 1.2);
    expect(tile.scale.x).toBeLessThan(bigger);
    expect(glint.alpha).toBeLessThan(0.3);
  });

  it('is simply there when no delay is asked for: no hiding, no drop', () => {
    const { env } = makeEnv();
    const h = specialCell(env, rect, 'sun') as Loop;
    run(h, 0.8);
    const tile = h.container.children[1] as Sprite;
    const settled = tile.scale.x;
    run(h, 1);
    expect(tile.scale.x).toBeCloseTo(settled, 6);
    expect(h.container.alpha).toBeGreaterThan(0.99);
  });

  it('under reduced motion shows the same lit picture still: no emitter, no arrival, a steady halo and glint', () => {
    setFxSettings({ reducedMotion: true });
    const { env, emitters } = makeEnv();
    const h = specialCell(env, rect, 'treat', { delay: 0.5 }) as Loop;
    expect(emitters.length).toBe(0);
    run(h, 0.9);
    expect(h.container.alpha).toBeGreaterThan(0.99);
    const halo = h.container.children[0] as Container;
    const a = halo.alpha;
    const glint = h.container.children[2] as Container;
    run(h, 1.3);
    expect(halo.alpha).toBe(a);
    expect(a).toBeGreaterThan(0.8);
    expect(glint.alpha).toBe(0);
    expect(h.container.children[h.container.children.length - 1]?.rotation).toBe(0);
  });

  it('allocates no new display object while it loops', () => {
    const { env, ground } = makeEnv();
    const h = specialCell(env, rect, 'bowl') as Loop;
    const before = h.container.children.length;
    run(h, 5);
    expect(h.container.children.length).toBe(before);
    expect(ground.children.length).toBe(1);
  });
});
