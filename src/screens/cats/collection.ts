/** Pure structure of the cats tab: the four class groups, filtering, upgrade-ready counts and card progress. */
import { CLASS_IDS, type ClassId, type UnitId } from '@/game/api';
import { UNIT_GRID, unitRarity } from '@/game/data/roster';
import type { UnitView } from '@/meta/economy';
import type { BaseUnitId } from '@/meta/types';
import type { RarityId } from '@/ui/theme';

export type ClassFilter = 'all' | ClassId;

export interface ClassGroup {
  classId: ClassId;
  /** The four collectable cats, common to legendary. */
  base: readonly [BaseUnitId, BaseUnitId, BaseUnitId, BaseUnitId];
  /** The awakened form of the legendary. Shares its level. */
  guardian: UnitId;
}

export const CLASS_GROUPS: readonly ClassGroup[] = CLASS_IDS.map((classId) => {
  const row = UNIT_GRID[classId];
  return {
    classId,
    base: [row[0], row[1], row[2], row[3]] as unknown as ClassGroup['base'],
    guardian: row[4],
  };
});

export function visibleGroups(filter: ClassFilter): readonly ClassGroup[] {
  return filter === 'all' ? CLASS_GROUPS : CLASS_GROUPS.filter((g) => g.classId === filter);
}

export function isUpgradeReady(v: UnitView): boolean {
  return !v.quote.maxed && v.quote.enoughCards && v.quote.enoughGold;
}

/** Number of cats that can be levelled up right now (the tab badge). */
export function upgradeReadyCount(views: readonly UnitView[]): number {
  let n = 0;
  for (const v of views) if (isUpgradeReady(v)) n++;
  return n;
}

export interface CardProgress {
  /** Own cards plus the wild cards that would be spent, capped at what the level needs. */
  have: number;
  needed: number;
  maxed: boolean;
}

export function cardProgress(v: UnitView): CardProgress {
  if (v.quote.maxed) return { have: 1, needed: 1, maxed: true };
  const needed = v.quote.cards;
  return { have: Math.min(needed, v.cards + v.wild), needed, maxed: false };
}

/** Rarity of a unit of the grid (guardians are mythic). */
export function rarityOfUnit(id: UnitId): RarityId {
  return unitRarity(id);
}
