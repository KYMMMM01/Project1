import { describe, expect, it } from 'vitest';
import { flightAt, flightTotal, foldInto, makeFlightPlan, planFlight, type FlightState, type FlyBounds } from '@/fx/flyPath';

const SCREEN: FlyBounds = { minX: 28, minY: 28, maxX: 692, maxY: 1252 };

function inside(x: number, y: number, b: FlyBounds): boolean {
  return x >= b.minX - 1e-6 && x <= b.maxX + 1e-6 && y >= b.minY - 1e-6 && y <= b.maxY + 1e-6;
}

describe('foldInto', () => {
  it('leaves a point that is inside alone and folds one that is outside back by its overshoot', () => {
    expect(foldInto(50, 28, 692)).toBe(50);
    expect(foldInto(10, 28, 692)).toBe(46);
    expect(foldInto(700, 28, 692)).toBe(684);
  });

  it('never leaves the range, however far out the point is, and has a middle for an empty range', () => {
    for (const v of [-5000, -1, 0, 27.9, 692.1, 5000]) {
      const r = foldInto(v, 28, 692);
      expect(r).toBeGreaterThanOrEqual(28);
      expect(r).toBeLessThanOrEqual(692);
    }
    expect(foldInto(900, 100, 100)).toBe(100);
    expect(foldInto(900, 120, 100)).toBe(110);
  });
});

describe('a flight kept on the screen', () => {
  it('rests inside the screen when the burst would reach beyond a side', () => {
    // Source 20 px from the left edge, every burst direction, 120 px out.
    for (let i = 0; i < 16; i++) {
      const plan = planFlight(makeFlightPlan(), 20, 600, 360, 80, (i / 16) * Math.PI * 2, 120, 90, 0.12, 0.2, 0.5, SCREEN);
      expect(inside(plan.bx, plan.by, SCREEN)).toBe(true);
    }
  });

  it('keeps the whole curve inside when the bulge points off the screen', () => {
    // A flight along the right edge with the curve bowing outward (positive and negative bulge).
    for (const bulge of [-140, 140]) {
      const plan = planFlight(makeFlightPlan(), 690, 900, 690, 90, 0, 60, bulge, 0.12, 0.2, 0.5, SCREEN);
      expect(inside(plan.cx, plan.cy, SCREEN)).toBe(true);
      const s: FlightState = { x: 0, y: 0, scale: 0 };
      const total = flightTotal(plan);
      for (let t = 0; t <= total; t += total / 60) {
        flightAt(s, plan, t);
        expect(inside(s.x, s.y, SCREEN) || t === 0).toBe(true);
      }
      flightAt(s, plan, total);
      expect([Math.round(s.x), Math.round(s.y)]).toEqual([690, 90]);
    }
  });

  it('is the same flight as before when everything is already inside', () => {
    const free = planFlight(makeFlightPlan(), 360, 640, 600, 80, 1, 90, 100, 0.12, 0.2, 0.5);
    const kept = planFlight(makeFlightPlan(), 360, 640, 600, 80, 1, 90, 100, 0.12, 0.2, 0.5, SCREEN);
    expect(kept).toEqual(free);
  });

  it('spreads icons that fold off the same edge instead of stacking them', () => {
    const rests = new Set<string>();
    for (let i = 0; i < 8; i++) {
      // All eight head left, a little apart in angle, from a source on the left edge.
      const plan = planFlight(makeFlightPlan(), 40, 600, 360, 80, Math.PI + (i - 4) * 0.08, 100, 0, 0.12, 0.2, 0.5, SCREEN);
      expect(plan.bx).toBeGreaterThanOrEqual(SCREEN.minX);
      rests.add(`${Math.round(plan.bx)},${Math.round(plan.by)}`);
    }
    expect(rests.size).toBe(8);
  });
});
