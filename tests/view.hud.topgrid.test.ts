import { describe, expect, it } from 'vitest';
import type { BattleLayout } from '@/view/context';
import {
  BAR_H,
  CARD_H,
  CARD_W,
  cardCentre,
  COLUMN_W,
  FACE,
  gaugeWidth,
  HUD_W,
  LABEL_H,
  PREVIEW_MAX,
  previewShown,
  SIDE,
  SKULL_HALF,
  SKULL_REACH,
  skipRect,
  TOY_MAX,
  TOY_SIZE,
  toyCentre,
  toysShown,
  topRects,
} from '@/view/hud/layoutMath';

function layout(h: number, safeTop = 0): BattleLayout {
  return { w: 720, h, safeTop, safeBottom: 0, fieldX: 0, fieldY: safeTop + 168, topH: 168, bottomH: 452 };
}

const SCREENS: Array<[string, BattleLayout]> = [
  ['720 x 1280', layout(1280)],
  ['720 x 1600', layout(1600)],
  ['1280 with a 44 px inset', layout(1280, 44)],
];

describe('the top block sits on one grid', () => {
  for (const [name, l] of SCREENS) {
    describe(name, () => {
      const r = topRects(l);
      const top = l.safeTop;

      it('stacks the three rows with 8 px between every pair and ends 4 px or more inside the reserved strip', () => {
        const row1Bottom = r.pause.y + FACE / 2;
        expect(r.pause.y - FACE / 2 - top).toBe(8);
        expect(r.wave.y - row1Bottom).toBe(8);
        expect(r.timer.y - (r.wave.y + r.wave.h)).toBe(8);
        expect(top + l.topH - (r.timer.y + r.timer.h)).toBeGreaterThanOrEqual(4);
      });

      it('gives the label and the bar one column: same left edge, width and centre line, the left edge the pause paper has', () => {
        expect(r.wave.x).toBe(r.timer.x);
        expect(r.wave.w).toBe(r.timer.w);
        expect(r.wave.w).toBe(COLUMN_W);
        expect(r.wave.h).toBe(LABEL_H);
        expect(r.timer.h).toBe(BAR_H);
        expect(r.pause.x - FACE / 2).toBe(r.wave.x);
        expect(r.wave.x).toBe(SIDE);
        // the speed paper's right edge is the screen's margin on the other side
        expect(r.speed.x + FACE / 2).toBe(HUD_W - SIDE);
      });

      it('puts pause, speed and the strip on one centre line', () => {
        expect(r.pause.y).toBe(r.speed.y);
        expect(r.gauge.y + r.gauge.h / 2).toBe(r.pause.y);
      });

      it('keeps the skull 12 px from the pause paper, 12 px from the speed paper and 8 px or more above the label row', () => {
        expect(r.gauge.x - SKULL_REACH - (r.pause.x + FACE / 2)).toBeGreaterThanOrEqual(12);
        expect(r.speed.x - FACE / 2 - (r.gauge.x + r.gauge.w)).toBeGreaterThanOrEqual(12);
        expect(r.wave.y - (r.gauge.y + r.gauge.h / 2 + SKULL_HALF)).toBeGreaterThanOrEqual(8);
      });

      it('lays the cards, the shelf and the boss strip on the block between the label and the bar: same top, bottom and centre', () => {
        for (const rect of [r.preview, r.toys, r.boss]) {
          expect(rect.y).toBe(r.wave.y);
          expect(rect.y + rect.h).toBe(r.timer.y + r.timer.h);
        }
        expect(r.midY).toBe(r.wave.y + (r.timer.y + r.timer.h - r.wave.y) / 2);
        expect(CARD_H).toBe(r.preview.h);
      });

      it('leaves 8 px between the column, the cards and the shelf and ends at the screen margin', () => {
        expect(r.preview.x - (r.wave.x + r.wave.w)).toBe(8);
        expect(r.toys.x - (r.preview.x + r.preview.w)).toBe(8);
        expect(r.toys.x + r.toys.w).toBe(HUD_W - SIDE);
        // the boss strip's sticker hangs 34 px off its left end and still keeps 8 px from the countdown bar
        expect(r.boss.x - 34 - (r.timer.x + r.timer.w)).toBeGreaterThanOrEqual(8);
        expect(r.boss.x + r.boss.w).toBe(HUD_W - SIDE);
      });

      it('keeps every row of cards inside its rect with the same gap between neighbours, for one to four cards', () => {
        for (let n = 1; n <= PREVIEW_MAX; n++) {
          const xs = Array.from({ length: n }, (_, i) => cardCentre(r, i));
          expect(xs[0] - CARD_W / 2).toBe(r.preview.x);
          expect(xs[n - 1] + CARD_W / 2).toBeLessThanOrEqual(r.preview.x + r.preview.w);
          for (let i = 1; i < n; i++) expect(xs[i] - xs[i - 1] - CARD_W).toBe(6);
        }
        expect(cardCentre(r, PREVIEW_MAX - 1) + CARD_W / 2).toBe(r.preview.x + r.preview.w);
      });

      it('keeps the shelf inside its rect without touching icons, up to the slot count', () => {
        expect(toyCentre(r, 0) - TOY_SIZE / 2).toBe(r.toys.x);
        expect(toyCentre(r, TOY_MAX - 1) + TOY_SIZE / 2).toBeLessThanOrEqual(r.toys.x + r.toys.w);
        expect(toyCentre(r, 1) - toyCentre(r, 0)).toBeGreaterThanOrEqual(TOY_SIZE);
      });
    });
  }

  it('shows what fits and counts the rest in the last slot', () => {
    expect(previewShown(0)).toEqual({ cards: 0, more: 0 });
    expect(previewShown(4)).toEqual({ cards: 4, more: 0 });
    expect(previewShown(5)).toEqual({ cards: 3, more: 2 });
    expect(toysShown(5)).toEqual({ icons: 5, more: 0 });
    expect(toysShown(6)).toEqual({ icons: 4, more: 2 });
    expect(toysShown(9)).toEqual({ icons: 4, more: 5 });
  });

  it('keeps the tutorial\'s skip button in the first row, 12 px off the strip, with the label row clear below it', () => {
    for (const [, l] of SCREENS) {
      const r = topRects(l);
      for (const speedShown of [false, true]) {
        const skip = skipRect(r, speedShown);
        const face = { top: skip.y + (skip.h - FACE) / 2, bottom: skip.y + (skip.h + FACE) / 2 };
        expect(face.top).toBe(r.pause.y - FACE / 2);
        expect(r.wave.y - face.bottom).toBeGreaterThanOrEqual(8);
        expect(skip.x - (r.gauge.x + gaugeWidth(r, skip))).toBeGreaterThanOrEqual(12);
      }
    }
  });
});
