/** Battle screen layout maths. Pure: no rendering imports, unit-tested in tests/view.field.layout.test.ts. */
import { BOARD_Y, FIELD_H, FIELD_W } from '@/game/geometry';
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

/** Margin of the board's paper sheet around the 5 x 4 cells (the field draws the sheet; banners must stay clear of it). */
export const SHEET_PAD = 14;

/** Nominal heights of the two routine banner rows and the gap between them (design px). */
export const BANNER_TOP_H = 52;
export const BANNER_CAPTION_H = 40;
const BANNER_GAP = 4;
/** Room kept above the sheet for the washi tape that sticks out of its top edge. */
const BANNER_CLEAR = 8;
/** Below this the rows spill into the sheet's empty margin instead of shrinking further; they only shrink past it (to the floor) to stay off the first row of cells. */
const BANNER_MIN_SCALE = 0.8;
const BANNER_FLOOR_SCALE = 0.6;

export interface BannerSlots {
  /** Uniform scale of both rows, 1 when the band is tall enough. */
  scale: number;
  /** Scene-space y of the centre of the wave label row and of the caption row under it. */
  topY: number;
  captionY: number;
}

/**
 * Where the routine banners (wave label, synergy, toys, boss captions) sit: in the free band between
 * the top HUD and the board's sheet, flush against the sheet, so they never cover a cat or a cell. The
 * band is 88 px on a 1280 screen and grows on taller ones; when it is shorter than both rows the rows
 * shrink to fit, and below the minimum scale they spill into the sheet's empty margin (the first cell
 * starts one margin below the sheet's edge).
 */
export function bannerSlots(l: BattleLayout): BannerSlots {
  const bandTop = l.safeTop + l.topH;
  const need = BANNER_TOP_H + BANNER_GAP + BANNER_CAPTION_H;
  const fitTo = (bottom: number): number => (bottom - bandTop) / need;
  const bandBottom = l.fieldY + BOARD_Y - SHEET_PAD - BANNER_CLEAR;
  const roomy = fitTo(bandBottom);
  const scale = roomy >= BANNER_MIN_SCALE ? Math.min(1, roomy) : Math.min(BANNER_MIN_SCALE, Math.max(BANNER_FLOOR_SCALE, fitTo(l.fieldY + BOARD_Y)));
  const used = need * scale;
  const top = Math.max(bandTop, bandBottom - used);
  return {
    scale,
    topY: top + (BANNER_TOP_H * scale) / 2,
    captionY: top + (BANNER_TOP_H + BANNER_GAP) * scale + (BANNER_CAPTION_H * scale) / 2,
  };
}

/** Where the background art (720 x 1287) goes: centred on the field, shifted only as far as needed to cover the screen. */
export function backgroundPlacement(layout: BattleLayout, imageH: number): { y: number; gapTop: number; gapBottom: number } {
  const centred = layout.fieldY + FIELD_H / 2 - imageH / 2;
  // Cover the screen whenever the image is tall enough; otherwise stay centred and report the gaps.
  const y = imageH >= layout.h ? Math.min(0, Math.max(layout.h - imageH, centred)) : centred;
  return { y, gapTop: Math.max(0, y), gapBottom: Math.max(0, layout.h - (y + imageH)) };
}
