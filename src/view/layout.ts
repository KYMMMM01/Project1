/** Battle screen layout maths. Pure: no rendering imports, unit-tested in tests/view.field.layout.test.ts. */
import { FIELD_H, FIELD_W } from '@/game/geometry';
import type { BattleLayout } from './context';

/** Height reserved for the top HUD, measured from the top safe inset. */
export const TOP_HUD_H = 168;
/** Height reserved for the bottom panel, measured up from the bottom safe inset. */
export const BOTTOM_PANEL_H = 452;

/**
 * Scene-space rectangles of one battle screen. The field sits centred in the band left between the
 * two HUD blocks: on a 1280 design height the band is 660 tall so the field is nearly flush, and on
 * taller screens the spare height is split evenly above and below it. When safe insets squeeze the
 * band below the field's height the field overlaps both blocks by the same amount (its outer lane
 * margins are empty floor, so only background is covered).
 */
export function computeBattleLayout(w: number, h: number, safeTop: number, safeBottom: number): BattleLayout {
  const band = h - safeTop - TOP_HUD_H - BOTTOM_PANEL_H - safeBottom;
  return {
    w,
    h,
    safeTop,
    safeBottom,
    fieldX: Math.round((w - FIELD_W) / 2),
    fieldY: Math.round(safeTop + TOP_HUD_H + (band - FIELD_H) / 2),
    topH: TOP_HUD_H,
    bottomH: BOTTOM_PANEL_H,
  };
}

/** Where the background art (720 x 1287) goes: centred on the field, shifted only as far as needed to cover the screen. */
export function backgroundPlacement(layout: BattleLayout, imageH: number): { y: number; gapTop: number; gapBottom: number } {
  const centred = layout.fieldY + FIELD_H / 2 - imageH / 2;
  // Cover the screen whenever the image is tall enough; otherwise stay centred and report the gaps.
  const y = imageH >= layout.h ? Math.min(0, Math.max(layout.h - imageH, centred)) : centred;
  return { y, gapTop: Math.max(0, y), gapBottom: Math.max(0, layout.h - (y + imageH)) };
}
