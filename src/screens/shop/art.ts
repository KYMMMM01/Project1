/**
 * Picture helpers shared by the cats and shop screens. Every image is looked up by key and has a drawn
 * fallback, so a missing or re-drawn asset never leaves a hole and the art can be replaced freely.
 */
import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { hasTex, tex } from '@/core/assets';
import { mixColor } from '@/core/math';
import type { UnitId } from '@/game/api';
import { unitClass } from '@/game/data/roster';
import type { BundlePart } from '@/meta/bundle';
import type { ChestKind } from '@/meta/types';
import { RARITY_OF } from '@/meta/units';
import { cacheStatic, Color, currencyIcon, drawIcon, drawPaper, Rarity, type RarityId } from '@/ui';
import { partPicture } from '../partPicture';
import { classIcon, unitKey } from './keys';

/**
 * Fit a texture into a square of `size` around the origin. The sprite sits in a container so the fit stays its own
 * scale: a caller that scales the picture (a flying icon) would otherwise overwrite it and show the full texture.
 */
function fitted(texture: Texture, size: number): Container {
  const s = new Sprite(texture);
  s.anchor.set(0.5);
  s.scale.set(Math.min(size / Math.max(1, texture.width), size / Math.max(1, texture.height)));
  const c = new Container();
  c.addChild(s);
  return c;
}

/** A cat's portrait: its picture, or a paper disc in the rarity colour with the class badge when the picture is missing. */
export function unitPortrait(id: UnitId, rarity: RarityId, size: number): Container {
  const key = unitKey(id);
  if (hasTex(key)) return fitted(tex(key), size);
  const c = new Container();
  const g = new Graphics();
  const r = Rarity[rarity];
  drawPaper(g, -size * 0.4, -size * 0.4, { w: size * 0.8, h: size * 0.8, kind: 'circle', fill: r.color, edge: r.dark, shadow: 4, grain: false });
  cacheStatic(g);
  c.addChild(g, drawIcon(classIcon(unitClass(id)), size * 0.5));
  return c;
}

export function chestArt(kind: ChestKind, size: number): Container {
  return currencyIcon(`chest_${kind}`, size);
}

/** The "wild card" emblem (a wild card has no cat of its own): the card picture, the stand-in tinted by rarity. */
export function wildArt(rarity: RarityId, size: number): Container {
  return currencyIcon('wild', size, Rarity[rarity].color);
}

/** Picture for one part of a reward bundle. */
export function partArt(p: BundlePart, size: number): Container {
  return partPicture(p, size) ?? (p.kind === 'card' ? unitPortrait(p.unit, RARITY_OF[p.unit], size) : drawIcon('wardrobe', size));
}

/**
 * A piggy bank drawn as a sticker (cream border, ink outline, flat pink): the one picture of this module with no
 * art file. Origin = centre.
 */
export function piggyArt(size: number): Container {
  const k = size / 140;
  const pink = mixColor(Color.coral, Color.paperLight, 0.4);
  const draw = (g: Graphics, border: boolean): void => {
    const paint = (s: Graphics, fill: number): void => {
      if (border) s.fill(Color.paperLight).stroke({ width: 18 * k, color: Color.paperLight, join: 'round' });
      else s.fill(fill).stroke({ width: 4.5 * k, color: Color.ink, join: 'round' });
    };
    paint(g.roundRect(-52 * k, 36 * k, 26 * k, 30 * k, 8 * k), pink);
    paint(g.roundRect(26 * k, 36 * k, 26 * k, 30 * k, 8 * k), pink);
    paint(g.poly([14 * k, -34 * k, 30 * k, -66 * k, 52 * k, -26 * k]), pink);
    paint(g.ellipse(0, 8 * k, 66 * k, 50 * k), pink);
    paint(g.ellipse(64 * k, 14 * k, 17 * k, 14 * k), mixColor(Color.coral, Color.paperLight, 0.15));
  };
  const g = new Graphics();
  draw(g, true);
  draw(g, false);
  g.circle(36 * k, -8 * k, 5 * k).fill(Color.ink);
  g.circle(60 * k, 10 * k, 2.6 * k).fill(Color.ink);
  g.circle(68 * k, 10 * k, 2.6 * k).fill(Color.ink);
  g.roundRect(-16 * k, -40 * k, 32 * k, 7 * k, 3.5 * k).fill(Color.ink);
  g.moveTo(-64 * k, 4 * k).bezierCurveTo(-84 * k, -2 * k, -80 * k, 22 * k, -70 * k, 16 * k).stroke({ width: 5 * k, color: Color.ink, cap: 'round' });
  cacheStatic(g);
  const c = new Container();
  c.addChild(g);
  return c;
}
