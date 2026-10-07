import { describe, expect, it } from 'vitest';
import { FIELD_H } from '@/game/geometry';
import { placeCard, overlapArea } from '@/view/hud/bubbleMath';
import {
  CHIP_CEIL_GAP, CHIP_FADE, CHIP_GAP, CHIP_H, CHIP_HALF_W, CHIP_MAX, CHIP_SECONDS, CHIP_YIELD, chipAlpha, chipCeiling, chipColumn, chipFits, chipLifeLeft, chipRays, chipRise,
  chipScale, chipTop, chipWidth,
} from '@/view/hud/chipMath';
import { bottomRects, type Rect } from '@/view/hud/layoutMath';
import { computeBattleLayout } from '@/view/layout';

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

/** Where each chip of a stack lies (scene space) for chip width `w`. */
function chipRect(originY: number, slot: number, tier: number, w: number): Rect {
  const scale = chipScale(tier);
  return { x: 360 - (w * scale) / 2, y: chipTop(originY, slot, scale), w: w * scale, h: CHIP_H * scale };
}

describe('result chips make way for what lies over them', () => {
  const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

  it('has no ceiling when nothing lies over the column, or only off to its side or below the first slot', () => {
    expect(chipCeiling(1000, 360, null, null, null, null)).toBeNull();
    expect(chipCeiling(1000, 360, rect(0, 800, 140, 100), null, null, null)).toBeNull();
    expect(chipCeiling(1000, 360, rect(580, 800, 140, 100), null, null, null)).toBeNull();
    expect(chipCeiling(1000, 360, rect(100, 1100, 500, 100), null, null, null)).toBeNull();
  });

  it('takes the lowest bottom edge of the note, the card, the sticker and the class chips that lie over it', () => {
    expect(chipCeiling(1000, 360, rect(14, 820, 620, 130), null, null, null)).toBe(950);
    expect(chipCeiling(1000, 360, rect(14, 820, 620, 130), rect(0, 700, 720, 300), null, null)).toBe(1000);
    expect(chipCeiling(1000, 360, null, null, rect(150, 900, 200, 60), rect(0, 700, 720, 92))).toBe(960);
    expect(chipCeiling(1000, 360, null, null, null, rect(0, 700, 720, 92))).toBe(792);
  });

  it('fits a chip only when its top edge is clear of the ceiling by the gap', () => {
    const top = chipTop(1000, 0, 1);
    expect(chipFits(1000, 0, 1, null)).toBe(true);
    expect(chipFits(1000, 0, 1, top - CHIP_CEIL_GAP)).toBe(true);
    expect(chipFits(1000, 0, 1, top - CHIP_CEIL_GAP + 1)).toBe(false);
    // A bigger rank is taller and needs more room; a higher slot sits higher.
    expect(chipTop(1000, 0, chipScale(4))).toBeLessThan(top);
    expect(chipTop(1000, 1, 1)).toBeLessThan(top);
  });

  it('keeps every chip of every rank off a lesson note, wherever the lesson puts it, on a short and a tall screen', () => {
    // The targets a lesson can point at, as rectangles of the real layout: a card over the board for a bottom control, over the sheet for the rest.
    for (const h of [1280, 1600]) {
      const l = computeBattleLayout(720, h, 0, 0);
      const rows = bottomRects(l);
      const originY = rows.top + rows.summonY - 112;
      const boardBottom = l.fieldY + FIELD_H;
      const bounds: Rect = { x: 0, y: 14, w: 720, h: h - 28 };
      const targets: Rect[] = [
        rect(210, rows.top + rows.summonY - 70, 300, 140), // summon
        rect(20, rows.top + rows.chipsY - 44, 680, 88), // class chips
        rect(90, l.fieldY + 88, 216, 224), // a pair on the board
        rect(150, 60, 440, 58), // the enemy strip
        rect(16, 100, 430, 80), // wave label and preview
        rect(640, 40, 88, 88), // speed
      ];
      for (const target of targets) {
        for (const noteH of [132, 170, 230]) {
          const fit = placeCard({ target, w: 620, h: noteH, bounds, arrow: 22, panelTop: rows.top, boardBottom });
          const note: Rect = { x: fit.x, y: fit.y, w: 620, h: noteH };
          const ceiling = chipCeiling(originY, 360, note, null, null, null);
          for (let tier = 0; tier < 5; tier++) {
            for (let slot = 0; slot < CHIP_MAX; slot++) {
              if (!chipFits(originY, slot, chipScale(tier), ceiling)) continue;
              expect(overlapArea(chipRect(originY, slot, tier, 420), note)).toBe(0);
            }
          }
        }
      }
    }
  });

  it('keeps the chips off the class chips row too: at most two high while it is out, three when it is not', () => {
    const l = computeBattleLayout(720, 1280, 0, 0);
    const rows = bottomRects(l);
    const originY = rows.top + rows.summonY - 112;
    const row: Rect = { x: 0, y: rows.top + rows.chipsY - 46, w: 720, h: 92 };
    const deepest = (ceiling: number | null): number => {
      let n = 0;
      while (n < CHIP_MAX && chipFits(originY, n, 1, ceiling)) n++;
      return n;
    };
    expect(deepest(chipCeiling(originY, 360, null, null, null, row))).toBe(2);
    expect(deepest(chipCeiling(originY, 360, null, null, null, null))).toBe(3);
    // And the widest chip stays inside the screen.
    expect(chipColumn(originY, 360).x).toBeGreaterThanOrEqual(0);
    expect(chipColumn(originY, 360).w).toBe(CHIP_HALF_W * 2);
  });
});
