/** Pure decisions of the shop tab: what is listed, which button a row shows and how rewards are described. */
import { t } from '@/core/i18n';
import { bundleParts, type BundlePart } from '@/meta/bundle';
import type { CosmeticRow } from '@/meta/economy';
import type { IapSpec } from '@/meta/data/catalog';
import type { Bundle, ChestKind } from '@/meta/types';
import type { RewardDesc } from '@/ui/RewardPopup';
import type { Texture } from 'pixi.js';
import { chestKey, unitKey } from './keys';

export const SHOP_SECTIONS = ['chests', 'daily', 'gems', 'pass', 'piggy', 'cosmetics', 'tickets'] as const;
export type ShopSectionId = (typeof SHOP_SECTIONS)[number];

export function isShopSection(id: string | undefined): id is ShopSectionId {
  return id !== undefined && (SHOP_SECTIONS as readonly string[]).includes(id);
}

/** The product ids listed under "gems and packs": plain bundles the player can still buy right now. */
export function listBundleProducts(specs: readonly IapSpec[], canBuy: (id: string) => boolean): IapSpec[] {
  return specs.filter((s) => s.grant === 'bundle' && canBuy(s.id));
}

/** What a chest card's main button does: open one the player owns, or buy and open one. */
export function chestAction(owned: number): 'open' | 'buy' {
  return owned > 0 ? 'open' : 'buy';
}

export type CosmeticStatus =
  | { kind: 'equipped' }
  | { kind: 'equip' }
  | { kind: 'buy'; gems: number }
  | { kind: 'chapter'; chapter: number }
  | { kind: 'reward' };

export function cosmeticStatus(row: CosmeticRow): CosmeticStatus {
  if (row.equipped) return { kind: 'equipped' };
  if (row.owned) return { kind: 'equip' };
  const s = row.source;
  if (s.type === 'gems') return { kind: 'buy', gems: s.price };
  if (s.type === 'chapter') return { kind: 'chapter', chapter: s.chapter };
  return { kind: 'reward' };
}

/** How many more of a currency the player needs for a price, 0 when they can pay. */
export function shortBy(price: number, have: number): number {
  return Math.max(0, Math.floor(price) - Math.floor(have));
}

/** True when a value handed to a service looks like the meta layer's `BundlePart[]`. */
export function isBundleParts(v: unknown): v is BundlePart[] {
  return Array.isArray(v) && v.every((p) => typeof p === 'object' && p !== null && typeof (p as { kind?: unknown }).kind === 'string');
}

export function partsOf(bundle: Bundle): BundlePart[] {
  return bundleParts(bundle);
}

export type TextureLookup = (key: string) => Texture | null;

function chestName(kind: ChestKind): string {
  return t('meta.chest.' + kind);
}

/** Tiles of the reward popup for a list of bundle parts. Pictures come from textures when they exist and from icons otherwise. */
export function rewardDescs(parts: readonly BundlePart[], lookup: TextureLookup): RewardDesc[] {
  return parts.map((p): RewardDesc => {
    switch (p.kind) {
      case 'gold':
        return { icon: 'coin', amount: p.n, label: t('meta.currency.gold') };
      case 'gems':
        return { icon: 'gem', amount: p.n, label: t('meta.currency.gems') };
      case 'tickets':
        return { icon: 'ticket', amount: p.n, label: t('meta.currency.tickets') };
      case 'chest': {
        const texture = lookup(chestKey(p.chest));
        return texture ? { texture, amount: p.n, label: chestName(p.chest) } : { icon: 'chest', amount: p.n, label: chestName(p.chest) };
      }
      case 'wild':
        return { icon: 'star', amount: p.n, label: t('rewards.wild', { rarity: t('rarity.' + p.rarity) }), rarity: p.rarity };
      case 'card': {
        const texture = lookup(unitKey(p.unit));
        const label = t('unit.' + p.unit + '.name');
        return texture ? { texture, amount: p.n, label } : { icon: 'cards', amount: p.n, label };
      }
      case 'cosmetic':
        return { icon: 'wardrobe', amount: 1, label: t('meta.cos.' + p.id) };
    }
  });
}

/** Currencies in a list of parts that should fly to the top bar when the popup closes. */
export function flyingCurrencies(parts: readonly BundlePart[]): { kind: 'gold' | 'gems' | 'tickets'; n: number }[] {
  const out: { kind: 'gold' | 'gems' | 'tickets'; n: number }[] = [];
  for (const p of parts) if (p.kind === 'gold' || p.kind === 'gems' || p.kind === 'tickets') out.push({ kind: p.kind, n: p.n });
  return out;
}
