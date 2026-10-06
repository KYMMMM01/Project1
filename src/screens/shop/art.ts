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
import { cacheStatic, Color, drawIcon, drawPaper, Rarity, type RarityId } from '@/ui';
import { chestKey, classIcon, unitKey } from './keys';

const CHEST_FALLBACK: Record<ChestKind, number> = {
  wooden: Color.woodDark,
  silver: Rarity.common.color,
  gold: Color.mustard,
};

/** Fit a texture into a square of `size` around the origin. */
function fitted(texture: Texture, size: number): Sprite {
  const s = new Sprite(texture);
  s.anchor.set(0.5);
  s.scale.set(Math.min(size / Math.max(1, texture.width), size / Math.max(1, texture.height)));
  return s;
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
  const key = chestKey(kind);
  if (hasTex(key)) return fitted(tex(key), size);
  return drawIcon('chest', size, CHEST_FALLBACK[kind]);
}

/** Currency picture: the shared icon art when it exists, else the kit's drawn icon. */
export function currencyArt(kind: 'gold' | 'gems' | 'tickets', size: number): Container {
  const key = kind === 'gold' ? 'icon_gold' : kind === 'gems' ? 'icon_gem' : '';
  if (key && hasTex(key)) return fitted(tex(key), size);
  return drawIcon(kind === 'gold' ? 'coin' : kind === 'gems' ? 'gem' : 'ticket', size);
}

/** The "wild card" emblem: a cream star on a paper medallion in the rarity colour (a wild card has no cat of its own). */
export function wildArt(rarity: RarityId, size: number): Container {
  const r = Rarity[rarity];
  const g = new Graphics();
  drawPaper(g, -size * 0.38, -size * 0.38, { w: size * 0.76, h: size * 0.76, kind: 'circle', fill: r.color, edge: r.dark, shadow: 4, grain: false });
  cacheStatic(g);
  const c = new Container();
  c.addChild(g, drawIcon('star', size * 0.46, Color.paperLight));
  return c;
}

/** Picture for one part of a reward bundle. */
export function partArt(p: BundlePart, size: number): Container {
  switch (p.kind) {
    case 'gold':
    case 'gems':
    case 'tickets':
      return currencyArt(p.kind, size);
    case 'chest':
      return chestArt(p.chest, size);
    case 'wild':
      return wildArt(p.rarity, size);
    case 'card':
      return unitPortrait(p.unit, RARITY_OF[p.unit], size);
    case 'cosmetic':
      return drawIcon('wardrobe', size);
  }
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
