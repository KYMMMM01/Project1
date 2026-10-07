import { describe, expect, it } from 'vitest';
import type { BattleLayout } from '@/view/context';
import { bottomRects, FACE, fitScale, gaugeWidth, PICK, pickCardX, pickHand, SKIP_FACE, SKIP_H, SKIP_W, skipRect, topRects } from '@/view/hud/layoutMath';

function layout(h: number, safeTop = 0, safeBottom = 0): BattleLayout {
  const slack = Math.round((h - safeTop - safeBottom - 168 - 452 - 624) / 2);
  return { w: 720, h, safeTop, safeBottom, fieldX: 0, fieldY: safeTop + 168 + slack, topH: 168, bottomH: 452 };
}

describe('the skip button in the top row', () => {
  for (const speedShown of [false, true]) {
    it(`never touches the enemy strip, the pause button or the speed button (speed ${speedShown ? 'out' : 'not yet out'})`, () => {
      for (const h of [1280, 1600]) {
        const r = topRects(layout(h, 40));
        const skip = skipRect(r, speedShown);
        const strip = { x: r.gauge.x, w: gaugeWidth(r, skip) };
        expect(skip.w).toBe(SKIP_W);
        expect(skip.h).toBe(SKIP_H);
        // The strip ends at least a button-gap short of the skip button, and the skull sticker still has its room on the left.
        expect(skip.x - (strip.x + strip.w)).toBeGreaterThanOrEqual(12);
        // Beside the speed button once it is out (its slot is 88 wide), else in its slot; never past the screen's side margin.
        if (speedShown) expect(r.speed.x - 44 - (skip.x + skip.w)).toBeGreaterThanOrEqual(12);
        expect(skip.x + skip.w).toBeLessThanOrEqual(720 - 16);
        expect(skip.x).toBeGreaterThan(r.pause.x + FACE / 2);
        // It stays in the first row: the second row's strips are free of it.
        expect(skip.y).toBeGreaterThanOrEqual(r.area.y);
        expect(skip.y + (skip.h + SKIP_FACE) / 2).toBeLessThanOrEqual(r.wave.y - 8);
      }
    });
  }

  it('leaves the strip room for its count: at least 300 px even beside the speed button', () => {
    const r = topRects(layout(1280));
    expect(gaugeWidth(r, skipRect(r, true))).toBeGreaterThanOrEqual(300);
    expect(gaugeWidth(r, skipRect(r, false))).toBeGreaterThan(gaugeWidth(r, skipRect(r, true)));
  });

  it('gives the whole strip back when the button is gone', () => {
    const r = topRects(layout(1280));
    expect(gaugeWidth(r, null)).toBe(r.gauge.w);
  });
});

describe('bottom panel', () => {
  it('anchors on the SUMMON button and stacks every row above it', () => {
    const r = bottomRects(layout(1280));
    expect(r.summonY).toBe(354);
    expect(r.chipsY).toBeLessThan(r.currencyY);
    expect(r.currencyY).toBeLessThan(r.utilY);
    expect(r.utilY).toBeLessThan(r.summonY);
    // the 140 px button plus its lip stays inside the panel
    expect(r.summonY + 70 + 15).toBeLessThanOrEqual(452);
  });

  it('respects the home-indicator inset and extends the plate to the screen edge', () => {
    const l = layout(1600, 0, 62);
    const r = bottomRects(l);
    expect(r.top).toBe(1600 - 62 - 452);
    expect(r.panel.y + r.panel.h).toBe(1600);
    expect(r.top + r.summonY + 85).toBeLessThanOrEqual(1600 - 62);
  });

  it('gives the selection sheet room above the SUMMON button', () => {
    const r = bottomRects(layout(1280));
    expect(r.sheet.y + r.sheet.h).toBeLessThanOrEqual(r.summonY - 70);
    expect(r.sheet.h).toBeGreaterThanOrEqual(262);
  });

  it('keeps chips, currency and utility rows at least 86 apart so touch targets barely overlap', () => {
    const r = bottomRects(layout(1280));
    expect(r.currencyY - r.chipsY).toBeGreaterThanOrEqual(86);
    expect(r.utilY - r.currencyY).toBeGreaterThanOrEqual(86);
  });
});

describe('sell strip', () => {
  it('reaches up toward the field sell line and ends 112 px into the panel', () => {
    const tall = layout(1600);
    const r = bottomRects(tall);
    // tall screens: the strip reaches at most 120 px above the panel, the field's bottom edge is farther
    expect(tall.fieldY + 624).toBeLessThan(r.top - 120);
    expect(r.sell.y).toBe(-120);
    expect(r.sell.y + r.sell.h).toBe(112);
    const tight = layout(1280);
    const t = bottomRects(tight);
    expect(t.sell.y + t.top).toBe(tight.fieldY + 624);
    expect(t.sell.y + t.sell.h).toBe(112);
  });
});

describe('boss strip', () => {
  it('replaces the preview and toy area of the second row and never reaches the field', () => {
    for (const h of [1280, 1600]) {
      const l = layout(h);
      const r = topRects(l);
      expect(r.boss.x).toBeGreaterThanOrEqual(r.wave.x + r.wave.w);
      expect(r.boss.x + r.boss.w).toBeLessThanOrEqual(720);
      expect(r.boss.y + r.boss.h).toBeLessThanOrEqual(l.safeTop + l.topH);
      expect(r.timer.x + r.timer.w).toBeLessThanOrEqual(r.boss.x);
      // the boss sticker overhangs the strip's left end by about 34 px and must not land on the countdown bar
      expect(r.timer.x + r.timer.w + 8).toBeLessThanOrEqual(r.boss.x - 34);
    }
  });
});

describe('helpers', () => {
  it('fits popups to short screens and never enlarges them', () => {
    expect(fitScale(700, 1400, 720, 1280)).toBeLessThan(1);
    expect(fitScale(400, 400, 720, 1280)).toBe(1);
    expect(fitScale(700, 1400, 720, 1280) * 1400).toBeLessThanOrEqual(1280 - 48);
  });
});

describe('the pointing hand of the pick of three', () => {
  for (const n of [3, 2]) {
    for (let i = 0; i < n; i++) {
      it(`on card ${i + 1} of ${n} covers no card text and no part of the sub line`, () => {
        const { tip, body } = pickHand(i, n);
        // The fingertip is on the recommended card's photo, inside its own width.
        const cx = pickCardX(i, n);
        expect(Math.abs(tip.x - cx)).toBeLessThan((220 * PICK.scale) / 2);
        expect(tip.y).toBeGreaterThan(PICK.cardY - PICK.frameHalf);
        // Every card's name, class line and "merges into" lines sit below its photo frame: the hand ends at the fingertip, above them.
        const textTop = PICK.cardY + PICK.frameHalf - 60;
        expect(body.y + body.h).toBeLessThanOrEqual(textTop);
        // The sub line above the cards is clear of the hand's body, whatever its width.
        const subBottom = PICK.subY + PICK.subHalf;
        expect(body.y).toBeGreaterThan(subBottom);
        const subLeft = PICK.w / 2 - PICK.subW / 2;
        const subRight = PICK.w / 2 + PICK.subW / 2;
        const overlapsSubColumns = body.x < subRight && body.x + body.w > subLeft;
        if (overlapsSubColumns) expect(body.y).toBeGreaterThan(subBottom);
        // And it stays inside the sheet.
        expect(body.x).toBeGreaterThanOrEqual(0);
        expect(body.x + body.w).toBeLessThanOrEqual(PICK.w);
      });
    }
  }
});
