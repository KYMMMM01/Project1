import { describe, expect, it } from 'vitest';
import { SUN_SPEED } from '@/game';
import { sunBonusPercent } from '@/view/field/sunMath';

describe('the sunbeam bonus a cell announces', () => {
  it('is the base attack speed, and a toy that adds to it is counted', () => {
    expect(sunBonusPercent([])).toBe(Math.round(SUN_SPEED * 100));
    expect(sunBonusPercent([])).toBe(20);
    expect(sunBonusPercent(['sunny_spot'])).toBe(30);
    expect(sunBonusPercent(['batteries', 'sunny_spot'])).toBe(30);
  });
});
