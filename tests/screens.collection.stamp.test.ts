import { describe, expect, it } from 'vitest';
import { stageScale, stageX } from '../src/screens/shop/cardMotion';
import { PLATE, stampFrom, stampSpot, STAMP_NEAR } from '../src/screens/shop/revealPlan';

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const SCREEN_W = 720;
/** The stamp's rest box on the plate, unrotated, for a word `w` wide and the stamp `h` tall (size 18, pad 12). */
const STAMP_H = Math.round(18 * 1.15) + 12;
const meets = (a: Box, b: Box): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

function stampBox(half: number, outer: 1 | -1, scale = 1): Box {
  const at = stampSpot(half, outer);
  // The tilt (0.2 rad) lifts a corner by half the width times its sine at most: a few units.
  const lift = (half * Math.sin(0.2)) / 2 + (STAMP_H / 2) * Math.cos(0.2);
  const near = at.x - outer * half * scale;
  const far = at.x + outer * half * scale;
  return { x0: Math.min(near, far), x1: Math.max(near, far), y0: at.y - lift * scale, y1: at.y + lift * scale };
}

/** What else is on a card (plate units from its centre): the count pill, the slap tape (its tilted box, generously), the tag of a "Wild" stack. */
const COUNT: Box = { x0: -44, x1: 44, y0: PLATE.h / 2 - 38, y1: PLATE.h / 2 };
const TAPE: Box = { x0: -PLATE.w / 2 - 8, x1: -PLATE.w / 2 + PLATE.w * 0.16 + 36, y0: -PLATE.h / 2 - 30, y1: -PLATE.h / 2 + 40 };
const WILD_TAG: Box = { x0: PLATE.w / 2 - 70, x1: PLATE.w / 2, y0: -PLATE.h / 2 + 4, y1: -PLATE.h / 2 + 36 };
/** The cat's face is up and in the middle of the photo: the middle half of the window's width. */
const FACE: Box = { x0: -PLATE.w * 0.25, x1: PLATE.w * 0.25, y0: -PLATE.h / 2, y1: PLATE.h * 0.1 };

// Half the stamp's width for a one, two, three and four letter rarity name at size 18 (a letter is 18 px wide) with 12 px of pad each side.
describe.each([(18 + 24) / 2, (36 + 24) / 2, (54 + 24) / 2, (72 + 24) / 2])('the rarity stamp, half its width %d', (half) => {
  it.each([1, -1] as const)('lands on the photo\'s outer side %d: clear of the face, the count, the tape and the "Wild" tag', (outer) => {
    const box = stampBox(half, outer);
    for (const other of [COUNT, TAPE, WILD_TAG, FACE]) {
      expect(meets(box, other)).toBe(false);
    }
  });

  it('puts its near edge a quarter of the plate in from the middle, level with it', () => {
    expect(Math.abs(stampSpot(half, 1).x) - half).toBeCloseTo(PLATE.w * STAMP_NEAR, 6);
    expect(stampSpot(half, -1).x).toBe(-stampSpot(half, 1).x);
    expect(Math.abs(stampSpot(half, 1).y)).toBeLessThan(PLATE.h * 0.1);
  });

  it('stays on the screen at rest and as it slams down, for a card alone and for two side by side', () => {
    for (const n of [1, 2]) {
      const ss = stageScale(n);
      for (let j = 0; j < n; j++) {
        const outer = n > 1 && j === 0 ? -1 : 1;
        const x = stageX(n, j, SCREEN_W / 2);
        const room = (outer > 0 ? SCREEN_W - x : x) / ss;
        const from = stampFrom(room, half, 1.5);
        expect(from).toBeGreaterThanOrEqual(1);
        expect(from).toBeLessThanOrEqual(1.5);
        for (const scale of [1, from]) {
          const box = stampBox(half, outer, scale);
          expect(x + box.x0 * ss).toBeGreaterThanOrEqual(0);
          expect(x + box.x1 * ss).toBeLessThanOrEqual(SCREEN_W);
        }
      }
    }
  });
});

describe('how big a stamp may arrive', () => {
  it('is the asked-for size when there is room, and less when the screen is near, never below its own size', () => {
    expect(stampFrom(1000, 40, 1.5)).toBe(1.5);
    expect(stampFrom(PLATE.w * STAMP_NEAR + 2 * 40 + 8, 40, 1.5)).toBeCloseTo(1.2, 6);
    expect(stampFrom(0, 40, 1.5)).toBe(1);
  });
});
