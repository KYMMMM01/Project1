import { Container } from 'pixi.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Every tag the card makes, as asked: text cannot be measured here, so a tag is a box and a label is a container. */
const tags = vi.hoisted(() => ({ made: [] as Array<{ text: string; fontSize: number; shape: string; at: () => { x: number; y: number } }> }));

vi.mock('@/ui/Tag', async () => {
  const { Container } = await import('pixi.js');
  class Tag extends Container {
    readonly uiBox = { x: -40, y: -15, w: 80, h: 30 };
    constructor(o: { text: string; fontSize: number; shape: string }) {
      super();
      tags.made.push({ text: o.text, fontSize: o.fontSize, shape: o.shape, at: () => ({ x: this.x, y: this.y }) });
    }
    pop(): void {}
  }
  return { Tag };
});

vi.mock('@/ui/text', async () => {
  const { Container } = await import('pixi.js');
  return {
    uiLabel: (text: string) => Object.assign(new Container(), { text, width: 10, height: 10 }),
    fitLabel: () => undefined,
  };
});

import { CardFrame } from '@/ui/CardFrame';
import { MIN_FONT } from '@/ui/theme';

const frame = (o: Partial<ConstructorParameters<typeof CardFrame>[0]> = {}): CardFrame => new CardFrame({ rarity: 'rare', size: 'medium', name: 'Cat', ...o });

describe('the NEW tag of a unit card', () => {
  beforeEach(() => {
    tags.made.length = 0;
  });

  it('is set in the smallest size the kit allows unless the card asks for more', () => {
    frame({ newTag: 'NEW' });
    expect(tags.made.map((t) => t.fontSize)).toEqual([MIN_FONT]);
  });

  it('takes the size the card was made with, so a card shown scaled down can still read at the minimum', () => {
    frame({ newTag: 'Best', newFontSize: 27 });
    expect(tags.made).toHaveLength(1);
    expect(tags.made[0]?.fontSize).toBe(27);
    expect(tags.made[0]?.text).toBe('Best');
  });

  it('can be set again later with its own size, replacing the tag it had', () => {
    const card = frame({ newTag: 'NEW', newFontSize: 27 });
    card.setNew('NEW', 30);
    expect(tags.made.map((t) => t.fontSize)).toEqual([27, 30]);
    card.setNew('NEW');
    // Without a size it keeps the card's own.
    expect(tags.made[2]?.fontSize).toBe(27);
    card.setNew(false);
    expect(tags.made).toHaveLength(3);
  });

  it('stays on the upper right corner, as a flag, or as a pill on a small card', () => {
    frame({ newTag: 'NEW' });
    frame({ newTag: 'NEW', size: 'small' });
    expect(tags.made[0]?.shape).toBe('flag');
    expect(tags.made[1]?.shape).toBe('pill');
    for (const made of tags.made) {
      expect(made.at().x).toBeGreaterThan(0);
      expect(made.at().y).toBeLessThan(0);
    }
  });

  it('shows no tag when none is asked for, whatever size it is given', () => {
    frame({ newFontSize: 27 });
    expect(tags.made).toHaveLength(0);
    expect(frame() instanceof Container).toBe(true);
  });
});
