import { Graphics, Texture } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Text cannot be measured without a canvas: a label is a rectangle as wide as its letters.
vi.mock('@/ui', async (original) => ({
  ...(await original<typeof import('@/ui')>()),
  uiLabel: (text: string) => new Graphics().rect(0, 0, text.length * 14, 24).fill(0),
}));

vi.mock('@/fx', () => ({
  fxTex: () => ({ id: 'wedge', texture: Texture.WHITE, w: 256, h: 64, ax: 0, ay: 0.5 }),
  fxTexture: () => Texture.WHITE,
}));

import { uiTweens } from '@/core/tween';
import { motion } from '@/ui';
import { LightFan } from '../src/screens/shop/chestLight';
import { ChestStage, tellColors } from '../src/screens/shop/ChestStage';
import { chestPoseAt, newPose, revealSchedule } from '../src/screens/shop/revealPlan';

const RARITIES = ['common', 'rare', 'epic', 'legendary'] as const;

function run(seconds: number): void {
  for (let t = 0; t < seconds; t += 1 / 60) uiTweens.update(1 / 60);
}

describe('the chest of a reveal', () => {
  afterEach(() => {
    motion.reduced = false;
  });

  it('tells each rarity by its own light, pale enough to read as light', () => {
    const cores = RARITIES.map((r) => tellColors(r).core);
    expect(new Set(cores).size).toBe(4);
    for (const r of RARITIES) {
      const { core } = tellColors(r);
      const mean = (((core >> 16) & 255) + ((core >> 8) & 255) + (core & 255)) / 3;
      expect(mean).toBeGreaterThan(190);
    }
  });

  it('without its pictures (the drawn chest) goes through the whole fall, rattle and creak and opens', () => {
    const stack = (rarity: (typeof RARITIES)[number]) => [{ key: 'k', unit: null, rarity, count: 1, bonus: false }];
    for (const best of RARITIES) {
      const stage = new ChestStage('wooden', best, 1);
      const sch = revealSchedule(stack(best));
      const pose = newPose();
      for (let t = 0; t <= sch.pop; t += 1 / 30) {
        chestPoseAt(pose, t, sch, 700);
        expect(() => stage.apply(pose)).not.toThrow();
      }
      stage.open();
      stage.fadeOut();
      run(1);
      expect(stage.visible).toBe(false);
      stage.destroy({ children: true });
      expect(() => run(1)).not.toThrow();
    }
  });

  it('puts the cards\' exit above the chest and a pile\'s count on it', () => {
    const stage = new ChestStage('gold', 'epic', 4);
    expect(stage.opening.y).toBeLessThan(0);
    expect(stage.halfH).toBeGreaterThan(100);
    stage.destroy({ children: true });
  });

  it('opens at once without motion: no tween is left running and the tag is gone', () => {
    motion.reduced = true;
    const stage = new ChestStage('silver', 'rare', 1);
    stage.open();
    expect(stage.alpha).toBe(1);
    stage.fadeOut();
    expect(stage.visible).toBe(false);
    stage.destroy({ children: true });
  });

  it('a light fan sways while it lives and fades out when told to', () => {
    const fan = new LightFan(0xffffff, 0xcccccc, 600, 0.7);
    fan.update(0);
    fan.update(0.5);
    expect(fan.alpha).toBeCloseTo(0.7, 5);
    const turned = fan.rotation;
    fan.update(0.5);
    expect(fan.rotation).not.toBe(turned);
    fan.stop(0.4);
    fan.update(0.5);
    expect(fan.visible).toBe(false);
    fan.destroy({ children: true });
    const still = new LightFan(0xffffff, 0xcccccc, 600, 0.7, true);
    still.update(1);
    expect(still.rotation).toBe(0);
    expect(still.alpha).toBeCloseTo(0.7, 5);
    still.destroy({ children: true });
  });
});
