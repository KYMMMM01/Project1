import { afterEach, describe, expect, it } from 'vitest';
import { LEAN_AFTER_ENDS, LEAN_RESOLUTION, LEAN_WINDOW_MS, NORMAL_RESOLUTION, decideLean, leanMode, leanVerdict, maxResolution, startLean } from '@/core/lean';

describe('deciding the lean mode', () => {
  it('is off for a device that has never lost its page, and for one that did once', () => {
    expect(decideLean(0, null).lean).toBe(false);
    expect(decideLean(LEAN_AFTER_ENDS - 1, null).lean).toBe(false);
  });

  it('is on after two ends under the player, and says why', () => {
    const v = decideLean(LEAN_AFTER_ENDS, null);
    expect(v.lean).toBe(true);
    expect(v.reason).toContain('2 ends');
    expect(decideLean(7, '').lean).toBe(true);
  });

  it('can be forced on and off from the address, whatever the trail says', () => {
    expect(decideLean(0, '1')).toEqual({ lean: true, reason: 'forced on by ?lean=1' });
    expect(decideLean(9, '0')).toEqual({ lean: false, reason: 'forced off by ?lean=0' });
    expect(decideLean(0, 'yes').lean).toBe(false);
  });

  it('counts the ends of a day', () => {
    expect(LEAN_WINDOW_MS).toBe(24 * 3600 * 1000);
  });
});

describe('the mode of this page', () => {
  afterEach(() => {
    startLean(0, '');
  });

  it('is what the start decided, and draws less densely when lean', () => {
    startLean(0, '');
    expect(leanMode()).toBe(false);
    expect(maxResolution()).toBe(NORMAL_RESOLUTION);
    startLean(3, '?debug=1');
    expect(leanMode()).toBe(true);
    expect(leanVerdict().lean).toBe(true);
    expect(maxResolution()).toBe(LEAN_RESOLUTION);
    expect(LEAN_RESOLUTION).toBeLessThan(NORMAL_RESOLUTION);
    startLean(0, '?lean=1');
    expect(leanMode()).toBe(true);
  });
});
