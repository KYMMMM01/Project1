/** Which kit picture a reward part is, and how it flies: the one place the screens turn a bundle's part into the picture every screen shows for it. */
import type { Container, Texture } from 'pixi.js';
import { hasTex, tex } from '@/core/assets';
import type { BundlePart } from '@/meta/bundle';
import { currencyIcon, PICTURES, Rarity, type PictureId } from '@/ui';

/** The part's picture, or null for a part drawn another way (a cat's portrait, a cosmetic's glyph). */
export function pictureOfPart(part: BundlePart): PictureId | null {
  switch (part.kind) {
    case 'gold':
    case 'gems':
    case 'tickets':
      return part.kind;
    case 'chest':
      return `chest_${part.chest}`;
    case 'wild':
      return 'wild';
    case 'card':
    case 'cosmetic':
      return null;
  }
}

/** The picture of a part that has one, `size` px square around the origin; null for a cat or a cosmetic. */
export function partPicture(part: BundlePart, size: number): Container | null {
  const id = pictureOfPart(part);
  return id === null ? null : currencyIcon(id, size, part.kind === 'wild' ? Rarity[part.rarity].color : undefined);
}

/** What a flight of this picture is made of: the pooled texture when the art is loaded (cheap), the drawn stand-in otherwise. */
export function flightArt(id: PictureId, size: number): { texture: Texture } | { make: () => Container } {
  const key = PICTURES[id].art;
  return key !== null && hasTex(key) ? { texture: tex(key) } : { make: () => currencyIcon(id, size) };
}
