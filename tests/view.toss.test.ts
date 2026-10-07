import { beforeEach, describe, expect, it } from 'vitest';
import { game } from '@/core/game';
import { aimingFor, startAim, stopAim } from '@/view/aim';
import { LAND_RING_SECONDS, NEW_TAG_SECONDS, TOSS_SECONDS, tossFor, tossLift, tossPoint, tossScale, type TossPoint } from '@/view/toss';

describe('the summon toss', () => {
  it('is a quarter of a second, and the ring and the tag outlast it', () => {
    expect(TOSS_SECONDS).toBeGreaterThan(0.2);
    expect(TOSS_SECONDS).toBeLessThan(0.3);
    expect(LAND_RING_SECONDS).toBeGreaterThan(TOSS_SECONDS);
    expect(NEW_TAG_SECONDS).toBe(2);
  });

  it('flies the button, script and pick summons, and only those, unless motion is reduced', () => {
    for (const source of ['button', 'script', 'choice'] as const) {
      expect(tossFor(source, false)).toBe(TOSS_SECONDS);
      expect(tossFor(source, true)).toBe(0);
    }
    expect(tossFor('relic', false)).toBe(0);
    expect(tossFor('twin', false)).toBe(0);
  });

  it('runs along an arc from the start to the cell and rises in between', () => {
    const p: TossPoint = { x: 0, y: 0, k: 0 };
    tossPoint(0, 360, 1150, 200, 400, 100, p);
    expect([p.x, p.y]).toEqual([360, 1150]);
    tossPoint(1, 360, 1150, 200, 400, 100, p);
    expect([p.x, p.y]).toEqual([200, 400]);
    tossPoint(0.5, 360, 1150, 200, 400, 100, p);
    expect(p.x).toBeCloseTo(280, 5);
    // The straight line would pass y 775 at half way; the arc is lifted well above it.
    expect(p.y).toBeLessThan(775);
    tossPoint(5, 360, 1150, 200, 400, 100, p);
    expect(p.k).toBe(1);
  });

  it('lifts a long flight higher than a short one, never past 150 px', () => {
    expect(tossLift(40)).toBeLessThan(tossLift(400));
    expect(tossLift(5000)).toBe(150);
    expect(tossLift(0)).toBeGreaterThan(0);
  });

  it('starts small, swells in the air and lands at a readable size', () => {
    expect(tossScale(0)).toBeLessThan(tossScale(0.5));
    expect(tossScale(1)).toBeGreaterThan(1);
    expect(tossScale(1)).toBeLessThan(1.5);
  });
});

describe('aiming the laser', () => {
  beforeEach(() => {
    stopAim();
    game.time += 1000;
  });

  it('lights the lane for the requested real seconds and then goes quiet', () => {
    expect(aimingFor()).toBe(0);
    startAim(4);
    expect(aimingFor()).toBeCloseTo(4, 5);
    game.time += 3;
    expect(aimingFor()).toBeCloseTo(1, 5);
    game.time += 2;
    expect(aimingFor()).toBe(0);
  });

  it('stops at once when the dot is placed', () => {
    startAim(10);
    stopAim();
    expect(aimingFor()).toBe(0);
  });
});
