/**
 * The compact paper photo frame the cats line and the chest reveal share: a cream border, a mat in the rarity colour,
 * a window for the picture and the ornaments that pile up with the tier (dashed line, corner mounts, tape, gold
 * star), so a rarity can be told without colour. It is built like the unit card (`@/ui` CardFrame) from one cut
 * outline: the layers inside keep their insets on every side and the photo corners cannot leave the mat.
 * Geometry is baked once per plate.
 */
import { Container, Graphics } from 'pixi.js';
import { cacheStatic, drawDashRuns, drawFrameLayers, frameOrnaments, plateBadgeBox, plateGeometry, ringRuns, type RarityId } from '@/ui';

export interface PlateOpts {
  /** Outer size; origin = centre. */
  w: number;
  h: number;
  /** Height of the mat (the rarity-coloured part); the rest below it is cream. */
  matH: number;
  rarity: RarityId;
  /** 0 common ... 4 mythic. */
  tier: number;
}

export interface Plate {
  /** The paper: border, mat, window, dashed line and corner mounts. Cached. */
  base: Graphics;
  /** Tape and star, to sit above the picture. */
  over: Container;
  /** The picture window, relative to the plate's centre. */
  win: { x: number; y: number; w: number; h: number };
  /** Where the level pill of size (w, h) goes on this plate (its width is cut to the window's). */
  badgeAt(w: number, h: number): { x: number; y: number; w: number; h: number };
  /** The dashed selection ring `gap` px outside the plate's cut edge, parallel to it, drawn into `g` in `color`. */
  ring(g: Graphics, gap: number, color: number, width: number): void;
}

export function buildPlate(o: PlateOpts): Plate {
  const geo = plateGeometry(o.w, o.h, o.matH);
  const g = new Graphics();
  drawFrameLayers(g, geo, o.rarity, 5);
  cacheStatic(g);
  return {
    base: g,
    over: frameOrnaments(geo, o.rarity),
    win: { ...geo.windowRect },
    badgeAt: (w, h) => plateBadgeBox(geo, w, h),
    ring: (ring, gap, color, width) => drawDashRuns(ring, ringRuns(geo, gap, 16, 11), { color, width }),
  };
}
