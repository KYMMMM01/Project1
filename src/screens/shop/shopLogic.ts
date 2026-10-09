/** Pure decisions of the shop tab: what is listed, which button a row shows and how rewards are described. */
import { fmt } from '@/core/format';
import { t } from '@/core/i18n';
import { bundleParts, type BundlePart } from '@/meta/bundle';
import type { CosmeticRow } from '@/meta/economy';
import type { IapSpec } from '@/meta/data/catalog';
import { CHEST_BULK_MAX, chestPrice } from '@/meta/data/economy';
import { ODDS, pityCounter } from '@/meta/odds';
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

/** How many chests "open all" opens in one go, or 0 when the button is not shown (it takes two chests to make a pile). */
export function pileSize(owned: number): number {
  return owned >= 2 ? Math.min(Math.floor(owned), CHEST_BULK_MAX) : 0;
}

/**
 * Bonus cards the gold chest's pity rule adds inside the next `count` chests of a kind, counted from the player's place in the
 * cycle (`goldOpened`): one bonus chest for every `every` chests, so ten gold chests in a row always hold exactly one.
 * Zero for a kind without the rule.
 */
export function bonusCardsIn(kind: ChestKind, count: number, goldOpened: number): number {
  const rule = ODDS[kind].pity;
  if (!rule || count < 1) return 0;
  return Math.floor((pityCounter(rule, goldOpened) + count) / rule.every) * rule.bonusCards;
}

/** What the "buy this chest?" popup says and charges for `count` chests of one kind. */
export interface ChestBuyView {
  count: number;
  /** Gems for the whole purchase: the figure on the buy button, and what the purchase costs. */
  price: number;
  /** Cards the player gets for the whole purchase: the cards of every chest plus the bonus cards that fall inside it (several chests only). */
  cards: number;
  /** Bonus cards counted in `cards`; 0 for one chest (its card shows whether the bonus is due) and for a kind without the rule. */
  bonus: number;
  title: string;
  /** The big first line: the cards of the chest, or of the whole purchase when there are several chests. */
  cardsLine: string;
  /** A smaller line under it: each chest keeps its own odds and guarantees (and where the bonus cards come from). Only for several chests. */
  eachLine: string | null;
}

/**
 * `cardsPerChest` is the table's card count; `goldOpened` the player's gold chests opened so far, which decides where the
 * bonus chest falls in a purchase of several.
 */
export function chestBuyView(kind: ChestKind, count: number, cardsPerChest: number, goldOpened = 0): ChestBuyView {
  const price = chestPrice(kind, count);
  if (count <= 1) {
    const cards = cardsPerChest;
    return { count: 1, price, cards, bonus: 0, title: t('shop.chest.confirmTitle', { chest: chestName(kind) }), cardsLine: t('shop.chest.cards', { n: fmt(cards) }), eachLine: null };
  }
  // A pack of gold chests always holds its bonus chest, so the total says what the reveal will add up to.
  const bonus = bonusCardsIn(kind, count, goldOpened);
  const cards = cardsPerChest * count + bonus;
  return {
    count,
    price,
    cards,
    bonus,
    title: t('shop.chest.confirmTitleN', { chest: t('shop.chest.many.' + kind), n: count }),
    cardsLine: t('shop.chest.cardsAll', { count, n: fmt(cards) }),
    eachLine: t(bonus > 0 ? 'shop.chest.cardsEachBonus' : 'shop.chest.cardsEach', { n: fmt(cardsPerChest), bonus: fmt(bonus) }),
  };
}

/**
 * Seconds the popup's buy button stays inert after the popup opens. A tap that opened the popup is often followed at once by a
 * second tap (a double tap, a repeat because the popup was slow to show) on the same spot, and the popup is centred on the
 * screen, so that second tap can land on the buy button. Nothing is read in that time, so it must never spend gems.
 */
export const CONFIRM_ARM_S = 0.7;

/**
 * True once the buy button of a popup opened at `openedAt` (seconds on the game clock) may be used; a popup not yet open never
 * is. A microsecond of slack: the button wakes on a tween timer of the same length, and a difference of two large clock values
 * can come out a hair short of the delay.
 */
export function confirmArmed(openedAt: number, now: number): boolean {
  return now - openedAt >= CONFIRM_ARM_S - 1e-6;
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
