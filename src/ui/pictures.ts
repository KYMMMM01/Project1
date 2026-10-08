import type { IconName } from './icons';
import { Color, Rarity } from './theme';

/**
 * What one currency or countable reward looks like. `art` is the painted picture (an image key under src/assets/img), `glyph` the drawn
 * stand-in the kit shows only while that picture is not loaded or does not exist yet, and `color` the stand-in's body colour when it is
 * not the glyph's own. The table is the only place that says which picture a thing has: every screen asks for the thing, never for a key.
 */
export interface PictureDef {
  art: string | null;
  glyph: IconName;
  color?: number;
}

export const PICTURES = {
  gold: { art: 'icon_gold', glyph: 'coin' },
  gems: { art: 'icon_gem', glyph: 'gem' },
  /** No painted picture yet: the drawn ticket is the one picture of the sweep ticket everywhere. */
  tickets: { art: 'icon_ticket', glyph: 'ticket' },
  fish: { art: 'icon_fish', glyph: 'fish' },
  purr: { art: 'icon_purr', glyph: 'purr' },
  xp: { art: 'icon_xp', glyph: 'xp' },
  /** The wild card; its stand-in takes the rarity colour a caller passes. */
  wild: { art: 'icon_card', glyph: 'cards' },
  chest_wooden: { art: 'icon_chest_wood', glyph: 'chest' },
  chest_silver: { art: 'icon_chest_silver', glyph: 'chest', color: Rarity.common.color },
  chest_gold: { art: 'icon_chest_gold', glyph: 'chest', color: Color.mustard },
} as const satisfies Record<string, PictureDef>;

export type PictureId = keyof typeof PICTURES;

export const PICTURE_IDS = Object.keys(PICTURES) as PictureId[];

/**
 * Icon names that mean one of the pictures: asking the kit for `'gem'` gives the gem's picture, so a button, a pill or a price tag
 * that names the drawn gem can never show a different gem than the shop does. (`cards` is a tab icon too, so it is not here.)
 */
export const GLYPH_PICTURE = {
  coin: 'gold',
  gem: 'gems',
  ticket: 'tickets',
  fish: 'fish',
  purr: 'purr',
  xp: 'xp',
  chest: 'chest_wooden',
} as const satisfies Partial<Record<IconName, PictureId>>;

/** The icon names that are a picture. */
export type PictureGlyph = keyof typeof GLYPH_PICTURE;
