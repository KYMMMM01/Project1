import { describe, expect, it } from 'vitest';
import { NAME_SIZE, nameSizeFor } from '@/fx/cutin';
import { MIN_FONT } from '@/ui/theme';

/** The cut-in's name label: 380 px of paper with 26 on each side, its text shrinking to 0.7 of its size before an ellipsis cuts it. */
const ROOM = (380 - 2 * 26) / 0.7;

describe('the cut-in name size (a long skill name must not be cut with an ellipsis)', () => {
  it('a name the label can shrink to fit keeps the normal size', () => {
    for (const width of [0, 120, 300, 380, ROOM]) expect(nameSizeFor(width)).toBe(NAME_SIZE);
  });

  it('a longer name starts smaller, in proportion to how much longer it is', () => {
    const wide = nameSizeFor(ROOM * 1.2);
    expect(wide).toBeLessThan(NAME_SIZE);
    expect(wide).toBe(Math.floor((NAME_SIZE * ROOM) / (ROOM * 1.2)));
    expect(nameSizeFor(ROOM * 1.4)).toBeLessThan(wide);
  });

  it('after the label\'s own shrink (never below 0.7) the line fits: size x width/NAME_SIZE x 0.7 is within the paper', () => {
    for (const width of [ROOM * 1.01, ROOM * 1.2, ROOM * 1.3]) {
      const size = nameSizeFor(width);
      const lineAtSize = (width * size) / NAME_SIZE;
      expect(lineAtSize * 0.7).toBeLessThanOrEqual(380 - 2 * 26 + 1);
    }
  });

  it('never goes below the smallest font the UI allows, and bad numbers fall back to the normal size', () => {
    expect(nameSizeFor(100000)).toBe(MIN_FONT);
    expect(nameSizeFor(Number.NaN)).toBe(NAME_SIZE);
  });
});
