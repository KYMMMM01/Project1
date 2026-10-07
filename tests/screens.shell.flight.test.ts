import { describe, expect, it } from 'vitest';
import { game } from '@/core/game';
import { flightTuning, originX } from '@/screens/shell/flight';

describe('flight tuning', () => {
  it('leaves the effect defaults alone in the middle of the screen', () => {
    expect(flightTuning(game.w / 2, game.w / 2)).toEqual({});
    expect(flightTuning(300, 420)).toEqual({});
  });

  it('keeps burst and curve short when a flight starts or ends beside a side edge', () => {
    const left = flightTuning(60, 360);
    const right = flightTuning(360, game.w - 40);
    for (const t of [left, right]) {
      expect(t.burstRadius?.[1]).toBeLessThan(70);
      expect(t.bulge?.[1]).toBeLessThan(60);
    }
  });

  it('reads the start of a flight from a plain point', () => {
    expect(originX({ x: 42 })).toBe(42);
  });
});
