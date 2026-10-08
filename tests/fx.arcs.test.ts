import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, Texture, type Sprite } from 'pixi.js';

vi.mock('@/core/assets', () => ({ tex: () => Texture.WHITE, hasTex: () => true, putTex: () => undefined, imageKeys: () => [] }));

import { ArcLayer } from '@/fx/arcs';
import { FleckLayer } from '@/fx/flecks';
import { setFxSettings } from '@/fx/settings';

const DT = 1 / 60;

function make(): { arcs: ArcLayer; flecks: FleckLayer; root: Container } {
  const parent = new Container();
  const flecks = new FleckLayer(parent);
  const arcs = new ArcLayer(parent, flecks);
  return { arcs, flecks, root: arcs.root };
}

function run(arcs: ArcLayer, flecks: FleckLayer, seconds: number): void {
  for (let t = 0; t < seconds - 1e-9; t += DT) {
    arcs.update(DT);
    flecks.update(DT);
  }
}

beforeEach(() => setFxSettings({ reducedMotion: false, tier: 'mid' }));

describe('lightning arcs', () => {
  it('stretches a bolt from one point to the other, turned along the line, and flashes where it lands', () => {
    const { arcs, flecks, root } = make();
    arcs.strike(100, 100, 100, 300);
    arcs.update(DT);
    const main = root.children[0] as Sprite;
    expect(main.visible).toBe(true);
    expect(main.position.x).toBe(100);
    expect(main.position.y).toBe(100);
    expect(main.rotation).toBeCloseTo(Math.PI / 2, 5);
    // A little longer than the line, so the pointed ends reach both targets.
    expect(main.scale.x * main.texture.width).toBeGreaterThan(200);
    expect(flecks.count).toBeGreaterThanOrEqual(2);
    arcs.destroy();
  });

  it('waits for its delay: a chain jumps hop by hop', () => {
    const { arcs, flecks, root } = make();
    arcs.strike(0, 0, 100, 0, { delay: 0.1 });
    run(arcs, flecks, 0.05);
    expect((root.children[0] as Sprite).visible).toBe(false);
    expect(arcs.count).toBe(1);
    run(arcs, flecks, 0.1);
    expect((root.children[0] as Sprite).visible).toBe(true);
    arcs.destroy();
  });

  it('flickers: the second bolt beside the first leans one way and then the other, and the strike is gone in a fifth of a second', () => {
    const { arcs, flecks, root } = make();
    arcs.strike(0, 0, 150, 0);
    const main = root.children[0] as Sprite;
    let last = Number.NaN;
    let swaps = 0;
    for (let i = 0; i < 12; i++) {
      arcs.update(DT);
      flecks.update(DT);
      const skew = (root.children[1] as Sprite).rotation;
      if (skew !== last) swaps++;
      last = skew;
    }
    expect(main.visible).toBe(true);
    expect(swaps).toBeGreaterThan(1);
    run(arcs, flecks, 0.2);
    expect(arcs.count).toBe(0);
    expect(main.visible).toBe(false);
    arcs.destroy();
  });

  it('stays still under reduced motion: no flicker, no skew', () => {
    setFxSettings({ reducedMotion: true });
    const { arcs, flecks, root } = make();
    arcs.strike(0, 0, 150, 0);
    const skews = new Set<number>();
    for (let i = 0; i < 10; i++) {
      arcs.update(DT);
      flecks.update(DT);
      skews.add((root.children[1] as Sprite).rotation);
    }
    expect(skews.size).toBe(1);
    arcs.destroy();
  });

  it('pools ten arcs and drops the eleventh instead of making another', () => {
    const { arcs, root } = make();
    for (let i = 0; i < 14; i++) arcs.strike(0, 0, 100, i);
    expect(arcs.count).toBe(10);
    expect(root.children.length).toBe(20);
    arcs.destroy();
  });

  it('tints a bolt when asked (the hostile storm cloud), and leaves the painted blue when not', () => {
    const { arcs, root } = make();
    arcs.strike(0, 0, 100, 0, { color: 0xffd45a });
    arcs.strike(0, 0, 100, 40);
    arcs.update(DT);
    expect((root.children[0] as Sprite).tint).toBe(0xffd45a);
    expect((root.children[2] as Sprite).tint).toBe(0xffffff);
    arcs.destroy();
  });
});
