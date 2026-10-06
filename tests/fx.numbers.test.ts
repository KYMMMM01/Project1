import { beforeEach, describe, expect, it, vi } from 'vitest';

// BitmapFont needs a canvas; the number logic does not. Text objects become plain containers.
vi.mock('pixi.js', async (importOriginal) => {
  const m = await importOriginal<typeof import('pixi.js')>();
  class FakeBitmapText extends m.Container {
    text = '';
    anchor = { set: () => undefined };
  }
  class FakeGradient {}
  return { ...m, BitmapFont: { install: () => undefined }, BitmapText: FakeBitmapText, FillGradient: FakeGradient };
});

vi.mock('@/fx/textures', () => ({ fxTexture: () => Texture.WHITE }));

import { Container, Texture } from 'pixi.js';
import { FloatingNumbers } from '@/fx/numbers';
import { setFxSettings } from '@/fx/settings';

function make(cap = 3): FloatingNumbers {
  const n = new FloatingNumbers(new Container(), cap);
  n.cap = cap;
  return n;
}

const DT = 1 / 60;

/** A number is [starburst, stroked digits]; the digits carry the text the player reads. */
function textOf(c: unknown): string {
  return ((c as Container).children[1] as unknown as { text: string }).text;
}

beforeEach(() => {
  setFxSettings({ numbers: 'full', reducedMotion: false });
});

describe('FloatingNumbers capacity', () => {
  it('a new number evicts the oldest one when full, so the newest damage always shows', () => {
    const n = make(3);
    n.show(0, 0, 1, 'damage', { noScatter: true });
    n.show(0, 0, 2, 'damage', { noScatter: true });
    n.show(0, 0, 3, 'damage', { noScatter: true });
    n.show(0, 0, 4, 'damage', { noScatter: true });
    expect(n.count).toBe(3);
    expect(n.skipped).toBe(0);
    // No new text objects were needed: the evicted one was reused.
    expect(n.created).toBe(3);
  });

  it('a crit evicts plain damage before it would evict another crit', () => {
    const n = make(3);
    n.show(0, 0, 10, 'crit');
    n.show(0, 0, 1, 'damage');
    n.show(0, 0, 10, 'crit');
    n.show(0, 0, 10, 'crit');
    expect(n.count).toBe(3);
    const texts = n.layer.children.filter((c) => c.visible).map(textOf);
    expect(texts.length).toBe(3);
    expect(texts.every((t) => t.endsWith('!'))).toBe(true);
  });

  it('plain damage is dropped, not shown, when the screen holds only more important numbers', () => {
    const n = make(2);
    n.show(0, 0, 10, 'crit');
    n.show(0, 0, 10, 'big');
    n.show(0, 0, 5, 'damage');
    expect(n.count).toBe(2);
    expect(n.skipped).toBe(1);
  });

  it('a crit takes a slot from another crit when everything on screen is as important', () => {
    const n = make(2);
    n.show(0, 0, 10, 'crit');
    n.show(0, 0, 20, 'crit');
    n.show(0, 0, 30, 'crit');
    expect(n.count).toBe(2);
    expect(n.skipped).toBe(0);
  });

  it('numbers fade out and are recycled after their lifetime without creating new objects', () => {
    const n = make(10);
    for (let i = 0; i < 5; i++) n.show(0, 0, 100 + i, 'damage');
    for (let t = 0; t < 1; t += DT) n.update(DT);
    expect(n.count).toBe(0);
    for (let i = 0; i < 5; i++) n.show(0, 0, 100 + i, 'damage');
    expect(n.created).toBe(5);
  });
});

describe('FloatingNumbers behaviour', () => {
  it('sums numbers sharing a key within 100 ms into one', () => {
    const n = make(10);
    n.show(0, 0, 100, 'damage', { key: 'orc7' });
    n.show(0, 0, 50, 'damage', { key: 'orc7' });
    n.show(0, 0, 25, 'damage', { key: 'orc8' });
    expect(n.count).toBe(2);
    expect(textOf(n.layer.children[0])).toBe('150');
    for (let t = 0; t < 0.2; t += DT) n.update(DT);
    n.show(0, 0, 10, 'damage', { key: 'orc7' });
    expect(n.count).toBe(3);
  });

  it('formats big values compactly and prefixes by style', () => {
    const n = make(10);
    n.show(0, 0, 48210, 'big');
    n.show(0, 0, 386, 'heal');
    n.show(0, 0, 70, 'hurt');
    const texts = n.layer.children.map(textOf);
    expect(texts).toContain('48.2K!');
    expect(texts).toContain('+386');
    expect(texts).toContain('-70');
  });

  it('bigger hits are drawn bigger, up to the cap at 1000', () => {
    const size = (v: number): number => {
      const n = make(10);
      n.show(0, 0, v, 'damage', { noScatter: true });
      return n.layer.children[0]?.scale.x ?? 0;
    };
    expect(size(5000)).toBeCloseTo(size(1000));
    expect(size(1000)).toBeGreaterThan(size(100));
    expect(size(100)).toBeGreaterThan(size(5));
  });

  it('density setting: off shows nothing, brief keeps only crits, big hits and damage taken', () => {
    setFxSettings({ numbers: 'off' });
    const off = make(10);
    off.show(0, 0, 10, 'crit');
    expect(off.count).toBe(0);

    setFxSettings({ numbers: 'brief' });
    const brief = make(10);
    brief.show(0, 0, 10, 'damage');
    brief.show(0, 0, 10, 'dot');
    brief.show(0, 0, 10, 'heal');
    brief.show(0, 0, 10, 'gold');
    expect(brief.count).toBe(0);
    brief.show(0, 0, 10, 'crit');
    brief.show(0, 0, 10, 'hurt');
    brief.show(0, 0, 10, 'big');
    expect(brief.count).toBe(3);
  });

  it('clear() hides everything and keeps the objects for reuse', () => {
    const n = make(10);
    n.show(0, 0, 1, 'damage');
    n.show(0, 0, 2, 'crit');
    n.clear();
    expect(n.count).toBe(0);
    expect(n.layer.children.every((c) => !c.visible)).toBe(true);
    n.show(0, 0, 3, 'damage');
    expect(n.created).toBe(2);
  });

  it('a number is a sticker: crits and boss hits sit on a paper starburst, plain damage does not', () => {
    const n = make(10);
    n.show(0, 0, 10, 'damage');
    n.show(0, 0, 10, 'crit');
    n.show(0, 0, 10, 'big');
    const burst = (i: number): boolean => ((n.layer.children[i] as Container).children[0] as Container).visible;
    expect([burst(0), burst(1), burst(2)]).toEqual([false, true, true]);
  });

  it('a recycled sticker drops the starburst of its last life', () => {
    const n = make(1);
    n.show(0, 0, 10, 'crit');
    for (let t = 0; t < 1.2; t += DT) n.update(DT);
    // Gold shares the crit's mustard face, so it gets the same pooled sticker back.
    n.show(0, 0, 10, 'gold');
    expect(n.created).toBe(1);
    expect(((n.layer.children[0] as Container).children[0] as Container).visible).toBe(false);
  });

  it('a face colour override gets its own pool: the face is baked per colour', () => {
    const n = make(10);
    n.show(0, 0, 10, 'dot');
    n.show(0, 0, 10, 'dot', { color: 0x123456 });
    expect(n.created).toBe(2);
    for (let t = 0; t < 1; t += DT) n.update(DT);
    n.show(0, 0, 10, 'dot');
    n.show(0, 0, 10, 'dot', { color: 0x123456 });
    expect(n.created).toBe(2);
  });
});

describe('FloatingNumbers bounds', () => {
  it('keeps a number under the HUD edge and between the screen sides, wherever it was fired', () => {
    const n = make();
    n.minY = 100;
    n.minX = 20;
    n.maxX = 200;
    n.show(4, 60, 12, 'damage', { noScatter: true });
    n.show(640, 400, 12, 'damage', { noScatter: true });
    n.update(DT);
    const [left, right] = n.layer.children.filter((c) => c.visible);
    expect(left?.x).toBe(20);
    expect(left?.y).toBeGreaterThanOrEqual(100);
    expect(right?.x).toBe(200);
    expect(right?.y).toBeLessThanOrEqual(400);
    expect(right?.y).toBeGreaterThanOrEqual(100);
  });
});
