import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setLang } from '@/core/i18n';
import { countUpDuration, countUpValue, formatCount, formatDelta } from '@/ui/countUp';
import { desaturate, hsvToColor, luma, shade } from '@/ui/colors';
import { anchorPosition, gridLayout, safeRect, stackLayout, type Box } from '@/ui/layoutMath';
import { DRAG_THRESHOLD, ScrollAxis, VelocityTracker, rubberBand, rubberBandInverse } from '@/ui/scrollPhysics';

const box = (w: number, h: number, x = 0, y = 0): Box => ({ x, y, w, h });

describe('stackLayout', () => {
  it('packs along x with a gap and centres on the cross axis', () => {
    const r = stackLayout([box(100, 40), box(60, 80), box(20, 20)], 'x', 10, 'center');
    expect(r.positions.map((p) => p.x)).toEqual([0, 110, 180]);
    expect(r.positions.map((p) => p.y)).toEqual([20, 0, 30]);
    expect(r.w).toBe(100 + 60 + 20 + 20);
    expect(r.h).toBe(80);
  });

  it('honours the origin offset of centred components', () => {
    // Two 100x50 items whose origin is their centre.
    const r = stackLayout([box(100, 50, -50, -25), box(100, 50, -50, -25)], 'x', 20, 'start');
    expect(r.positions[0]).toEqual({ x: 50, y: 25 });
    expect(r.positions[1]).toEqual({ x: 170, y: 25 });
  });

  it('aligns to start and end on the cross axis', () => {
    const start = stackLayout([box(10, 10), box(10, 50)], 'x', 0, 'start');
    const end = stackLayout([box(10, 10), box(10, 50)], 'x', 0, 'end');
    expect(start.positions[0]?.y).toBe(0);
    expect(end.positions[0]?.y).toBe(40);
  });

  it('stacks vertically', () => {
    const r = stackLayout([box(30, 10), box(50, 20)], 'y', 5, 'start');
    expect(r.positions[1]).toEqual({ x: 0, y: 15 });
    expect(r.w).toBe(50);
    expect(r.h).toBe(35);
  });

  it('distributes with space-between inside a fixed length', () => {
    const r = stackLayout([box(20, 10), box(20, 10), box(20, 10)], 'x', 0, 'start', undefined, 200, 'space-between');
    expect(r.positions.map((p) => p.x)).toEqual([0, 90, 180]);
  });

  it('centres a block inside a fixed length', () => {
    const r = stackLayout([box(50, 10), box(50, 10)], 'x', 0, 'start', undefined, 300, 'center');
    expect(r.positions[0]?.x).toBe(100);
  });

  it('handles an empty list', () => {
    expect(stackLayout([], 'x', 10)).toEqual({ positions: [], w: 0, h: 0 });
  });
});

describe('gridLayout', () => {
  it('places items row-major in equal cells', () => {
    const r = gridLayout([box(50, 50), box(50, 50), box(50, 50), box(50, 50), box(50, 50)], 3, 10, 20, 'start', 'start');
    expect(r.rows).toBe(2);
    expect(r.positions[3]).toEqual({ x: 0, y: 70 });
    expect(r.positions[2]).toEqual({ x: 120, y: 0 });
    expect(r.w).toBe(3 * 50 + 2 * 10);
    expect(r.h).toBe(2 * 50 + 20);
  });

  it('centres smaller items in a fixed cell', () => {
    const r = gridLayout([box(40, 40)], 2, 0, 0, 'center', 'center', 100, 100);
    expect(r.positions[0]).toEqual({ x: 30, y: 30 });
  });

  it('never divides by a zero column count', () => {
    const r = gridLayout([box(10, 10), box(10, 10)], 0, 0, 0);
    expect(r.rows).toBe(2);
  });
});

describe('safe area anchoring', () => {
  it('removes the insets and margin', () => {
    expect(safeRect(720, 1600, 60, 40, 20)).toEqual({ x: 20, y: 80, w: 680, h: 1460 });
  });

  it('anchors a centred item into a corner', () => {
    const area = safeRect(720, 1280, 50, 30, 10);
    const p = anchorPosition(area, box(100, 60, -50, -30), 'top-right');
    expect(p).toEqual({ x: 720 - 10 - 100 + 50, y: 60 + 30 });
  });

  it('anchors to the bottom centre', () => {
    const area = safeRect(720, 1280, 0, 34, 0);
    const p = anchorPosition(area, box(300, 140), 'bottom', 0, -16);
    expect(p).toEqual({ x: 210, y: 1280 - 34 - 140 - 16 });
  });
});

describe('rubber band', () => {
  it('is zero at no overscroll and monotonic', () => {
    expect(rubberBand(0, 800)).toBe(0);
    let prev = 0;
    for (let x = 10; x <= 4000; x += 10) {
      const v = rubberBand(x, 800);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });

  it('never exceeds the viewport length', () => {
    expect(rubberBand(1e9, 800)).toBeLessThan(800);
    expect(rubberBand(100, 800)).toBeLessThan(100);
  });

  it('inverts cleanly', () => {
    for (const x of [5, 40, 220, 900]) {
      expect(rubberBandInverse(rubberBand(x, 800), 800)).toBeCloseTo(x, 4);
    }
  });
});

describe('VelocityTracker', () => {
  it('reports px/s over the recent window', () => {
    const v = new VelocityTracker();
    for (let i = 0; i <= 5; i++) v.push(i * 0.016, i * 16);
    expect(v.velocity(0.08)).toBeCloseTo(1000, 0);
  });

  it('returns zero when the finger rested before release', () => {
    const v = new VelocityTracker();
    v.push(0, 0);
    v.push(0.016, 20);
    expect(v.velocity(0.5)).toBe(0);
  });

  it('ignores samples older than the window', () => {
    const v = new VelocityTracker();
    v.push(0, 0);
    v.push(0.5, 1000); // long ago, fast
    v.push(0.6, 1000);
    v.push(0.66, 1000);
    expect(v.velocity(0.66)).toBeCloseTo(0, 5);
  });
});

describe('ScrollAxis', () => {
  const make = (): ScrollAxis => {
    const a = new ScrollAxis();
    a.viewport = 800;
    a.setMax(2000);
    return a;
  };

  it('drags 1:1 inside the range and rubber-bands outside it', () => {
    const a = make();
    a.beginDrag();
    a.dragBy(300);
    expect(a.pos).toBe(300);
    a.dragBy(-500); // raw = -200: 200px past the top
    expect(a.pos).toBeLessThan(0);
    expect(a.pos).toBeGreaterThan(-200);
    expect(a.overscroll).toBeLessThan(0);
  });

  it('settles a fling inside the range without overshooting the end', () => {
    const a = make();
    a.beginDrag();
    a.dragBy(100);
    a.endDrag(1800);
    let steps = 0;
    while (a.update(1 / 60) && steps++ < 2000);
    expect(steps).toBeLessThan(2000);
    expect(a.vel).toBe(0);
    expect(a.pos).toBeGreaterThan(100);
    expect(a.pos).toBeLessThanOrEqual(2000);
  });

  it('springs back to the edge after an overscroll', () => {
    const a = make();
    a.beginDrag();
    a.dragBy(-400);
    a.endDrag(0);
    let steps = 0;
    while (a.update(1 / 60) && steps++ < 600);
    expect(a.pos).toBe(0);
    expect(a.overscroll).toBe(0);
  });

  it('a hard fling into the end bounces back and rests exactly on max', () => {
    const a = make();
    a.jump(1900);
    a.beginDrag();
    a.endDrag(6000);
    let peak = a.pos;
    let steps = 0;
    while (a.update(1 / 60) && steps++ < 1200) peak = Math.max(peak, a.pos);
    expect(peak).toBeGreaterThan(2000);
    expect(a.pos).toBe(2000);
  });

  it('clamps hard when elasticity is off', () => {
    const a = make();
    a.elastic = false;
    a.beginDrag();
    a.dragBy(-300);
    expect(a.pos).toBe(0);
  });

  it('keeps the position valid when the content shrinks', () => {
    const a = make();
    a.jump(1500);
    a.setMax(400);
    expect(a.pos).toBe(400);
  });

  it('caps fling speed', () => {
    const a = make();
    a.beginDrag();
    a.endDrag(1e6);
    expect(Math.abs(a.vel)).toBeLessThanOrEqual(6500);
  });

  it('has an 8 px drag threshold', () => {
    expect(DRAG_THRESHOLD).toBe(8);
  });
});

describe('count-up', () => {
  it('lasts 0.4-0.8 s and grows with the change', () => {
    expect(countUpDuration(0)).toBe(0);
    expect(countUpDuration(5)).toBeGreaterThanOrEqual(0.4);
    expect(countUpDuration(1e12)).toBe(0.8);
    expect(countUpDuration(10_000)).toBeGreaterThan(countUpDuration(10));
    expect(countUpDuration(-500)).toBe(countUpDuration(500));
  });

  it('hits the exact endpoints and stays integral', () => {
    expect(countUpValue(100, 1234, 0)).toBe(100);
    expect(countUpValue(100, 1234, 1)).toBe(1234);
    for (let k = 0; k <= 1; k += 0.07) {
      expect(Number.isInteger(countUpValue(3, 977, k))).toBe(true);
    }
  });

  it('never overshoots even with a back-easing k > 1', () => {
    expect(countUpValue(0, 500, 1.2)).toBe(500);
    expect(countUpValue(0, 500, -0.2)).toBe(0);
    expect(countUpValue(0, 500, 0.9999)).toBeLessThanOrEqual(500);
  });

  it('counts down as well as up', () => {
    const mid = countUpValue(1000, 0, 0.5);
    expect(mid).toBe(500);
    expect(countUpValue(1000, 0, 1)).toBe(0);
  });

  describe('locale-aware text', () => {
    beforeAll(() => {
      // setLang writes <html lang>; the node environment has no document.
      vi.stubGlobal('document', { documentElement: { lang: '' } });
    });
    afterAll(() => {
      setLang('ko');
      vi.unstubAllGlobals();
    });

    it('English: separators up to 9,999, then K/M/B', () => {
      setLang('en');
      expect(formatCount(0)).toBe('0');
      expect(formatCount(1234)).toBe('1,234');
      expect(formatCount(9999)).toBe('9,999');
      expect(formatCount(12_345)).toBe('12.3K');
      expect(formatCount(1_234_567)).toBe('1.23M');
    });

    it('Korean: separators up to 9,999, then 만/억 units', () => {
      setLang('ko');
      expect(formatCount(9999)).toBe('9,999');
      expect(formatCount(12_345)).toBe('1.23만');
      expect(formatCount(1_234_567)).toBe('123만');
      expect(formatCount(250_000_000)).toBe('2.5억');
    });

    it('shows signed deltas in the active language', () => {
      setLang('en');
      expect(formatDelta(120)).toBe('+120');
      expect(formatDelta(-30)).toBe('-30');
      expect(formatDelta(15_000)).toBe('+15K');
      setLang('ko');
      expect(formatDelta(15_000)).toBe('+1.5만');
    });
  });
});

describe('colours', () => {
  it('desaturate removes chroma', () => {
    const c = desaturate(0xff8000, 1);
    expect((c >> 16) & 255).toBe((c >> 8) & 255);
    expect((c >> 8) & 255).toBe(c & 255);
    expect(desaturate(0xff8000, 0)).toBe(0xff8000);
  });

  it('shade moves toward white or black', () => {
    expect(shade(0x808080, 1)).toBe(0xffffff);
    expect(shade(0x808080, -1)).toBe(0x000000);
    expect(luma(shade(0x336699, 0.3))).toBeGreaterThan(luma(0x336699));
  });

  it('hsvToColor covers the primaries and wraps the hue', () => {
    expect(hsvToColor(0, 1, 1)).toBe(0xff0000);
    expect(hsvToColor(1 / 3, 1, 1)).toBe(0x00ff00);
    expect(hsvToColor(2 / 3, 1, 1)).toBe(0x0000ff);
    expect(hsvToColor(1, 1, 1)).toBe(0xff0000);
    expect(hsvToColor(0.25, 0, 1)).toBe(0xffffff);
  });
});
