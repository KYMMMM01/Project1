import { describe, expect, it } from 'vitest';
import { BOARD_Y, FIELD_H, FIELD_W } from '@/game/geometry';
import { BANNER_CAPTION_H, BANNER_TOP_H, BOTTOM_PANEL_H, SHEET_PAD, TOP_HUD_H, backgroundPlacement, bannerSlots, computeBattleLayout } from '@/view/layout';

describe('battle layout', () => {
  it('sits the field nearly flush on the shortest design height', () => {
    const l = computeBattleLayout(720, 1280, 0, 0);
    expect(l.fieldX).toBe(0);
    expect(l.topH).toBe(TOP_HUD_H);
    expect(l.bottomH).toBe(BOTTOM_PANEL_H);
    const above = l.fieldY - TOP_HUD_H;
    const below = 1280 - BOTTOM_PANEL_H - (l.fieldY + FIELD_H);
    expect(above).toBeGreaterThanOrEqual(0);
    expect(above).toBeLessThanOrEqual(24);
    expect(Math.abs(above - below)).toBeLessThanOrEqual(1);
  });

  it('splits spare height evenly above and below on taller screens', () => {
    const l = computeBattleLayout(720, 1600, 0, 0);
    const above = l.fieldY - TOP_HUD_H;
    const below = 1600 - BOTTOM_PANEL_H - (l.fieldY + FIELD_H);
    expect(Math.abs(above - below)).toBeLessThanOrEqual(1);
    expect(above).toBeGreaterThan(100);
  });

  it('keeps the HUD blocks inside the safe insets', () => {
    const l = computeBattleLayout(720, 1500, 47, 34);
    expect(l.fieldY).toBeGreaterThanOrEqual(47 + TOP_HUD_H);
    expect(l.fieldY + FIELD_H).toBeLessThanOrEqual(1500 - 34 - BOTTOM_PANEL_H);
    expect(l.safeTop).toBe(47);
    expect(l.safeBottom).toBe(34);
  });

  it('overlaps both HUD blocks equally when the safe insets leave no room', () => {
    const l = computeBattleLayout(720, 1280, 60, 40);
    const overTop = 60 + TOP_HUD_H - l.fieldY;
    const overBottom = l.fieldY + FIELD_H - (1280 - 40 - BOTTOM_PANEL_H);
    expect(overTop).toBeGreaterThan(0);
    expect(Math.abs(overTop - overBottom)).toBeLessThanOrEqual(1);
  });

  it('centres the field horizontally when the design is wider than the field', () => {
    expect(computeBattleLayout(800, 1280, 0, 0).fieldX).toBe((800 - FIELD_W) / 2);
  });
});

describe('background placement', () => {
  it('covers the whole screen when the art is tall enough', () => {
    const l = computeBattleLayout(720, 1280, 0, 0);
    const p = backgroundPlacement(l, 1287);
    expect(p.y).toBeLessThanOrEqual(0);
    expect(p.y + 1287).toBeGreaterThanOrEqual(1280);
    expect(p.gapTop).toBe(0);
    expect(p.gapBottom).toBe(0);
  });

  it('stays centred on the field and reports the gaps when the screen is taller than the art', () => {
    const l = computeBattleLayout(720, 1600, 0, 0);
    const p = backgroundPlacement(l, 1287);
    expect(p.gapTop).toBeGreaterThan(0);
    expect(p.gapBottom).toBeGreaterThan(0);
    expect(Math.abs(p.y + 1287 / 2 - (l.fieldY + FIELD_H / 2))).toBeLessThanOrEqual(1);
    expect(p.gapTop + p.gapBottom + 1287).toBe(1600);
  });
});

describe('routine banner slots', () => {
  const rows = (h: number, safeTop = 0, safeBottom = 0): { l: ReturnType<typeof computeBattleLayout>; s: ReturnType<typeof bannerSlots> } => {
    const l = computeBattleLayout(720, h, safeTop, safeBottom);
    return { l, s: bannerSlots(l) };
  };
  /** Top and bottom edge of the two rows. */
  const extent = (s: ReturnType<typeof bannerSlots>): { top: number; bottom: number } => ({
    top: s.topY - (BANNER_TOP_H * s.scale) / 2,
    bottom: s.captionY + (BANNER_CAPTION_H * s.scale) / 2,
  });

  it('puts both rows between the top HUD and the sheet on a 1280 screen, shrunk to fit', () => {
    const { l, s } = rows(1280);
    const e = extent(s);
    expect(e.top).toBeGreaterThanOrEqual(l.safeTop + l.topH);
    expect(e.bottom).toBeLessThanOrEqual(l.fieldY + BOARD_Y - SHEET_PAD);
    expect(s.scale).toBeGreaterThanOrEqual(0.8);
    expect(s.scale).toBeLessThan(1);
    expect(s.captionY).toBeGreaterThan(s.topY);
  });

  it('keeps the nominal size and hugs the sheet when the band is tall', () => {
    const { l, s } = rows(1600);
    const e = extent(s);
    expect(s.scale).toBe(1);
    expect(e.top).toBeGreaterThan(l.safeTop + l.topH);
    expect(l.fieldY + BOARD_Y - SHEET_PAD - e.bottom).toBeLessThan(12);
  });

  it('spills only into the sheet margin when the insets squeeze the band, and shrinks further rather than reach a cell', () => {
    const tight = rows(1280, 40, 20);
    expect(tight.s.scale).toBeGreaterThanOrEqual(0.6);
    expect(extent(tight.s).top).toBeGreaterThanOrEqual(tight.l.safeTop + tight.l.topH);
    expect(extent(tight.s).bottom).toBeLessThanOrEqual(tight.l.fieldY + BOARD_Y);
    const squeezed = rows(1280, 60, 40);
    expect(squeezed.s.scale).toBe(0.6);
    expect(extent(squeezed.s).top).toBeGreaterThanOrEqual(squeezed.l.safeTop + squeezed.l.topH);
  });
});
