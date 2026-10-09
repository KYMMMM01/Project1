import { describe, expect, it } from 'vitest';
import { DODGE_MAX, DODGE_RISE, DODGE_SECONDS, dodgeAlpha, dodgeRise, dodgeScale } from '@/view/hud/DodgeSticker';

describe('the dodge sticker\'s motion', () => {
  it('rises slowing down to its full height, stays opaque until the last third of a second, and pops in from 60%', () => {
    expect(dodgeRise(0)).toBe(0);
    expect(dodgeRise(DODGE_SECONDS)).toBeCloseTo(DODGE_RISE, 9);
    expect(dodgeRise(DODGE_SECONDS / 2) - dodgeRise(0)).toBeGreaterThan(dodgeRise(DODGE_SECONDS) - dodgeRise(DODGE_SECONDS / 2));
    expect(dodgeRise(-1)).toBe(0);
    expect(dodgeRise(99)).toBeCloseTo(DODGE_RISE, 9);
    expect(dodgeAlpha(0)).toBe(1);
    expect(dodgeAlpha(DODGE_SECONDS - 0.3)).toBe(1);
    expect(dodgeAlpha(DODGE_SECONDS - 0.15)).toBeCloseTo(0.5, 9);
    expect(dodgeAlpha(DODGE_SECONDS)).toBe(0);
    expect(dodgeScale(0)).toBeCloseTo(0.6, 9);
    expect(dodgeScale(0.5)).toBe(1);
  });

  it('stays short and few: about a second, a handful at most', () => {
    expect(DODGE_SECONDS).toBeGreaterThanOrEqual(0.8);
    expect(DODGE_SECONDS).toBeLessThanOrEqual(1.4);
    expect(DODGE_MAX).toBeLessThanOrEqual(6);
  });
});
