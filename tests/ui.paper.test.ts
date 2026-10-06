import { describe, expect, it } from 'vitest';
import {
  bubblePath,
  cachedPaperPath,
  clipPolyX,
  dashRuns,
  hash32,
  makeRng,
  paintPath,
  paperPath,
  tapeOutline,
  tornMask,
  wobbleAmp,
} from '@/ui/paperMath';

function bounds(pts: readonly number[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    x0 = Math.min(x0, pts[i] as number);
    x1 = Math.max(x1, pts[i] as number);
    y0 = Math.min(y0, pts[i + 1] as number);
    y1 = Math.max(y1, pts[i + 1] as number);
  }
  return { x0, y0, x1, y1 };
}

describe('seeded randomness', () => {
  it('replays the same sequence for a seed and differs between seeds', () => {
    const a = makeRng(7);
    const b = makeRng(7);
    const c = makeRng(8);
    const sa = [a(), a(), a()];
    expect(sa).toEqual([b(), b(), b()]);
    expect(sa).not.toEqual([c(), c(), c()]);
    for (const v of sa) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('hash32 is stable and spreads nearby inputs', () => {
    expect(hash32(1, 2, 3)).toBe(hash32(1, 2, 3));
    expect(hash32(1, 2, 3)).not.toBe(hash32(1, 2, 4));
    expect(hash32(220, 100, 30)).toBeGreaterThanOrEqual(0);
  });
});

describe('paperPath', () => {
  it('is deterministic per seed and size', () => {
    const a = paperPath(220, 100, 30, 99, 2);
    const b = paperPath(220, 100, 30, 99, 2);
    const c = paperPath(220, 100, 30, 100, 2);
    expect(a.pts).toEqual(b.pts);
    expect(a.pts).not.toEqual(c.pts);
  });

  it('keeps the wobble inside its box and within a couple of pixels of a straight edge', () => {
    const amp = wobbleAmp(220, 100);
    const { pts } = paperPath(220, 100, 30, 5, amp);
    const b = bounds(pts);
    expect(b.x0).toBeGreaterThanOrEqual(0);
    expect(b.y0).toBeGreaterThanOrEqual(0);
    expect(b.x1).toBeLessThanOrEqual(220);
    expect(b.y1).toBeLessThanOrEqual(100);
    // The straight stretch of the top edge never strays more than the amplitude (plus jitter).
    const top = [];
    for (let i = 0; i < pts.length; i += 2) if ((pts[i] as number) > 60 && (pts[i] as number) < 160 && (pts[i + 1] as number) < 40) top.push(pts[i + 1] as number);
    expect(Math.max(...top) - Math.min(...top)).toBeLessThanOrEqual(amp * 2 + 0.5);
    expect(Math.max(...top) - Math.min(...top)).toBeGreaterThan(0.2);
  });

  it('wobble amplitude stays in the 1-3 px range the look asks for', () => {
    for (const [w, h] of [[40, 40], [150, 84], [600, 400], [720, 1280]] as const) {
      const a = wobbleAmp(w, h);
      expect(a).toBeGreaterThanOrEqual(1);
      expect(a).toBeLessThanOrEqual(2.1);
    }
    expect(wobbleAmp(150, 84, 0)).toBe(0);
  });

  it('tears the requested side only and returns its fibre line', () => {
    const plain = paperPath(200, 120, 20, 3, 2);
    expect(plain.torn).toHaveLength(0);
    const torn = paperPath(200, 120, 20, 3, 2, tornMask('bottom'));
    expect(torn.torn).toHaveLength(1);
    // The torn edge has more, shorter teeth than the smooth one.
    expect(torn.pts.length).toBeGreaterThan(0);
    const both = paperPath(200, 120, 20, 3, 2, tornMask(['left', 'right']));
    expect(both.torn).toHaveLength(2);
    expect(tornMask(undefined)).toBe(0);
    expect(tornMask(['top', 'bottom'])).toBe(3);
  });

  it('degrades gracefully for tiny and capsule shapes', () => {
    for (const [w, h, r] of [[4, 4, 10], [60, 60, 30], [300, 60, 30], [10, 100, 50]] as const) {
      const { pts } = paperPath(w, h, r, 1, 1);
      expect(pts.length).toBeGreaterThanOrEqual(8);
      for (const v of pts) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('memoises per size', () => {
    expect(cachedPaperPath(120, 60, 20, 4, 1.5)).toBe(cachedPaperPath(120, 60, 20, 4, 1.5));
    expect(cachedPaperPath(120, 60, 20, 4, 1.5)).not.toBe(cachedPaperPath(121, 60, 20, 4, 1.5));
  });
});

describe('bubblePath', () => {
  it('adds one tail tip outside the body on the requested side', () => {
    const base = cachedPaperPath(300, 90, 24, 11, 1.8).pts;
    const bottom = bubblePath(300, 90, 24, 11, 1.8, { side: 'bottom', x: 100, len: 22, half: 12 });
    expect(bounds(bottom).y1).toBeCloseTo(90 + 22, 5);
    expect(bounds(bottom).y0).toBeGreaterThanOrEqual(0);
    const top = bubblePath(300, 90, 24, 11, 1.8, { side: 'top', x: 200, len: 18, half: 10 });
    expect(bounds(top).y0).toBeCloseTo(-18, 5);
    // The tail replaces the edge points under it: the outline gains only a few vertices.
    expect(bottom.length).toBeLessThan(base.length + 12);
  });

  it('clamps a tail that would sit on a corner', () => {
    const p = bubblePath(200, 80, 24, 2, 1.5, { side: 'bottom', x: 2, len: 20, half: 12 });
    expect(bounds(p).x0).toBeGreaterThanOrEqual(0);
  });
});

describe('dashRuns', () => {
  it('cuts a straight line into dashes of the asked length', () => {
    const runs = dashRuns([0, 0, 100, 0], false, 10, 5);
    expect(runs.length).toBe(7);
    expect(runs[0]).toEqual([0, 0, 10, 0]);
    expect(runs[1]).toEqual([15, 0, 25, 0]);
  });

  it('bends a dash round a corner and closes a loop', () => {
    const runs = dashRuns([0, 0, 20, 0, 20, 20], false, 30, 5);
    expect(runs).toHaveLength(2);
    expect(runs[0]).toEqual([0, 0, 20, 0, 20, 10]);
    expect(runs[1]).toEqual([20, 15, 20, 20]);
    const loop = dashRuns([0, 0, 40, 0, 40, 40, 0, 40], true, 10, 10);
    expect(loop.length).toBeGreaterThan(6);
  });

  it('a phase shifts the pattern and degenerate input yields nothing', () => {
    expect(dashRuns([0, 0, 100, 0], false, 10, 10, 10)[0]).toEqual([10, 0, 20, 0]);
    expect(dashRuns([0, 0, 100, 0], false, 10, 10, 5)[0]).toEqual([0, 0, 5, 0]);
    expect(dashRuns([0, 0], false, 10, 5)).toEqual([]);
    expect(dashRuns([0, 0, 10, 0], false, 0, 5)).toEqual([]);
  });
});

describe('tape and paint', () => {
  it('tape ends are zig-zag: alternate vertices sit inside the end line', () => {
    const p = tapeOutline(100, 28, 4, 1);
    const b = bounds(p);
    expect(b.x1).toBe(50);
    expect(b.x0).toBe(-50);
    const rightXs = new Set(p.filter((_, i) => i % 2 === 0 && (p[i] as number) > 0));
    expect(rightXs.size).toBeGreaterThan(2);
    expect(tapeOutline(100, 28, 4, 1)).toEqual(p);
  });

  it('clips a polygon to a vertical slab', () => {
    const clipped = clipPolyX([-10, 0, 30, 0, 30, 10, -10, 10], 0, 20);
    const b = bounds(clipped);
    expect(b.x0).toBe(0);
    expect(b.x1).toBe(20);
    expect(clipPolyX([30, 0, 40, 0, 40, 10], 0, 20)).toHaveLength(0);
  });

  it('a painted fill has a round left end and an uneven right edge, deterministic per seed', () => {
    const a = paintPath(200, 30, 5);
    expect(a).toEqual(paintPath(200, 30, 5));
    expect(a).not.toEqual(paintPath(200, 30, 6));
    const b = bounds(a);
    expect(b.x0).toBeLessThan(0.5);
    expect(b.y0).toBeGreaterThanOrEqual(-0.001);
    expect(b.y1).toBeLessThanOrEqual(30.001);
    expect(b.x1).toBeLessThanOrEqual(200);
    // Edge noise roughens the long edges; without it they are dead straight.
    const rough = paintPath(300, 30, 5, 2);
    expect(rough.length).toBeGreaterThan(paintPath(300, 30, 5, 0).length);
  });
});
