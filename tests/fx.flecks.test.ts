import { beforeEach, describe, expect, it } from 'vitest';
import { Container, Texture, type Sprite } from 'pixi.js';
import { FLECK_CAP, FleckLayer } from '@/fx/flecks';
import { setFxSettings } from '@/fx/settings';

const DT = 1 / 60;
const tex = (): Texture => new Texture();

function run(layer: FleckLayer, seconds: number): void {
  for (let t = 0; t < seconds - 1e-9; t += DT) layer.update(DT);
}

const normalOf = (layer: FleckLayer): Container => layer.root.children[0] as Container;
const lightsOf = (layer: FleckLayer): Container => layer.root.children[1] as Container;

beforeEach(() => setFxSettings({ tier: 'mid', reducedMotion: false }));

describe('painted flecks', () => {
  it('moves under its speed and gravity, spins, and is gone when its life is over', () => {
    const layer = new FleckLayer(new Container());
    expect(layer.spawn(tex(), 10, 20, { life: 0.5, vx: 100, vy: -200, gravity: 400, spin: 2, rot: 1, size: 20 })).toBe(true);
    const s = normalOf(layer).children[0] as Sprite;
    run(layer, 0.25);
    expect(s.x).toBeCloseTo(10 + 100 * 0.25, 0);
    // Up at first, pulled back by gravity: 20 - 200 t + 200 t^2.
    expect(Math.abs(s.y - (20 - 200 * 0.25 + 200 * 0.25 * 0.25))).toBeLessThan(1.5);
    expect(s.rotation).toBeCloseTo(1 + 2 * 0.25, 1);
    expect(layer.count).toBe(1);
    run(layer, 0.4);
    expect(layer.count).toBe(0);
    expect(s.visible).toBe(false);
    layer.destroy();
  });

  it('draws a light in the additive container and the rest in the normal one, whichever way the sprite was used before', () => {
    const layer = new FleckLayer(new Container());
    layer.spawn(tex(), 0, 0, { life: 0.1, size: 10, add: true });
    layer.spawn(tex(), 0, 0, { life: 0.1, size: 10 });
    expect(lightsOf(layer).blendMode).toBe('add');
    expect(normalOf(layer).blendMode).not.toBe('add');
    expect(lightsOf(layer).children.length).toBe(1);
    expect(normalOf(layer).children.length).toBe(1);
    run(layer, 0.2);
    // The pooled sprite that was a light is a plain fleck now.
    layer.spawn(tex(), 0, 0, { life: 0.1, size: 10 });
    layer.spawn(tex(), 0, 0, { life: 0.1, size: 10 });
    expect(lightsOf(layer).children.length + normalOf(layer).children.length).toBe(2);
    expect(normalOf(layer).children.length).toBe(2);
    layer.destroy();
  });

  it('grows or shrinks from its first size to its last, fades in and then out', () => {
    const layer = new FleckLayer(new Container());
    layer.spawn(tex(), 0, 0, { life: 1, size: 10, sizeEnd: 30, fadeIn: 0.2, fadeAt: 0.6, alpha: 0.8 });
    const s = normalOf(layer).children[0] as Sprite;
    expect(s.alpha).toBe(0);
    run(layer, 0.2);
    expect(s.alpha).toBeCloseTo(0.8, 1);
    run(layer, 0.4);
    const mid = s.scale.x;
    run(layer, 0.3);
    expect(s.scale.x).toBeGreaterThan(mid);
    expect(s.alpha).toBeLessThan(0.4);
    layer.destroy();
  });

  it('keeps no more flecks than the tier allows, and says so', () => {
    for (const tier of ['high', 'mid', 'low'] as const) {
      setFxSettings({ tier });
      const layer = new FleckLayer(new Container());
      let made = 0;
      for (let i = 0; i < FLECK_CAP[tier] + 10; i++) if (layer.spawn(tex(), 0, 0, { life: 1, size: 10 })) made++;
      expect(made).toBe(FLECK_CAP[tier]);
      expect(layer.count).toBe(FLECK_CAP[tier]);
      layer.destroy();
    }
    expect(FLECK_CAP.high).toBeGreaterThan(FLECK_CAP.mid);
    expect(FLECK_CAP.mid).toBeGreaterThan(FLECK_CAP.low);
  });

  it('pools: spawning and ending flecks over and over builds no more sprites than were ever alive at once', () => {
    const layer = new FleckLayer(new Container());
    for (let i = 0; i < 400; i++) {
      layer.spawn(tex(), 0, 0, { life: 0.05, size: 10, add: i % 2 === 0 });
      if (i % 5 === 4) run(layer, 0.1);
    }
    expect(lightsOf(layer).children.length + normalOf(layer).children.length).toBeLessThanOrEqual(5);
    layer.destroy();
  });

  it('clear() hides everything at once and the sprites are reused', () => {
    const layer = new FleckLayer(new Container());
    for (let i = 0; i < 10; i++) layer.spawn(tex(), 0, 0, { life: 5, size: 10 });
    layer.clear();
    expect(layer.count).toBe(0);
    expect(normalOf(layer).children.every((c) => !c.visible)).toBe(true);
    for (let i = 0; i < 10; i++) layer.spawn(tex(), 0, 0, { life: 5, size: 10 });
    expect(normalOf(layer).children.length).toBe(10);
    layer.destroy();
  });
});
