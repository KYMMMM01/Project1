import { describe, expect, it } from 'vitest';
import { FIELD_H, FIELD_W } from '@/game/geometry';
import { BOTTOM_PANEL_H, TOP_HUD_H, backgroundPlacement, computeBattleLayout } from '@/view/layout';

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
