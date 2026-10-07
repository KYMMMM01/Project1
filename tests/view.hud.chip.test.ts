import { describe, expect, it } from 'vitest';
import { CHIP_FADE, CHIP_GAP, CHIP_H, CHIP_MAX, CHIP_SECONDS, CHIP_YIELD, chipAlpha, chipLifeLeft, chipRays, chipRise, chipScale, chipWidth } from '@/view/hud/chipMath';

describe('the summon result chip', () => {
  it('stays about a second and a half and fades only at the end', () => {
    expect(CHIP_SECONDS).toBeGreaterThanOrEqual(1.4);
    expect(CHIP_SECONDS).toBeLessThanOrEqual(1.6);
    expect(chipAlpha(CHIP_SECONDS)).toBe(1);
    expect(chipAlpha(CHIP_FADE)).toBe(1);
    expect(chipAlpha(CHIP_FADE / 2)).toBeCloseTo(0.5, 5);
    expect(chipAlpha(0)).toBe(0);
  });

  it('grows with every rank, and only the higher ranks get rays behind it', () => {
    for (let tier = 1; tier <= 4; tier++) expect(chipScale(tier)).toBeGreaterThan(chipScale(tier - 1));
    expect(chipScale(0)).toBe(1);
    expect(chipScale(-3)).toBe(1);
    expect(chipScale(99)).toBe(chipScale(4));
    expect([0, 1, 2, 3, 4].map(chipRays)).toEqual([0, 0, 1, 2, 2]);
  });

  it('keeps the plate readable for a short name and inside the screen for a long one', () => {
    expect(chipWidth(10)).toBe(250);
    expect(chipWidth(5000)).toBe(420);
    expect(chipWidth(150)).toBeGreaterThan(250);
  });

  it('stacks the newest nearest the button and makes the older ones leave sooner', () => {
    expect(chipRise(0)).toBe(0);
    expect(chipRise(1)).toBe(-(CHIP_H + CHIP_GAP));
    expect(chipRise(2)).toBeLessThan(chipRise(1));
    expect(CHIP_MAX).toBeGreaterThanOrEqual(2);
    expect(chipLifeLeft(1.2, 0)).toBe(1.2);
    expect(chipLifeLeft(1.2, 1)).toBe(CHIP_YIELD);
    expect(chipLifeLeft(0.3, 2)).toBe(0.3);
  });
});
