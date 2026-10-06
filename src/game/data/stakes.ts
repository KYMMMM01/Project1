/** Butler difficulty (stakes 0..5, cumulative; rules §13). */
import { t } from '@/core/i18n';
import { ACT_PURR, ENEMY_CAP, FREE_REROLLS, OFFER_OPTIONS } from './balance';
import { MAX_STAKE } from './roster';
import type { StakeRules } from './types';
import './stringsGame';

/** The rule each stake adds (stake n adds STEPS[n - 1] on top of all lower ones). */
export const STAKE_STEPS = {
  enemyCapCut: 18,
  actPurr: 1,
  summonCostMult: 1.1,
  bossTimeCut: 10,
  relicChoices: 2,
  freeRerolls: 0,
  specialHpMult: 1.4,
} as const;

/** Effective rules at `stake` (clamped to 0..MAX_STAKE). */
export function stakeRules(stake: number): StakeRules {
  const s = stake < 0 ? 0 : stake > MAX_STAKE ? MAX_STAKE : Math.floor(stake);
  return {
    enemyCapCut: s >= 1 ? STAKE_STEPS.enemyCapCut : 0,
    actPurr: s >= 2 ? STAKE_STEPS.actPurr : ACT_PURR,
    summonCostMult: s >= 3 ? STAKE_STEPS.summonCostMult : 1,
    bossTimeCut: s >= 4 ? STAKE_STEPS.bossTimeCut : 0,
    relicChoices: s >= 5 ? STAKE_STEPS.relicChoices : OFFER_OPTIONS,
    freeRerolls: s >= 5 ? STAKE_STEPS.freeRerolls : FREE_REROLLS,
    specialHpMult: s >= 5 ? STAKE_STEPS.specialHpMult : 1,
  };
}

/** The sentence describing the rule stake `n` (1..5) adds. */
export function stakeText(n: number): string {
  switch (n) {
    case 1: return t('stake.1', { a: ENEMY_CAP - STAKE_STEPS.enemyCapCut });
    case 2: return t('stake.2', { a: STAKE_STEPS.actPurr });
    case 3: return t('stake.3', { a: Math.round((STAKE_STEPS.summonCostMult - 1) * 100) });
    case 4: return t('stake.4', { a: STAKE_STEPS.bossTimeCut });
    case 5: return t('stake.5', { a: STAKE_STEPS.relicChoices, b: Math.round((STAKE_STEPS.specialHpMult - 1) * 100) });
    default: return t('stake.0');
  }
}
