/**
 * Picture helpers shared by the cats and shop screens. Every image is looked up by key and has a drawn
 * fallback, so a missing or re-drawn asset never leaves a hole and the art can be replaced freely.
 */
import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { hasTex, tex } from '@/core/assets';
import type { UnitId } from '@/game/api';
import { unitClass } from '@/game/data/roster';
import type { BundlePart } from '@/meta/bundle';
import type { ChestKind } from '@/meta/types';
import { RARITY_OF } from '@/meta/units';
import { Color, drawGlow, drawIcon, Rarity, type RarityId } from '@/ui';
import { chestKey, classIcon, unitKey } from './keys';

const CHEST_FALLBACK: Record<ChestKind, number> = {
  wooden: Color.primaryDark,
  silver: Rarity.common.color,
  gold: Color.gold,
};

/** Fit a texture into a square of `size` around the origin. */
function fitted(texture: Texture, size: number): Sprite {
  const s = new Sprite(texture);
  s.anchor.set(0.5);
  s.scale.set(Math.min(size / Math.max(1, texture.width), size / Math.max(1, texture.height)));
  return s;
}

/** A cat's portrait: its picture, or a rarity-coloured disc with the class badge when the picture is missing. */
export function unitPortrait(id: UnitId, rarity: RarityId, size: number): Container {
  const key = unitKey(id);
  if (hasTex(key)) return fitted(tex(key), size);
  const c = new Container();
  const g = new Graphics();
  const r = Rarity[rarity];
  g.circle(0, 0, size * 0.42).fill(r.dark).stroke({ width: 5, color: r.light, alignment: 0.5 });
  drawGlow(g, 0, -size * 0.08, size * 0.34, r.glow, 0.5);
  c.addChild(g, drawIcon(classIcon(unitClass(id)), size * 0.56, r.light));
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

/** The "wild card" emblem: a star in the rarity colour (a wild card has no cat of its own). */
export function wildArt(rarity: RarityId, size: number): Container {
  return drawIcon('star', size, Rarity[rarity].light);
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
