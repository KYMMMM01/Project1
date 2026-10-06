/**
 * Chest draws. Everything is decided here, from one seed, before anything is shown or credited:
 * rarities from the OddsTable, then the guarantees, then which cards are wild and which unit each
 * other card is. Pure: the same table, state and seed always give the same chest.
 */
import { Rng } from '@/core/rng';
import { isPityChest, type OddsTable } from './odds';
import { UNITS_BY_RARITY } from './units';
import type { BaseUnitId, ChestCard, ChestRarity } from './types';

/** What the draw may look at: nothing that the draw itself changes. */
export interface DrawState {
  levels: Readonly<Record<BaseUnitId, number>>;
  cards: Readonly<Record<BaseUnitId, number>>;
  goldOpened: number;
}

export interface Draw {
  cards: ChestCard[];
  pity: { unit: BaseUnitId | null; cards: number };
  /** Cards the guarantee had to upgrade. */
  upgraded: number;
}

const RANK: Readonly<Record<ChestRarity, number>> = { common: 0, rare: 1, epic: 2, legendary: 3 };

/** One card's rarity, straight from the table. */
export function rollRarity(table: OddsTable, rng: Rng): ChestRarity {
  const i = rng.weighted(table.rows.map((r) => r.p));
  return (table.rows[i] ?? table.rows[0]).key;
}

/** The raw rarities of a whole chest before guarantees (what the chi-square test checks). */
export function rollRarities(table: OddsTable, rng: Rng): ChestRarity[] {
  const out: ChestRarity[] = [];
  for (let i = 0; i < table.cards; i++) out.push(rollRarity(table, rng));
  return out;
}

/**
 * Raise cards to the guaranteed rarity until each guarantee holds. The lowest cards are raised
 * first and only to the guaranteed rarity itself. Returns how many cards were changed.
 */
export function applyGuarantees(rarities: ChestRarity[], table: OddsTable, rng: Rng): number {
  let changed = 0;
  for (const g of table.guarantees) {
    const min = RANK[g.atLeast];
    let have = 0;
    for (const r of rarities) if (RANK[r] >= min) have++;
    while (have < g.count) {
      let lowest = min;
      for (const r of rarities) if (RANK[r] < lowest) lowest = RANK[r];
      const idx: number[] = [];
      for (let i = 0; i < rarities.length; i++) if (RANK[rarities[i]] === lowest) idx.push(i);
      rarities[rng.pick(idx)] = g.atLeast;
      have++;
      changed++;
    }
  }
  return changed;
}

/** The legendary with the lowest level; ties go to the one with fewer cards, then to class order. */
export function pityTarget(state: Pick<DrawState, 'levels' | 'cards'>, rarity: ChestRarity = 'legendary'): BaseUnitId {
  let best = UNITS_BY_RARITY[rarity][0];
  for (const u of UNITS_BY_RARITY[rarity]) {
    const a = state.levels[u] ?? 1;
    const b = state.levels[best] ?? 1;
    if (a < b || (a === b && (state.cards[u] ?? 0) < (state.cards[best] ?? 0))) best = u;
  }
  return best;
}

export function drawChest(table: OddsTable, state: DrawState, rng: Rng): Draw {
  const rarities = rollRarities(table, rng);
  const upgraded = applyGuarantees(rarities, table, rng);
  const cards: ChestCard[] = rarities.map((rarity) => {
    const wild = rng.chance(table.wildShare);
    return { rarity, unit: wild ? null : rng.pick(UNITS_BY_RARITY[rarity]) };
  });
  let pity: Draw['pity'] = { unit: null, cards: 0 };
  if (table.pity && isPityChest(table.pity, state.goldOpened)) {
    pity = { unit: pityTarget(state, table.pity.rarity), cards: table.pity.bonusCards };
  }
  return { cards, pity, upgraded };
}

export interface ChestTotals {
  cards: Partial<Record<BaseUnitId, number>>;
  wild: Partial<Record<ChestRarity, number>>;
}

/** Everything a chest hands over, merged per unit and per wild rarity (pity cards included). */
export function chestTotals(cards: readonly ChestCard[], pity: Draw['pity']): ChestTotals {
  const out: ChestTotals = { cards: {}, wild: {} };
  for (const c of cards) {
    if (c.unit) out.cards[c.unit] = (out.cards[c.unit] ?? 0) + 1;
    else out.wild[c.rarity] = (out.wild[c.rarity] ?? 0) + 1;
  }
  if (pity.unit && pity.cards > 0) out.cards[pity.unit] = (out.cards[pity.unit] ?? 0) + pity.cards;
  return out;
}

/** Count of cards per rarity (wild and unit cards together). */
export function rarityCounts(cards: readonly ChestCard[]): Record<ChestRarity, number> {
  const out: Record<ChestRarity, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
  for (const c of cards) out[c.rarity]++;
  return out;
}
