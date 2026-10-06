/** Pure decisions of the shop tab: what is listed, which button a row shows and how rewards are described. */
import { t } from '@/core/i18n';
import { bundleParts, type BundlePart } from '@/meta/bundle';
import type { CosmeticRow } from '@/meta/economy';
import type { IapSpec } from '@/meta/data/catalog';
import type { Bundle, ChestKind } from '@/meta/types';

export const SHOP_SECTIONS = ['chests', 'daily', 'gems', 'pass', 'piggy', 'cosmetics', 'tickets'] as const;
export type ShopSectionId = (typeof SHOP_SECTIONS)[number];

export function isShopSection(id: string | undefined): id is ShopSectionId {
  return id !== undefined && (SHOP_SECTIONS as readonly string[]).includes(id);
}

/** The product ids listed under "gems and packs": plain bundles the player can still buy right now. */
export function listBundleProducts(specs: readonly IapSpec[], canBuy: (id: string) => boolean): IapSpec[] {
  return specs.filter((s) => s.grant === 'bundle' && canBuy(s.id));
}

/** Percent more gems per won that a pack gives than the cheapest plain gem pack (rounded, never below 0). */
export function gemBonusPercent(spec: IapSpec, specs: readonly IapSpec[]): number {
  const rate = (s: IapSpec): number => (s.bundle.gems ?? 0) / s.krw;
  const base = specs.filter((s) => s.grant === 'bundle' && !s.once && (s.bundle.gems ?? 0) > 0).sort((a, b) => a.krw - b.krw)[0];
  if (!base || rate(base) <= 0) return 0;
  return Math.max(0, Math.round((rate(spec) / rate(base) - 1) * 100));
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

function chestName(kind: ChestKind): string {
  return t('meta.chest.' + kind);
}

/** The name printed under a reward: a currency, a chest, a wild card, a cat or a cosmetic. */
export function partLabel(p: BundlePart): string {
  switch (p.kind) {
    case 'gold':
      return t('meta.currency.gold');
    case 'gems':
      return t('meta.currency.gems');
    case 'tickets':
      return t('meta.currency.tickets');
    case 'chest':
      return chestName(p.chest);
    case 'wild':
      return t('rewards.wild', { rarity: t('rarity.' + p.rarity) });
    case 'card':
      return t('unit.' + p.unit + '.name');
    case 'cosmetic':
      return t('meta.cos.' + p.id);
  }
}

/** How many of a reward the player gets (a cosmetic is always one). */
export function partAmount(p: BundlePart): number {
  return p.kind === 'cosmetic' ? 1 : p.n;
}
