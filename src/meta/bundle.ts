/** Pure helpers on reward bundles. */
import { t } from '@/core/i18n';
import { fmt } from '@/core/format';
import { tn } from './plural';
import { CHEST_KINDS, CHEST_RARITIES, type BaseUnitId, type Bundle, type ChestKind, type ChestRarity } from './types';

export type BundlePart =
  | { kind: 'gold' | 'gems' | 'tickets'; n: number }
  | { kind: 'chest'; chest: ChestKind; n: number }
  | { kind: 'wild'; rarity: ChestRarity; n: number }
  | { kind: 'card'; unit: BaseUnitId; n: number }
  | { kind: 'cosmetic'; id: string; n: 1 };

/** Flat list of what a bundle holds, in display order. Zero amounts are dropped. */
export function bundleParts(b: Bundle): BundlePart[] {
  const out: BundlePart[] = [];
  if (b.gold) out.push({ kind: 'gold', n: b.gold });
  if (b.gems) out.push({ kind: 'gems', n: b.gems });
  if (b.tickets) out.push({ kind: 'tickets', n: b.tickets });
  for (const c of CHEST_KINDS) {
    const n = b.chests?.[c];
    if (n) out.push({ kind: 'chest', chest: c, n });
  }
  for (const r of CHEST_RARITIES) {
    const n = b.wild?.[r];
    if (n) out.push({ kind: 'wild', rarity: r, n });
  }
  if (b.cards) {
    for (const [unit, n] of Object.entries(b.cards) as [BaseUnitId, number][]) if (n) out.push({ kind: 'card', unit, n });
  }
  for (const id of b.cosmetics ?? []) out.push({ kind: 'cosmetic', id, n: 1 });
  return out;
}

export function mergeBundles(a: Bundle, b: Bundle): Bundle {
  const out: Bundle = {};
  const num = (k: 'gold' | 'gems' | 'tickets'): void => {
    const n = (a[k] ?? 0) + (b[k] ?? 0);
    if (n) out[k] = n;
  };
  num('gold');
  num('gems');
  num('tickets');
  for (const src of [a, b]) {
    for (const c of CHEST_KINDS) {
      const n = src.chests?.[c];
      if (n) out.chests = { ...out.chests, [c]: (out.chests?.[c] ?? 0) + n };
    }
    for (const r of CHEST_RARITIES) {
      const n = src.wild?.[r];
      if (n) out.wild = { ...out.wild, [r]: (out.wild?.[r] ?? 0) + n };
    }
    if (src.cards) {
      for (const [u, n] of Object.entries(src.cards) as [BaseUnitId, number][]) {
        out.cards = { ...out.cards, [u]: (out.cards?.[u] ?? 0) + n };
      }
    }
    if (src.cosmetics?.length) out.cosmetics = [...(out.cosmetics ?? []), ...src.cosmetics];
  }
  return out;
}

/** One line of text per part, in the current language: "골드 500". */
export function describeBundle(b: Bundle): string[] {
  return bundleParts(b).map((p) => {
    switch (p.kind) {
      case 'gold':
      case 'gems':
      case 'tickets':
        return tn('meta.reward.' + p.kind, p.n, { n: fmt(p.n) });
      case 'chest':
        return t('meta.reward.chest', { name: t('meta.chest.' + p.chest), n: p.n });
      case 'wild':
        return tn('meta.reward.wild', p.n, { rarity: t('rarity.' + p.rarity) });
      case 'card':
        return tn('meta.reward.card', p.n, { unit: t('unit.' + p.unit + '.name') });
      case 'cosmetic':
        return t('meta.cos.' + p.id);
    }
  });
}
