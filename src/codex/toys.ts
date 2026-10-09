/** The toy codex's list: the 30 toys by rarity, filtered by one, and the words of a toy's row. */
import { t } from '@/core/i18n';
import { RELIC_IDS, type RelicId } from '@/game/api';
import { relicDef } from '@/game/data/relics';
import { RELIC_RARITY } from '@/game/data/roster';
import { toyShape, type ToyShape } from '@/view/field/toyCells';
import './strings';

export const TOY_RARITIES = ['common', 'rare', 'epic', 'legendary'] as const;
export type ToyRarity = (typeof TOY_RARITIES)[number];
export type ToyFilter = 'all' | ToyRarity;
export const TOY_FILTERS: readonly ToyFilter[] = ['all', ...TOY_RARITIES];

/** The toys of a rarity (all of them for 'all'), in the order of the data: common first. */
export function toysFor(filter: ToyFilter): RelicId[] {
  return RELIC_IDS.filter((id) => filter === 'all' || RELIC_RARITY[id] === filter);
}

export interface ToyItem {
  id: RelicId;
  rarity: ToyRarity;
  name: string;
  /** What the toy does, with its numbers from the data. */
  effect: string;
  /** Where its effect lies on the board, when that depends on where a cat stands. */
  shape: ToyShape | null;
}

export function toyItem(id: RelicId): ToyItem {
  const def = relicDef(id);
  return { id, rarity: def.rarity, name: t(def.nameKey), effect: def.descText(), shape: toyShape(id) };
}
