import { describe, expect, it } from 'vitest';
import { BattleClock } from '@/view/field/clock';
import { clipPolygonToRect } from '@/view/field/rangeRing';
import { projectileLook } from '@/view/field/projectileLooks';
import { UNIT_IDS } from '@/game/api';
import { unitSpec } from '@/game';

describe('battle clock', () => {
  it('scales battle time by the game speed', () => {
    const c = new BattleClock();
    expect(c.tick(0.1)).toBeCloseTo(0.1);
    c.speed = 3;
    expect(c.tick(0.1)).toBeCloseTo(0.3);
  });

  it('runs only while no pause reason is active, and reports the changes', () => {
    const c = new BattleClock();
    expect(c.setPaused('popup', true)).toBe(true);
    expect(c.setPaused('cutin', true)).toBe(false);
    expect(c.tick(0.1)).toBe(0);
    expect(c.setPaused('popup', false)).toBe(false);
    expect(c.paused).toBe(true);
    expect(c.setPaused('cutin', false)).toBe(true);
    expect(c.tick(0.1)).toBeCloseTo(0.1);
  });

  it('freezes for real time and the longest request wins', () => {
    const c = new BattleClock();
    c.freeze(100);
    c.freeze(40);
    expect(c.tick(0.05)).toBe(0);
    expect(c.frozen).toBe(true);
    expect(c.tick(0.05)).toBe(0);
    expect(c.frozen).toBe(false);
    expect(c.tick(0.05)).toBeCloseTo(0.05);
  });

  it('slows for the hold and then eases back over 200 ms', () => {
    const c = new BattleClock();
    c.slowmo(0.3, 100);
    expect(c.tick(0.05)).toBeCloseTo(0.05 * 0.3);
    expect(c.tick(0.05)).toBeCloseTo(0.05 * 0.3);
    // The hold is over: the factor climbs back and is normal after 0.2 s.
    let last = 0;
    for (let i = 0; i < 4; i++) {
      const dt = c.tick(0.05);
      expect(dt).toBeGreaterThan(last);
      last = dt;
    }
    expect(c.slowFactor).toBe(1);
  });

  it('keeps the deepest slow-motion while holds overlap', () => {
    const c = new BattleClock();
    c.slowmo(0.5, 200);
    c.slowmo(0.2, 100);
    expect(c.tick(0.01)).toBeCloseTo(0.01 * 0.2);
  });

  it('applies the extra multiplier', () => {
    const c = new BattleClock();
    expect(c.tick(0.1, 0.5)).toBeCloseTo(0.05);
  });
});

describe('range ring clipping', () => {
  it('keeps a polygon that is already inside', () => {
    const square = [10, 10, 90, 10, 90, 90, 10, 90];
    expect(clipPolygonToRect(square, 100, 100)).toEqual(square);
  });

  it('clips a huge polygon to the rectangle', () => {
    const big = [-1000, -1000, 1000, -1000, 1000, 1000, -1000, 1000];
    const out = clipPolygonToRect(big, 100, 60);
    for (let i = 0; i < out.length; i += 2) {
      expect(out[i]).toBeGreaterThanOrEqual(-1e-9);
      expect(out[i]).toBeLessThanOrEqual(100 + 1e-9);
      expect(out[i + 1]).toBeGreaterThanOrEqual(-1e-9);
      expect(out[i + 1]).toBeLessThanOrEqual(60 + 1e-9);
    }
    expect(out.length).toBe(8);
  });

  it('returns nothing when the polygon is entirely outside', () => {
    expect(clipPolygonToRect([200, 200, 300, 200, 300, 300], 100, 100).length).toBe(0);
  });
});

describe('projectile looks', () => {
  it('gives every unit that fires a travelling shot its own shape', () => {
    const shapes = new Set<string>();
    for (const id of UNIT_IDS) {
      const look = projectileLook(id);
      if (unitSpec(id).projectileSpeed > 0) {
        expect(look.shape).not.toBe('orb');
        shapes.add(look.shape);
      }
      expect(look.size).toBeGreaterThan(0);
    }
    expect(shapes.size).toBeGreaterThanOrEqual(10);
  });
});
