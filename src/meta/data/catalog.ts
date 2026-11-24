/**
 * What is for sale: the 11 IAP products (GDD 8.3), cosmetics, and the daily shop recipe. Data only.
 * Product names are bilingual here because the platform layer wants them at registration time;
 * strings.ts mirrors them into the i18n tables.
 */
import type { IapProductDef, IapProductType, LocalizedText } from '@/platform/types';
import type { UnitId } from '@/game/api';
import { UNIT_GRID } from '@/game/data/roster';
import { BASE_UNITS, type Bundle, type ChestRarity, type ProfileData } from '../types';

// ───────────────────────────── IAP ─────────────────────────────

/** How a product is applied. `bundle` is a plain grant; the others also flip a state. */
export type IapGrantKind = 'bundle' | 'butler' | 'season' | 'gem_pass' | 'piggy';

export interface IapSpec {
  id: string;
  type: IapProductType;
  /** Price in won, VAT included (a multiple of 11 for the Toss supply-price rule). */
  krw: number;
  name: LocalizedText;
  /** One-time pack: the shop hides it once bought. */
  once: boolean;
  grant: IapGrantKind;
  bundle: Bundle;
}

export const GEM_PASS_DAYS = 30;
export const GEM_PASS_INSTANT = 200;
export const GEM_PASS_DAILY = 30;

export const IAP_SPECS: readonly IapSpec[] = [
  {
    id: 'baby_cat_pack', type: 'consumable', krw: 1100, once: true, grant: 'bundle',
    name: { ko: '아기 고양이 팩', en: 'Baby Cat Pack' },
    bundle: { gems: 180, chests: { silver: 1 }, cosmetics: ['rug_baby'] },
  },
  {
    id: 'starter_pack', type: 'consumable', krw: 3300, once: true, grant: 'bundle',
    name: { ko: '스타터 팩', en: 'Starter Pack' },
    bundle: { gems: 300, gold: 5000, chests: { gold: 1 } },
  },
  {
    id: 'growth_pack', type: 'consumable', krw: 6600, once: true, grant: 'bundle',
    name: { ko: '성장 팩', en: 'Growth Pack' },
    bundle: { gems: 700, gold: 15000, chests: { gold: 2 } },
  },
  {
    id: 'butler_pass', type: 'nonConsumable', krw: 9900, once: true, grant: 'butler',
    name: { ko: '집사 패스', en: 'Butler Pass' },
    bundle: { cosmetics: ['rug_butler'] },
  },
  {
    id: 'season_pass', type: 'consumable', krw: 9900, once: false, grant: 'season',
    name: { ko: '시즌 패스', en: 'Season Pass' },
    bundle: {},
  },
  {
    id: 'gem_pass', type: 'consumable', krw: 5500, once: false, grant: 'gem_pass',
    name: { ko: '월간 보석 패스', en: 'Monthly Gem Pass' },
    bundle: { gems: GEM_PASS_INSTANT },
  },
  {
    id: 'piggy_bank', type: 'consumable', krw: 5500, once: false, grant: 'piggy',
    name: { ko: '저금통', en: 'Piggy Bank' },
    bundle: {},
  },
  {
    id: 'gems_260', type: 'consumable', krw: 2200, once: false, grant: 'bundle',
    name: { ko: '보석 260개', en: '260 Gems' },
    bundle: { gems: 260 },
  },
  {
    id: 'gems_680', type: 'consumable', krw: 5500, once: false, grant: 'bundle',
    name: { ko: '보석 680개', en: '680 Gems' },
    bundle: { gems: 680 },
  },
  {
    id: 'gems_1450', type: 'consumable', krw: 11000, once: false, grant: 'bundle',
    name: { ko: '보석 1,450개', en: '1,450 Gems' },
    bundle: { gems: 1450 },
  },
  {
    id: 'gems_4600', type: 'consumable', krw: 33000, once: false, grant: 'bundle',
    name: { ko: '보석 4,600개', en: '4,600 Gems' },
    bundle: { gems: 4600 },
  },
];

export function iapSpec(id: string): IapSpec | undefined {
  return IAP_SPECS.find((s) => s.id === id);
}

function won(n: number): string {
  return n.toLocaleString('en-US');
}

/** Definitions handed to `iap.registerProducts`. */
export function iapProductDefs(): IapProductDef[] {
  return IAP_SPECS.map((s) => ({
    id: s.id,
    type: s.type,
    price: { ko: won(s.krw) + '원', en: '₩' + won(s.krw) },
    name: s.name,
    prices: { toss: { currency: 'KRW', amount: s.krw } },
  }));
}

// ───────────────────────────── cosmetics ─────────────────────────────

export type CosmeticKind = 'rug' | 'fx' | 'icon' | 'frame' | 'plate';

export type CosmeticSource =
  | { type: 'default' }
  | { type: 'chapter'; chapter: number }
  | { type: 'gems'; price: number }
  | { type: 'reward' }
  | { type: 'unit'; unit: UnitId };

export interface CosmeticDef {
  id: string;
  kind: CosmeticKind;
  source: CosmeticSource;
}

export const RUG_GEM_PRICE = 400;
export const FX_GEM_PRICE = 300;

/** 8 skins you can earn or buy (5 by chapter progress, 3 for gems) plus 4 that only come as rewards. */
export const COSMETICS: readonly CosmeticDef[] = [
  { id: 'rug_default', kind: 'rug', source: { type: 'default' } },
  { id: 'rug_ch1', kind: 'rug', source: { type: 'chapter', chapter: 1 } },
  { id: 'rug_ch2', kind: 'rug', source: { type: 'chapter', chapter: 2 } },
  { id: 'rug_ch3', kind: 'rug', source: { type: 'chapter', chapter: 3 } },
  { id: 'rug_ch4', kind: 'rug', source: { type: 'chapter', chapter: 4 } },
  { id: 'rug_ch5', kind: 'rug', source: { type: 'chapter', chapter: 5 } },
  { id: 'rug_gem1', kind: 'rug', source: { type: 'gems', price: RUG_GEM_PRICE } },
  { id: 'rug_gem2', kind: 'rug', source: { type: 'gems', price: RUG_GEM_PRICE } },
  { id: 'rug_gem3', kind: 'rug', source: { type: 'gems', price: RUG_GEM_PRICE } },
  { id: 'rug_baby', kind: 'rug', source: { type: 'reward' } },
  { id: 'rug_butler', kind: 'rug', source: { type: 'reward' } },
  { id: 'rug_calendar', kind: 'rug', source: { type: 'reward' } },
  { id: 'rug_season', kind: 'rug', source: { type: 'reward' } },
  { id: 'fx_default', kind: 'fx', source: { type: 'default' } },
  { id: 'fx_gem1', kind: 'fx', source: { type: 'gems', price: FX_GEM_PRICE } },
  { id: 'fx_gem2', kind: 'fx', source: { type: 'gems', price: FX_GEM_PRICE } },
  { id: 'fx_gem3', kind: 'fx', source: { type: 'gems', price: FX_GEM_PRICE } },
  // The 20 cat icons, in roster order (class, then rarity): 16 base cats and the 4 Guardians.
  ...Object.values(UNIT_GRID).flat().map((unit): CosmeticDef => ({ id: 'icon_' + unit, kind: 'icon', source: { type: 'unit', unit } })),
  { id: 'frame_default', kind: 'frame', source: { type: 'default' } },
  { id: 'plate_default', kind: 'plate', source: { type: 'default' } },
];

/** What a slot falls back to: a fresh profile, a refunded item, an item the player cannot use. */
export const COSMETIC_DEFAULTS: Readonly<Record<CosmeticKind, string>> = {
  rug: 'rug_default', fx: 'fx_default', icon: 'icon_w_paw', frame: 'frame_default', plate: 'plate_default',
};

export function cosmetic(id: string): CosmeticDef | undefined {
  return COSMETICS.find((c) => c.id === id);
}

/** Whether the player can use a cosmetic: a cat icon follows the cat (a base cat always, a Guardian once made in a run), the rest the owned list. */
export function ownsCosmetic(d: ProfileData, id: string): boolean {
  const s = cosmetic(id)?.source;
  if (s?.type === 'unit') return (BASE_UNITS as readonly string[]).includes(s.unit) || d.mythicMet.includes(s.unit);
  return d.cosmetics.owned.includes(id);
}

// ───────────────────────────── daily shop ─────────────────────────────

export const SHOP_SLOTS = 6;

/** Card lots of the four card slots, one per rarity: count and gold price (20 / 100 / 500 / 4,000 per card). */
export const SHOP_LOTS: Readonly<Record<ChestRarity, { count: number; price: number }>> = {
  common: { count: 20, price: 600 },
  rare: { count: 10, price: 1000 },
  epic: { count: 4, price: 2000 },
  legendary: { count: 1, price: 4000 },
};
export const SHOP_FREE_GOLD = 500;
export const SHOP_GEM_SILVER_PRICE = 120;
export const SHOP_GEM_WILD = { rarity: 'epic', count: 6, price: 100 } as const;
