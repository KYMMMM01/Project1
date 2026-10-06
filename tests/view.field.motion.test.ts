import { describe, expect, it } from 'vitest';
import { ATTACK_SECONDS, attackPose, breathe, deathScale, hopArc, makePose, stepRate, walkBob, walkTilt } from '@/view/field/motion';
import { DEFAULT_RUG, RUG_SKINS, perimeterDashes, rugSkin, type RugPattern } from '@/view/field/rugSkins';

describe('attack pose', () => {
  it('starts and ends at rest', () => {
    const p = makePose();
    for (const k of [0, 1]) {
      attackPose(k, p);
      expect(p).toEqual({ lunge: 0, sx: 1, sy: 1 });
    }
    expect(ATTACK_SECONDS).toBeGreaterThan(0.2);
  });

  it('pulls back first, then lunges the full distance, then recoils to rest', () => {
    const p = makePose();
    attackPose(0.2, p);
    expect(p.lunge).toBeLessThan(0);
    expect(p.sy).toBeLessThan(1);
    attackPose(0.46, p);
    expect(p.lunge).toBeCloseTo(1, 1);
    expect(p.sy).toBeGreaterThan(1);
    attackPose(0.99, p);
    expect(Math.abs(p.lunge)).toBeLessThan(0.05);
    expect(p.sx).toBeCloseTo(1, 1);
  });

  it('is continuous across phase boundaries', () => {
    const a = makePose();
    const b = makePose();
    for (const k of [0.26, 0.46]) {
      attackPose(k - 1e-6, a);
      attackPose(k + 1e-6, b);
      expect(Math.abs(a.lunge - b.lunge)).toBeLessThan(0.01);
      expect(Math.abs(a.sy - b.sy)).toBeLessThan(0.01);
    }
  });
});

describe('idle and walk cycles', () => {
  it('breathes with preserved volume and a per-unit phase', () => {
    const a = makePose();
    const b = makePose();
    breathe(0.3, 0, 1, a);
    breathe(0.3, 2, 1, b);
    expect(a.sy).not.toBe(b.sy);
    for (let t = 0; t < 3; t += 0.1) {
      breathe(t, 0, 1, a);
      expect(Math.abs(a.sy - 1)).toBeLessThan(0.04);
      expect(Math.abs(a.sx - 1)).toBeLessThan(0.04);
    }
  });

  it('hops and waddles in step', () => {
    const rate = stepRate(70);
    expect(rate).toBeGreaterThan(2);
    expect(stepRate(10)).toBeGreaterThanOrEqual(1.1);
    for (let t = 0; t < 2; t += 0.05) {
      expect(walkBob(t, rate, 4)).toBeGreaterThanOrEqual(0);
      expect(walkBob(t, rate, 4)).toBeLessThanOrEqual(4);
      expect(Math.abs(walkTilt(t, rate, 0.1))).toBeLessThanOrEqual(0.1);
    }
  });

  it('swells then collapses when dying', () => {
    expect(deathScale(0)).toBe(1);
    expect(deathScale(0.4)).toBeGreaterThan(1.1);
    expect(deathScale(1)).toBeCloseTo(0, 5);
  });

  it('arcs a hop up and back', () => {
    expect(hopArc(0, 20)).toBeCloseTo(0, 5);
    expect(hopArc(0.5, 20)).toBeCloseTo(-20, 5);
    expect(hopArc(1, 20)).toBeCloseTo(0, 5);
  });
});

describe('rug skins', () => {
  it('has at least eight distinct patterns across the skins', () => {
    const patterns = new Set<RugPattern>(RUG_SKINS.map((s) => s.pattern));
    expect(patterns.size).toBeGreaterThanOrEqual(8);
    expect(new Set(RUG_SKINS.map((s) => s.id)).size).toBe(RUG_SKINS.length);
  });

  it('covers every meta cosmetic id and falls back for unknown ones', () => {
    const ids = [
      'rug_default', 'rug_ch1', 'rug_ch2', 'rug_ch3', 'rug_ch4', 'rug_ch5',
      'rug_gem1', 'rug_gem2', 'rug_gem3', 'rug_baby', 'rug_butler', 'rug_calendar', 'rug_season',
    ];
    for (const id of ids) expect(rugSkin(id).id).toBe(id);
    expect(rugSkin('rug_from_the_future').id).toBe(DEFAULT_RUG);
  });

  it('keeps the pattern colour close to the field so cats stay readable', () => {
    const lum = (c: number): number => 0.3 * ((c >> 16) & 255) + 0.59 * ((c >> 8) & 255) + 0.11 * (c & 255);
    for (const s of RUG_SKINS) {
      expect(s.border).not.toBe(s.base);
      // Calendar stripes are a deliberate two-colour festive mat, the rest stay within a narrow band.
      if (s.id !== 'rug_calendar') expect(Math.abs(lum(s.base) - lum(s.alt))).toBeLessThan(40);
    }
  });
});

describe('stitching', () => {
  it('places evenly spaced dashes of the requested length around the outline', () => {
    const dashes = perimeterDashes(300, 200, 30, 8, 6);
    expect(dashes.length).toBeGreaterThan(60);
    for (const d of dashes) {
      const len = Math.hypot(d.x1 - d.x0, d.y1 - d.y0);
      expect(len).toBeGreaterThan(5);
      expect(len).toBeLessThanOrEqual(8.01);
      for (const x of [d.x0, d.x1]) {
        expect(x).toBeGreaterThanOrEqual(-0.01);
        expect(x).toBeLessThanOrEqual(300.01);
      }
    }
    expect(dashes[0]?.y0).toBe(0);
  });
});
