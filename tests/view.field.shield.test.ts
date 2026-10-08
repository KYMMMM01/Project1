import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Texture, type Sprite } from 'pixi.js';

vi.mock('@/core/assets', () => ({ tex: () => Texture.WHITE, hasTex: () => true, putTex: () => undefined, imageKeys: () => [] }));
vi.mock('@/fx/textures', () => ({
  ensureFxTextures: () => undefined,
  fxTex: () => ({ texture: Texture.WHITE, w: 64, h: 64, ax: 0.5, ay: 0.5 }),
  fxTexture: () => Texture.WHITE,
  fxVignette: () => Texture.WHITE,
}));

import { setFxSettings } from '@/fx/settings';
import type { Fx } from '@/fx';
import { CRACK_ONE, CRACK_TWO, ShieldDome, crackStage } from '@/view/field/shieldDome';

const DT = 1 / 60;

function fakeFx(): { fx: Fx; fleck: ReturnType<typeof vi.fn> } {
  const fleck = vi.fn(() => true);
  return { fx: { fleck } as unknown as Fx, fleck };
}

/** The glass and the two stages of cracks of a dome. */
const parts = (d: ShieldDome): { glass: Sprite; one: Sprite; two: Sprite } => {
  const [glass, one, two] = d.root.children as Sprite[];
  return { glass: glass as Sprite, one: one as Sprite, two: two as Sprite };
};

function run(d: ShieldDome, seconds: number, share = 1): void {
  for (let t = 0, time = 0; t < seconds - 1e-9; t += DT, time += DT) d.update(DT, time, share);
}

beforeEach(() => setFxSettings({ reducedMotion: false, tier: 'mid' }));

describe('the stages of a shield', () => {
  it('shows no cracks while it is strong, light ones below two thirds, heavy ones below a third', () => {
    expect(crackStage(1)).toBe(0);
    expect(crackStage(CRACK_ONE + 0.01)).toBe(0);
    expect(crackStage(CRACK_ONE - 0.01)).toBe(1);
    expect(crackStage(CRACK_TWO + 0.01)).toBe(1);
    expect(crackStage(CRACK_TWO - 0.01)).toBe(2);
    expect(crackStage(0.01)).toBe(2);
  });
});

describe('the dome round an enemy', () => {
  it('opens like a bubble when it is raised, as wide as the body and a third more, and breathes', () => {
    const d = new ShieldDome();
    d.raise(60);
    expect(d.raised).toBe(true);
    expect(d.root.visible).toBe(true);
    run(d, 1);
    const { glass } = parts(d);
    const wide = glass.scale.x * glass.texture.width;
    expect(wide).toBeGreaterThan(60 * 1.25);
    expect(wide).toBeLessThan(60 * 1.5);
    const seen = new Set<string>();
    for (let t = 0; t < 2; t += DT) {
      d.update(DT, 1 + t, 1);
      seen.add(glass.scale.x.toFixed(4));
    }
    expect(seen.size).toBeGreaterThan(5);
    d.destroy();
  });

  it('shows its cracks as the shield weakens, and only one stage at a time', () => {
    const d = new ShieldDome();
    d.raise(60);
    const { one, two } = parts(d);
    run(d, 0.5, 1);
    expect([one.visible, two.visible]).toEqual([false, false]);
    run(d, 0.1, 0.5);
    expect([one.visible, two.visible]).toEqual([true, false]);
    run(d, 0.1, 0.2);
    expect([one.visible, two.visible]).toEqual([false, true]);
    d.destroy();
  });

  it('is fainter as it weakens, and a blow lights it up for a moment', () => {
    const d = new ShieldDome();
    d.raise(60);
    const { glass } = parts(d);
    run(d, 1, 1);
    const strong = glass.alpha;
    run(d, 1, 0.2);
    const weak = glass.alpha;
    expect(weak).toBeLessThan(strong);
    const { fx } = fakeFx();
    d.hit(fx, 100, 100, 0, false);
    d.update(DT, 3, 0.2);
    expect(glass.alpha).toBeGreaterThan(weak);
    run(d, 0.5, 0.2);
    // Back to the weak shield's own level (it breathes a little, so not to the digit).
    expect(Math.abs(glass.alpha - weak)).toBeLessThan(0.1);
    d.destroy();
  });

  it('sparks and ripples on the dome where it was struck, on the side the blow came from; bigger for a hard blow', () => {
    const d = new ShieldDome();
    d.raise(60);
    const { fx, fleck } = fakeFx();
    d.hit(fx, 100, 100, 0, false);
    expect(fleck).toHaveBeenCalledTimes(3);
    for (const call of fleck.mock.calls as unknown as Array<[Texture, number, number, { size: number }]>) {
      // At the right-hand edge of the dome, half way up.
      expect(call[1]).toBeGreaterThan(100 + 15);
      expect(call[1]).toBeLessThan(100 + 60 * 0.67);
      expect(Math.abs(call[2] - 100)).toBeLessThan(1);
    }
    fleck.mockClear();
    d.hit(fx, 100, 100, 0, true);
    const hard = (fleck.mock.calls as unknown as Array<[Texture, number, number, { size: number }]>)[0]?.[3].size ?? 0;
    fleck.mockClear();
    d.hit(fx, 100, 100, 0, false);
    expect(hard).toBeGreaterThan((fleck.mock.calls as unknown as Array<[Texture, number, number, { size: number }]>)[0]?.[3].size ?? 0);
    d.destroy();
  });

  it('under reduced motion the glass still lights up for a blow, without the ripple and the sparks, and does not breathe', () => {
    setFxSettings({ reducedMotion: true });
    const d = new ShieldDome();
    d.raise(60);
    const { glass } = parts(d);
    run(d, 0.5, 1);
    const seen = new Set<string>();
    for (let t = 0; t < 1; t += DT) {
      d.update(DT, 5 + t, 1);
      seen.add(glass.scale.x.toFixed(4));
    }
    expect(seen.size).toBe(1);
    const { fx, fleck } = fakeFx();
    d.hit(fx, 0, 0, 0, true);
    expect(fleck).not.toHaveBeenCalled();
    const before = glass.alpha;
    d.update(DT, 6, 1);
    expect(glass.alpha).toBeGreaterThan(before);
    d.destroy();
  });

  it('is gone the moment it is dropped, and a dropped dome ignores blows and updates; raising it again starts clean', () => {
    const d = new ShieldDome();
    d.raise(60);
    d.update(DT, 0, 0.2);
    d.drop();
    expect(d.raised).toBe(false);
    expect(d.root.visible).toBe(false);
    const { fx, fleck } = fakeFx();
    d.hit(fx, 0, 0, 0, false);
    expect(fleck).not.toHaveBeenCalled();
    d.raise(40);
    const { one, two, glass } = parts(d);
    expect(d.root.visible).toBe(true);
    expect([one.visible, two.visible]).toEqual([false, false]);
    expect(glass.alpha).toBe(0);
    d.destroy();
  });
});
