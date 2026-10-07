import { describe, expect, it } from 'vitest';
import { keepInside, placeBubble, type BubbleSpec } from '@/ui/bubblePlace';

const bounds = { x: 14, y: 58, w: 692, h: 1180 };
const spec = (anchor: BubbleSpec['anchor'], over: Partial<BubbleSpec> = {}): BubbleSpec => ({ anchor, w: 400, h: 120, bounds, arrow: 20, inset: 34, ...over });

/** The body and tail tip of a placement stay inside the bounds, whatever was asked. */
function inside(p: ReturnType<typeof placeBubble>, s: BubbleSpec): void {
  expect(p.x).toBeGreaterThanOrEqual(bounds.x);
  expect(p.x + s.w).toBeLessThanOrEqual(bounds.x + bounds.w);
  expect(p.y).toBeGreaterThanOrEqual(bounds.y);
  expect(p.y + s.h).toBeLessThanOrEqual(bounds.y + bounds.h);
  expect(p.tailX).toBeGreaterThanOrEqual(s.inset);
  expect(p.tailX).toBeLessThanOrEqual(s.w - s.inset);
}

describe('placeBubble', () => {
  it('goes above the target with the tail down when there is room', () => {
    const s = spec({ x: 300, y: 600, w: 88, h: 88 });
    const p = placeBubble(s);
    expect(p.side).toBe('bottom');
    expect(p.y + s.h + 20).toBe(600);
    expect(p.tipY).toBe(600);
    expect(p.tipX).toBe(344);
    inside(p, s);
  });

  it('flips below the target when the top of the screen is in the way', () => {
    const s = spec({ x: 300, y: 100, w: 88, h: 88 });
    const p = placeBubble(s);
    expect(p.side).toBe('top');
    expect(p.y).toBe(188 + 20);
    expect(p.tipY).toBe(188);
    inside(p, s);
  });

  it('goes above when below does not fit the bottom of the screen, even if below was asked for', () => {
    const s = spec({ x: 300, y: 1150, w: 88, h: 88 }, { prefer: 'below' });
    const p = placeBubble(s);
    expect(p.side).toBe('bottom');
    inside(p, s);
  });

  it('is pushed in at either side edge and the tail slides to keep pointing at the target', () => {
    for (const x of [0, 8, 632, 700]) {
      const s = spec({ x, y: 600, w: 20, h: 88 });
      const p = placeBubble(s);
      inside(p, s);
      expect(p.tipX, `target at ${x}`).toBe(Math.min(Math.max(x + 10, p.x + 34), p.x + s.w - 34));
    }
    const left = placeBubble(spec({ x: 0, y: 600, w: 20, h: 88 }));
    expect(left.x).toBe(14);
    expect(left.tailX).toBe(34);
  });

  it('stays on the screen with a target in the middle of a very tall bubble, and with a bubble wider than the screen', () => {
    const tall = spec({ x: 300, y: 500, w: 88, h: 88 }, { h: 1100 });
    inside(placeBubble(tall), tall);
    const wide = spec({ x: 300, y: 500, w: 88, h: 88 }, { w: 800 });
    const p = placeBubble(wide);
    expect(p.x).toBe(bounds.x + (bounds.w - 800) / 2);
  });

  it('keeps the tail on the side its body is on', () => {
    const above = placeBubble(spec({ x: 300, y: 700, w: 88, h: 88 }));
    expect(above.tipY).toBeGreaterThan(above.y);
    const below = placeBubble(spec({ x: 300, y: 80, w: 88, h: 88 }));
    expect(below.tipY).toBeLessThan(below.y);
  });
});

describe('keepInside', () => {
  it('moves a box in just far enough', () => {
    expect(keepInside({ x: -20, y: 10, w: 100, h: 50 }, { x: 0, y: 40, w: 300, h: 300 })).toEqual({ dx: 20, dy: 30 });
    expect(keepInside({ x: 250, y: 320, w: 100, h: 50 }, { x: 0, y: 40, w: 300, h: 300 })).toEqual({ dx: -50, dy: -30 });
    expect(keepInside({ x: 10, y: 50, w: 100, h: 50 }, { x: 0, y: 40, w: 300, h: 300 })).toEqual({ dx: 0, dy: 0 });
  });

  it('centres a box that is bigger than the room', () => {
    expect(keepInside({ x: 0, y: 0, w: 400, h: 50 }, { x: 0, y: 0, w: 300, h: 300 })).toEqual({ dx: -50, dy: 0 });
  });
});
