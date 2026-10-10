/** Butler difficulty (stakes 0..5, cumulative; rules §13). */
import { t } from '@/core/i18n';
import {
  ACT_PURR, ELITE_CC_FACTOR, ENEMY_CAP, FREE_REROLLS, OFFER_OPTIONS, SLOW_CAP_BOSS, STAKE_ELITE_CC_STEP, STAKE_SLOW_CAP_STEP,
} from './balance';
import { MAX_STAKE } from './roster';
import type { StakeRules } from './types';
import './stringsGame';

/** The rule each stake adds (stake n adds STEPS[n - 1] on top of all lower ones). */
export const STAKE_STEPS = {
  enemyCapCut: 18,
  actPurr: 1,
  summonCostMult: 1.1,
  bossTimeCut: 13,
  relicChoices: 2,
  freeRerolls: 0,
  specialHpMult: 1.4,
} as const;

/** Rounds away the float noise of a derived fraction (0.25 - 0.02 * 3 would be 0.19000000000000003). */
const clean = (v: number): number => Math.round(v * 1000) / 1000;

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
    // Level 0 returns the base constants themselves (not a derived copy), so a level-0 run is bit for bit what it was.
    specialSlowCap: s >= 1 ? clean(SLOW_CAP_BOSS - s * STAKE_SLOW_CAP_STEP) : SLOW_CAP_BOSS,
    eliteCcFactor: s >= 1 ? clean(ELITE_CC_FACTOR - s * STAKE_ELITE_CC_STEP) : ELITE_CC_FACTOR,
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

/**
 * The one line saying how much harder elites and bosses are to control at stake `n` (1..5), with that stake's own numbers (they are not
 * stacked: level 3 says 19%, not 23 + 21 + 19). Empty at level 0, where nothing changes.
 */
export function stakeControlText(n: number): string {
  if (!(n >= 1)) return '';
  const r = stakeRules(n);
  return t('stake.ctrl', { a: Math.round(r.specialSlowCap * 100), b: Math.round(r.eliteCcFactor * 100) });
}
