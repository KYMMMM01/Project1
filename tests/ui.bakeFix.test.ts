import { BatchableGraphics, BatchableSprite, Container, Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { bakesItself, withOpaqueRoot } from '@/ui/bakeFix';
import { cacheStatic } from '@/ui/shapes';

/** A leaf as Pixi leaves it after one frame under a parent at alpha 0.3 with a grey tint. */
function fadedLeaf(cached: boolean): Graphics {
  const parent = new Container();
  const g = new Graphics().rect(0, 0, 10, 10).fill(0xff0000);
  parent.addChild(g);
  if (cached) g.cacheAsTexture({});
  g.groupColor = 0x808080;
  g.groupAlpha = 0.3;
  g.groupColorAlpha = 0x808080 + ((0.3 * 255) << 24);
  return g;
}

function batchOf(g: Graphics): BatchableGraphics {
  const b = new BatchableGraphics();
  b.renderable = g;
  b.baseColor = 0xff0000;
  b.alpha = 1;
  return b;
}

const alphaOf = (argb: number): number => argb >>> 24;

describe('baked pixels are neutral', () => {
  it('a cached leaf is baked at full alpha and without its ancestors tint', () => {
    const color = batchOf(fadedLeaf(true)).color;
    expect(alphaOf(color)).toBe(255);
    expect(color & 0xffffff).toBe(0x0000ff);
  });

  it('a leaf that is not cached still takes the colour of its parents', () => {
    expect(alphaOf(batchOf(fadedLeaf(false)).color)).toBe(76);
  });

  it('a fill with its own alpha keeps it', () => {
    const b = batchOf(fadedLeaf(true));
    b.alpha = 0.5;
    expect(alphaOf(b.color)).toBe(127);
  });

  it('a baked sprite is still drawn with the real alpha, its content is not', () => {
    const g = fadedLeaf(true);
    const content = new BatchableSprite();
    content.renderable = g;
    const drawn = new BatchableSprite();
    drawn.renderable = g;
    g.renderGroup._batchableRenderGroup = drawn;
    expect(alphaOf(content.color)).toBe(255);
    expect(alphaOf(drawn.color)).toBe(76);
  });

  it('cacheStatic bakes the leaf itself, so every cached piece of the kit is covered', () => {
    const g = new Graphics().rect(0, 0, 4, 4).fill(0xffffff);
    cacheStatic(g);
    expect(bakesItself(g)).toBe(true);
    expect(bakesItself(new Graphics())).toBe(false);
  });
});

describe('withOpaqueRoot', () => {
  it('shows opaque white inside and puts the real values back, also when the callback throws', () => {
    const g = fadedLeaf(true);
    const seen: number[] = [];
    withOpaqueRoot(g, () => seen.push(g.groupAlpha, g.groupColor, g.groupColorAlpha >>> 24));
    expect(seen).toEqual([1, 0xffffff, 255]);
    expect([g.groupAlpha, g.groupColor, g.groupColorAlpha >>> 24]).toEqual([0.3, 0x808080, 76]);
    expect(() =>
      withOpaqueRoot(g, () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(g.groupAlpha).toBe(0.3);
  });
});
