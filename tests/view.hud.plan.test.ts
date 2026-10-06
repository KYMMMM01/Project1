import { describe, expect, it } from 'vitest';
import {
  CLASS_IDS,
  RARITIES,
  UNIT_GRID,
  mergeResultOf,
  unitClass,
  unitRarity,
  type RunStats,
  type UnitId,
} from '@/game';
import {
  MERGE_NEED,
  bestCat,
  canMergeNow,
  countOf,
  findTwins,
  ladderOf,
  nextTierGoal,
  planOf,
  rankCounts,
} from '@/view/hud/planMath';

const unit = (id: UnitId): { id: UnitId } => ({ id });

describe('what a cat becomes', () => {
  it('merges into the next rank of the same class, for every class and rank up to epic', () => {
    for (const c of CLASS_IDS) {
      for (let r = 0; r <= 2; r++) {
        const id = UNIT_GRID[c][r] as UnitId;
        const plan = planOf(id, []);
        expect(plan.kind).toBe('merge');
        expect(plan.result).toBe(UNIT_GRID[c][r + 1]);
        expect(plan.result).toBe(mergeResultOf(id));
        expect(unitClass(plan.result as UnitId)).toBe(c);
      }
    }
  });

  it('awakens a king into the guardian of its own class and stops at the guardian', () => {
    for (const c of CLASS_IDS) {
      const king = planOf(UNIT_GRID[c][3] as UnitId, []);
      expect(king).toMatchObject({ kind: 'awaken', result: UNIT_GRID[c][4] });
      expect(planOf(UNIT_GRID[c][4] as UnitId, [])).toMatchObject({ kind: 'top', result: null });
    }
  });

  it('counts identical cats and says when a pair can be dragged', () => {
    const board = [unit('w_paw'), null, unit('w_paw'), unit('w_sword'), null];
    expect(countOf(board, 'w_paw')).toBe(2);
    const pair = planOf('w_paw', board);
    expect(pair.twins).toBe(MERGE_NEED);
    expect(canMergeNow(pair)).toBe(true);
    const single = planOf('w_sword', board);
    expect(single.twins).toBe(1);
    expect(canMergeNow(single)).toBe(false);
  });

  it('never offers a merge for kings or guardians even when two stand on the board', () => {
    const board = [unit('w_samurai'), unit('w_samurai')];
    expect(canMergeNow(planOf('w_samurai', board))).toBe(false);
    expect(findTwins(board)).toBeNull();
  });
});

describe('the class ladder', () => {
  it('lists five ranks per class from kitten to guardian', () => {
    for (const c of CLASS_IDS) {
      const line = ladderOf(c);
      expect(line).toHaveLength(RARITIES.length);
      expect(line.map((id) => unitRarity(id))).toEqual([...RARITIES]);
    }
  });

  it('counts the cats of each rank and leaves the other classes out', () => {
    const board = [unit('r_sling'), unit('r_sling'), unit('r_archer'), unit('w_paw'), null, unit('r_star')];
    expect(rankCounts('ranger', board)).toEqual([2, 1, 0, 0, 1]);
    expect(rankCounts('warrior', board)).toEqual([1, 0, 0, 0, 0]);
    expect(rankCounts('mage', board)).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('first pair of identical cats', () => {
  it('finds the first mergeable pair in cell order', () => {
    const board: Array<{ id: UnitId } | null> = Array.from({ length: 20 }, () => null);
    board[3] = unit('m_snow');
    board[7] = unit('r_sling');
    board[9] = unit('m_snow');
    board[15] = unit('r_sling');
    expect(findTwins(board)).toEqual([3, 9]);
  });

  it('finds nothing on a board of different cats', () => {
    expect(findTwins([unit('w_paw'), unit('w_sword'), null, unit('m_snow')])).toBeNull();
    expect(findTwins([])).toBeNull();
  });
});

describe('next synergy step', () => {
  it('asks for the cats still missing and ends at the top tier', () => {
    expect(nextTierGoal(0)).toEqual({ tier: 1, missing: 2 });
    expect(nextTierGoal(1)).toEqual({ tier: 1, missing: 1 });
    expect(nextTierGoal(2)).toEqual({ tier: 2, missing: 1 });
    expect(nextTierGoal(3)).toEqual({ tier: 3, missing: 1 });
    expect(nextTierGoal(4)).toBeNull();
    expect(nextTierGoal(5)).toBeNull();
  });
});

describe('best cat of a run', () => {
  const stats = (bestRarity: RunStats['bestRarity'], damageByUnit: RunStats['damageByUnit']): Pick<RunStats, 'bestRarity' | 'damageByUnit'> => ({
    bestRarity,
    damageByUnit,
  });

  it('takes the hardest hitter among the cats of the best rarity', () => {
    const s = stats('legendary', { w_samurai: 900, m_frost: 4200, w_paw: 99999 });
    expect(bestCat(s, [], unitRarity)).toBe('m_frost');
  });

  it('falls back to a cat still standing on the board', () => {
    expect(bestCat(stats('epic', {}), [unit('w_paw'), unit('t_bard')], unitRarity)).toBe('t_bard');
  });

  it('has no best cat when nobody of that rarity is known', () => {
    expect(bestCat(stats('mythic', {}), [unit('w_paw')], unitRarity)).toBeNull();
  });
});
