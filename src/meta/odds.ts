/**
 * The published odds. One `OddsTable` per chest is BOTH what the draw code rolls from and what the
 * odds screen shows: rows, guarantees and the pity rule are rendered from the same object, so the
 * screen cannot drift from the code. Bump ODDS_VERSION whenever any number below changes.
 */
import type { OddsRow } from '@/game/api';
import { t } from '@/core/i18n';
import { fmt } from '@/core/format';
import { tn } from './plural';
import { CHEST_RARITIES, type BaseUnitId, type ChestKind, type ChestRarity } from './types';

export const ODDS_VERSION = 1;

/** "At least `count` cards of `atLeast` or better in every chest." */
export interface Guarantee {
  atLeast: ChestRarity;
  count: number;
}

/** Every `every`-th chest of this kind adds `bonusCards` cards of the lowest-level unit of `rarity`. */
export interface PityRule {
  every: number;
  bonusCards: number;
  rarity: ChestRarity;
}

export interface OddsTable {
  kind: ChestKind;
  version: number;
  /** Cards per chest. */
  cards: number;
  /** Per-card rarity odds, summing to 1. */
  rows: readonly OddsRow<ChestRarity>[];
  /** Share of cards that are wild cards (usable on any unit of the card's rarity). */
  wildShare: number;
  guarantees: readonly Guarantee[];
  pity: PityRule | null;
}

function rows(common: number, rare: number, epic: number, legendary: number): OddsRow<ChestRarity>[] {
  return [
    { key: 'common', p: common },
    { key: 'rare', p: rare },
    { key: 'epic', p: epic },
    { key: 'legendary', p: legendary },
  ];
}

export const WILD_SHARE = 0.3;

export const ODDS: Readonly<Record<ChestKind, OddsTable>> = {
  wooden: { kind: 'wooden', version: ODDS_VERSION, cards: 8, rows: rows(0.7, 0.25, 0.05, 0), wildShare: WILD_SHARE, guarantees: [], pity: null },
  silver: {
    kind: 'silver', version: ODDS_VERSION, cards: 24, rows: rows(0.5, 0.32, 0.15, 0.03), wildShare: WILD_SHARE,
    guarantees: [{ atLeast: 'epic', count: 1 }], pity: null,
  },
  gold: {
    kind: 'gold', version: ODDS_VERSION, cards: 60, rows: rows(0.4, 0.3, 0.2, 0.1), wildShare: WILD_SHARE,
    guarantees: [{ atLeast: 'legendary', count: 3 }], pity: { every: 10, bonusCards: 8, rarity: 'legendary' },
  },
};

/** The state the odds screen needs besides the table. */
export interface PityState {
  /** Gold chests opened so far. */
  goldOpened: number;
  /** The unit the bonus cards would go to right now. */
  target: BaseUnitId | null;
}

export interface OddsView {
  kind: ChestKind;
  version: number;
  title: string;
  cards: number;
  rows: { rarity: ChestRarity; label: string; p: number; text: string }[];
  wildText: string;
  guaranteeTexts: string[];
  /** Pity line and its counter, or null for chests without one. */
  pity: { text: string; counter: number; every: number; next: boolean; target: BaseUnitId | null; targetName: string } | null;
  /** The one-line confirmation text shown before buying a chest. */
  summary: string;
}

export function percentText(p: number): string {
  const v = Math.round(p * 1000) / 10;
  return (Number.isInteger(v) ? String(v) : v.toFixed(1)) + '%';
}

/** Consecutive gold chests opened inside the current pity cycle, 0..every-1. */
export function pityCounter(rule: PityRule, goldOpened: number): number {
  return goldOpened % rule.every;
}

/** True when the chest about to be opened is the bonus one. */
export function isPityChest(rule: PityRule, goldOpened: number): boolean {
  return pityCounter(rule, goldOpened) === rule.every - 1;
}

export function oddsView(table: OddsTable, pity: PityState): OddsView {
  const rowViews = table.rows.map((r) => ({
    rarity: r.key,
    label: t('rarity.' + r.key),
    p: r.p,
    text: percentText(r.p),
  }));
  const wildText = t('meta.odds.wild', { pct: percentText(table.wildShare) });
  const top = CHEST_RARITIES[CHEST_RARITIES.length - 1];
  const guaranteeTexts = table.guarantees.map((g) =>
    tn(g.atLeast === top ? 'meta.odds.guaranteeTop' : 'meta.odds.guarantee', g.count, { rarity: t('rarity.' + g.atLeast) }),
  );
  let pityView: OddsView['pity'] = null;
  if (table.pity) {
    const counter = pityCounter(table.pity, pity.goldOpened);
    const targetName = pity.target ? t('unit.' + pity.target + '.name') : '-';
    pityView = {
      counter,
      every: table.pity.every,
      next: isPityChest(table.pity, pity.goldOpened),
      target: pity.target,
      targetName,
      text: t('meta.odds.pity', {
        every: table.pity.every,
        n: table.pity.bonusCards,
        rarity: t('rarity.' + table.pity.rarity),
        unit: targetName,
        counter,
      }),
    };
  }
  const rowsText = CHEST_RARITIES.map((r) => {
    const row = table.rows.find((x) => x.key === r);
    return t('meta.odds.row', { rarity: t('rarity.' + r), pct: percentText(row ? row.p : 0) });
  }).join(' · ');
  const parts = [t('meta.odds.head', { chest: t('meta.chest.' + table.kind), n: fmt(table.cards) }), rowsText + '.', wildText];
  for (const g of guaranteeTexts) parts.push(g);
  if (pityView) parts.push(pityView.text);
  parts.push(t('meta.odds.version', { v: table.version }));
  return {
    kind: table.kind,
    version: table.version,
    title: t('meta.chest.' + table.kind),
    cards: table.cards,
    rows: rowViews,
    wildText,
    guaranteeTexts,
    pity: pityView,
    summary: parts.join(' '),
  };
}

/** Throws when a table is internally inconsistent (used by the tests and at load in dev). */
export function validateOdds(table: OddsTable): void {
  const sum = table.rows.reduce((a, r) => a + r.p, 0);
  if (Math.abs(sum - 1) > 1e-9) throw new Error(`odds of ${table.kind} sum to ${sum}`);
  for (const g of table.guarantees) {
    if (g.count > table.cards) throw new Error(`guarantee larger than the chest in ${table.kind}`);
  }
}
