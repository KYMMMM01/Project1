/** The daily shop: six slots generated from the profile seed, the date and the refresh count. Pure. */
import { Rng } from '@/core/rng';
import { SHOP_FREE_GOLD, SHOP_GEM_SILVER_PRICE, SHOP_GEM_WILD, SHOP_LOTS } from './data/catalog';
import { hashString } from './daily';
import { UNITS_BY_RARITY } from './units';
import { CHEST_RARITIES, type Bundle, type ChestRarity } from './types';

export type ShopSlotKind = 'free' | 'cards' | 'wild' | 'gem';

export interface ShopOffer {
  slot: number;
  kind: ShopSlotKind;
  bundle: Bundle;
  /** Free slot: both undefined. */
  price: { gold?: number; gems?: number };
  rarity: ChestRarity | null;
}

/**
 * Slot 0 is free, slots 1-4 are card lots for gold (one per rarity, the epic one is sometimes a wild
 * lot), slot 5 is a discounted gem offer. Rolling again with a new `salt` is the refresh.
 */
export function shopOffers(profileSeed: number, date: string, salt: number): ShopOffer[] {
  const rng = new Rng((hashString(date) ^ profileSeed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0);
  const offers: ShopOffer[] = [];
  offers.push({
    slot: 0,
    kind: 'free',
    bundle: rng.chance(0.5) ? { gold: SHOP_FREE_GOLD } : { chests: { wooden: 1 } },
    price: {},
    rarity: null,
  });
  CHEST_RARITIES.forEach((rarity, i) => {
    const lot = SHOP_LOTS[rarity];
    const wild = rarity === 'epic' && rng.chance(0.5);
    const unit = rng.pick(UNITS_BY_RARITY[rarity]);
    offers.push({
      slot: i + 1,
      kind: wild ? 'wild' : 'cards',
      bundle: wild ? { wild: { [rarity]: lot.count } } : { cards: { [unit]: lot.count } },
      price: { gold: lot.price },
      rarity,
    });
  });
  const silver = rng.chance(0.5);
  offers.push({
    slot: 5,
    kind: 'gem',
    bundle: silver ? { chests: { silver: 1 } } : { wild: { [SHOP_GEM_WILD.rarity]: SHOP_GEM_WILD.count } },
    price: { gems: silver ? SHOP_GEM_SILVER_PRICE : SHOP_GEM_WILD.price },
    rarity: silver ? null : SHOP_GEM_WILD.rarity,
  });
  return offers;
}
