import { describe, expect, it } from 'vitest';
import type { BattleLayout } from '@/view/context';
import { bottomRects, fitScale, slotCentre, slotWidth, topRects } from '@/view/hud/layoutMath';

function layout(h: number, safeTop = 0, safeBottom = 0): BattleLayout {
  const slack = Math.round((h - safeTop - safeBottom - 168 - 452 - 624) / 2);
  return { w: 720, h, safeTop, safeBottom, fieldX: 0, fieldY: safeTop + 168 + slack, topH: 168, bottomH: 452 };
}

describe('top area', () => {
  it('keeps both rows inside the 168 px strip at every height', () => {
    for (const h of [1280, 1600]) {
      const l = layout(h, 40);
      const r = topRects(l);
      expect(r.area).toEqual({ x: 0, y: 40, w: 720, h: 168 });
      expect(r.pause.y).toBeGreaterThan(40);
      expect(r.row2Y).toBeLessThan(40 + 168);
      expect(r.gauge.y).toBeGreaterThanOrEqual(40);
    }
  });

  it('puts pause on the left, speed on the right and the gauge between them with room to spare', () => {
    const r = topRects(layout(1280));
    expect(r.pause.x).toBeLessThan(r.gauge.x);
    expect(r.speed.x).toBeGreaterThan(r.gauge.x + r.gauge.w);
    // the gauge's round icon hangs 43 px off its left end
    expect(r.gauge.x - 43 - (r.pause.x + 38)).toBeGreaterThanOrEqual(4);
    expect(r.speed.x - 38 - (r.gauge.x + r.gauge.w)).toBeGreaterThanOrEqual(8);
  });

  it('does not overlap the three strips of the second row', () => {
    const r = topRects(layout(1280));
    expect(r.wave.x + r.wave.w).toBeLessThanOrEqual(r.preview.x);
    expect(r.preview.x + r.preview.w).toBeLessThanOrEqual(r.toys.x);
    expect(r.toys.x + r.toys.w).toBeLessThanOrEqual(720);
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
      expect(r.timer.x + r.timer.w).toBeLessThanOrEqual(r.boss.x - 34);
    }
  });

  it('keeps the countdown bar clear of the pause button and under the phase label row', () => {
    const r = topRects(layout(1280));
    expect(r.timer.h).toBeGreaterThanOrEqual(34);
    expect(r.timer.y + r.timer.h).toBeLessThanOrEqual(r.area.y + r.area.h);
    expect(r.timer.y).toBeGreaterThan(r.pause.y + 38);
  });
});

describe('strip helpers', () => {
  it('shrinks slots to fit and centres them', () => {
    expect(slotWidth(4, 208, 64)).toBe(52);
    expect(slotWidth(2, 208, 64)).toBe(64);
    expect(slotWidth(0, 208, 64)).toBe(64);
    expect(slotCentre(0, 52, 236)).toBe(262);
    expect(slotCentre(3, 52, 236)).toBe(236 + 52 * 3.5);
  });

  it('fits popups to short screens and never enlarges them', () => {
    expect(fitScale(700, 1400, 720, 1280)).toBeLessThan(1);
    expect(fitScale(400, 400, 720, 1280)).toBe(1);
    expect(fitScale(700, 1400, 720, 1280) * 1400).toBeLessThanOrEqual(1280 - 48);
  });
});
