import { describe, expect, it } from 'vitest';
import { awakeningPlan, bannerOffset, dimAmount } from '@/fx/cutin';

describe('awakeningPlan', () => {
  it('the full cut-in is about 1.6 s, the short one 0.8 s', () => {
    expect(awakeningPlan(false, false).total).toBeCloseTo(1.6, 5);
    expect(awakeningPlan(true, false).total).toBeCloseTo(0.8, 5);
  });

  it('phases are ordered: lines converge, then the banner arrives, holds and leaves inside the total', () => {
    for (const short of [false, true]) {
      for (const reduced of [false, true]) {
        const p = awakeningPlan(short, reduced);
        expect(p.dimIn).toBeGreaterThan(0);
        expect(p.impact).toBeGreaterThan(p.dimIn * 0.9);
        expect(p.impact + p.slideIn).toBeLessThan(p.exitAt);
        expect(p.exitAt + p.exit).toBeCloseTo(p.total, 5);
      }
    }
  });

  it('the guide timings hold: 300 ms of speed lines before the flash, a 220 ms slide in and out', () => {
    const p = awakeningPlan(false, false);
    expect(p.impact).toBeCloseTo(0.3, 5);
    expect(p.slideIn).toBeCloseTo(0.22, 5);
    expect(p.exit).toBeCloseTo(0.22, 5);
    expect(p.lines).toBeGreaterThanOrEqual(12);
  });

  it('the short version keeps every beat but compresses them', () => {
    const full = awakeningPlan(false, false);
    const short = awakeningPlan(true, false);
    expect(short.impact).toBeLessThan(full.impact);
    expect(short.exitAt - short.impact).toBeLessThan(full.exitAt - full.impact);
    expect(short.lines).toBeLessThanOrEqual(full.lines);
    expect(short.lines).toBeGreaterThan(0);
  });

  it('reduced motion shortens the time and drops the speed lines', () => {
    const p = awakeningPlan(false, true);
    expect(p.total).toBeCloseTo(1.6 * 0.7, 5);
    expect(p.lines).toBe(0);
  });

  it('a tempo plays the whole banner that many times as fast, keeps every beat in order and keeps the speed lines', () => {
    const normal = awakeningPlan(true, false);
    for (const tempo of [1.25, 1.5, 2]) {
      const p = awakeningPlan(true, false, tempo);
      expect(p.total).toBeCloseTo(normal.total / tempo, 9);
      expect(p.impact).toBeCloseTo(normal.impact / tempo, 9);
      expect(p.impact + p.slideIn).toBeLessThan(p.exitAt);
      expect(p.exitAt + p.exit).toBeCloseTo(p.total, 9);
      expect(p.lines).toBe(normal.lines);
    }
    // A tempo below 1 or none at all is the banner as it is; reduced motion keeps dropping the lines and is shortened further by a tempo.
    expect(awakeningPlan(true, false, 0.5)).toEqual(normal);
    expect(awakeningPlan(true, false, 1)).toEqual(normal);
    const calm = awakeningPlan(true, true, 1.5);
    expect(calm.lines).toBe(0);
    expect(calm.total).toBeLessThan(awakeningPlan(true, true).total);
  });
});

describe('banner and dim curves', () => {
  const p = awakeningPlan(false, false);

  it('the banner waits off screen, slides in to home, holds, and leaves to the right', () => {
    expect(bannerOffset(0, p)).toBeLessThan(-1);
    expect(bannerOffset(p.impact - 0.01, p)).toBeLessThan(-1);
    expect(bannerOffset(p.impact + p.slideIn, p)).toBe(0);
    expect(bannerOffset((p.impact + p.exitAt) / 2, p)).toBe(0);
    expect(bannerOffset(p.total, p)).toBeGreaterThan(1);
  });

  it('moves one way only: never backs up while sliding in or out', () => {
    let last = bannerOffset(0, p);
    for (let t = 0; t <= p.total; t += 0.005) {
      const o = bannerOffset(t, p);
      expect(o).toBeGreaterThanOrEqual(last - 1e-9);
      last = o;
    }
  });

  it('slides in fast and settles (ease-out): over 80% of the way in half the time', () => {
    const half = bannerOffset(p.impact + p.slideIn / 2, p);
    const travelled = (half - -1.1) / 1.1;
    expect(travelled).toBeGreaterThan(0.8);
  });

  it('the dim overlay fades in, stays, and leaves with the banner', () => {
    expect(dimAmount(0, p)).toBe(0);
    expect(dimAmount(p.dimIn, p)).toBeCloseTo(1, 5);
    expect(dimAmount(p.impact + 0.3, p)).toBe(1);
    expect(dimAmount(p.total, p)).toBeCloseTo(0, 5);
    for (let t = 0; t <= p.total; t += 0.01) {
      const d = dimAmount(t, p);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});
