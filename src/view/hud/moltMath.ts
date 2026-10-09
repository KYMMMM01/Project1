import type { BattleApi } from '@/game';

/**
 * What a molt button says about itself: `ready` (tap to choose the class), `short` (the cat's rank costs more purr than there is), `spent`
 * (every molt of the run is used) or `none` (a guardian cannot molt: its price is -1).
 */
export type MoltState = 'ready' | 'short' | 'spent' | 'none';

/** `cost` is the price of this cat's rank (`moltCostOf`, -1 for a guardian), `left` the molts the run still allows. */
export function moltState(cost: number, left: number, purr: number): MoltState {
  if (cost < 0) return 'none';
  if (left <= 0) return 'spent';
  return purr >= cost ? 'ready' : 'short';
}

/** The refusal a state gives when the button is pressed (the same codes the simulation answers a molt with), or null when it opens the picker. */
export function moltRefusal(state: MoltState): 'not_available' | 'molt_limit' | 'not_enough_purr' | null {
  if (state === 'none') return 'not_available';
  if (state === 'spent') return 'molt_limit';
  return state === 'short' ? 'not_enough_purr' : null;
}

/** The numbers a refusal's sentence can quote: the price of the selected cat's molt (the cheapest one with no cat selected), the awakening price and the purr in hand. */
export function costArgs(b: Pick<BattleApi, 'moltCost' | 'moltCostOf' | 'awakenCost' | 'purr' | 'moltsLeft'>, cell: number | null): { cost: number; awaken: number; have: number; left: number } {
  const own = cell === null ? -1 : b.moltCostOf(cell);
  return { cost: own >= 0 ? own : b.moltCost(), awaken: b.awakenCost(), have: b.purr, left: b.moltsLeft() };
}
