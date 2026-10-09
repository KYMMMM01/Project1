/**
 * Build planning, as pure functions: what a cat becomes when it merges or awakens, how many identical
 * cats stand on the board, how a class's five-rank line is filled, how far the next synergy step is.
 * A class is one fixed line (merging always makes the next rank of the SAME class), so everything here
 * follows from the unit table alone.
 */
import {
  SYNERGY_MIN_RANK,
  SYNERGY_TIER_AT,
  UNIT_GRID,
  mergeResultOf,
  mythicOf,
  tierForDistinct,
  type ClassId,
  type RarityId,
  type RunStats,
  type UnitId,
} from '@/game';

/** Identical cats it takes to merge. */
export const MERGE_NEED = 2;

type BoardLike = ReadonlyArray<{ readonly id: UnitId } | null>;

/** The five rank slots of a class, common to mythic. */
export function ladderOf(classId: ClassId): readonly UnitId[] {
  return UNIT_GRID[classId];
}

/** Which ranks of a class count toward its synergy: the ranks on the board, minus the first rank (the kitten), which never counts. */
export function countedRanks(owned: readonly boolean[]): boolean[] {
  return owned.map((on, rank) => on && rank >= SYNERGY_MIN_RANK);
}

/** How many cats of exactly this kind stand on the board. */
export function countOf(board: BoardLike, id: UnitId): number {
  let n = 0;
  for (const u of board) if (u && u.id === id) n++;
  return n;
}

/** Cats per rank of one class: index = rank, so a lit slot of the ladder is a count above zero. */
export function rankCounts(classId: ClassId, board: BoardLike): number[] {
  return ladderOf(classId).map((id) => countOf(board, id));
}

export type PlanKind = 'merge' | 'awaken' | 'top';

export interface BuildPlan {
  kind: PlanKind;
  /** The cat this one turns into; null at the top rank. */
  result: UnitId | null;
  /** Identical cats on the board, the selected one included. */
  twins: number;
}

/** What the selected cat becomes: the next rank by merging (common to epic), the mythic by awakening (legendary), nothing at the top. */
export function planOf(id: UnitId, board: BoardLike): BuildPlan {
  const twins = countOf(board, id);
  const merged = mergeResultOf(id);
  if (merged) return { kind: 'merge', result: merged, twins };
  const mythic = mythicOf(id);
  if (mythic) return { kind: 'awaken', result: mythic, twins };
  return { kind: 'top', result: null, twins };
}

/** Whether `need` identical cats are on the board and merging is possible: the player has a pair to drag. */
export function canMergeNow(plan: BuildPlan): boolean {
  return plan.kind === 'merge' && plan.twins >= MERGE_NEED;
}

/** First two cells holding the same mergeable cat (common to epic), or null: what the first-time hint waits for. */
export function findTwins(board: BoardLike): [number, number] | null {
  for (let a = 0; a < board.length; a++) {
    const ua = board[a];
    if (!ua || mergeResultOf(ua.id) === null) continue;
    for (let b = a + 1; b < board.length; b++) if (board[b]?.id === ua.id) return [a, b];
  }
  return null;
}

export interface TierGoal {
  /** The synergy tier the next step reaches. */
  tier: number;
  /** Different cats still missing for it. */
  missing: number;
}

/** The next synergy step of a class and how many more different cats it takes; null at the top tier. */
export function nextTierGoal(distinct: number): TierGoal | null {
  const now = tierForDistinct(distinct);
  const at = SYNERGY_TIER_AT[now];
  if (at === undefined) return null;
  return { tier: now + 1, missing: Math.max(0, at - distinct) };
}

/**
 * The cat to put in the result photo: among the cats that reached the run's best rarity, the one that
 * dealt the most damage, else one still standing on the board; null when nothing qualifies.
 */
export function bestCat(
  stats: Pick<RunStats, 'bestRarity' | 'damageByUnit'>,
  board: BoardLike,
  rarityOf: (id: UnitId) => RarityId,
): UnitId | null {
  let best: UnitId | null = null;
  let bestDamage = -1;
  const consider = (id: UnitId, damage: number): void => {
    if (rarityOf(id) !== stats.bestRarity || damage <= bestDamage) return;
    best = id;
    bestDamage = damage;
  };
  for (const [id, damage] of Object.entries(stats.damageByUnit)) consider(id as UnitId, damage ?? 0);
  for (const u of board) if (u) consider(u.id, 0);
  return best;
}
