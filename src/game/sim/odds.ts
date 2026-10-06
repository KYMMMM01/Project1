/** Summon rarity odds, soft pity and the "how lucky was I" score (rules §4). Pure functions. */
import { LUCK_SCORE, PITY_LIMIT, PITY_MAX, PITY_STEP, SUMMON_ODDS } from '../data/balance';

export const ODDS_RARITIES = 4;

/** Extra epic-or-better chance after `epicDry` summons without one (0 until the limit is reached). */
export function pityBonus(epicDry: number): number {
  if (epicDry < PITY_LIMIT) return 0;
  const bonus = PITY_STEP * (epicDry - PITY_LIMIT + 1);
  return bonus > PITY_MAX ? PITY_MAX : bonus;
}

/** Moves up to `amount` of probability into epic, taking it from common first, then from rare. */
function shiftToEpic(p: number[], amount: number): void {
  const fromCommon = Math.min(amount, p[0] as number);
  p[0] = (p[0] as number) - fromCommon;
  const fromRare = Math.min(amount - fromCommon, p[1] as number);
  p[1] = (p[1] as number) - fromRare;
  p[2] = (p[2] as number) + fromCommon + fromRare;
}

/**
 * Probability of [common, rare, epic, legendary] for the next summon. `epicBoost` is the daily
 * "lucky day" bonus. Writes into `out` (length 4) and returns it.
 */
export function computeOdds(out: number[], grade: number, epicDry: number, epicBoost: number): number[] {
  const row = SUMMON_ODDS[grade] as readonly number[];
  for (let i = 0; i < ODDS_RARITIES; i++) out[i] = (row[i] as number) / 100;
  if (epicBoost > 0) shiftToEpic(out, epicBoost);
  const pity = pityBonus(epicDry);
  if (pity > 0) shiftToEpic(out, pity);
  return out;
}

/** Index (0..3) of the rarity a uniform `u` in [0, 1) lands on. */
export function rollRarity(u: number, probs: readonly number[]): number {
  let acc = 0;
  for (let i = 0; i < ODDS_RARITIES - 1; i++) {
    acc += probs[i] as number;
    if (u < acc) return i;
  }
  // The last bucket with a positive probability takes the rounding remainder.
  for (let i = ODDS_RARITIES - 1; i > 0; i--) if ((probs[i] as number) > 0) return i;
  return 0;
}

/** Running totals of the luck score: the sum of results and the mean / variance their odds imply. */
export interface LuckTotals {
  score: number;
  mean: number;
  variance: number;
}

export function addLuck(t: LuckTotals, probs: readonly number[], result: number): void {
  let mean = 0;
  let sq = 0;
  for (let i = 0; i < ODDS_RARITIES; i++) {
    const p = probs[i] as number;
    const v = LUCK_SCORE[i] as number;
    mean += p * v;
    sq += p * v * v;
  }
  t.score += LUCK_SCORE[result] as number;
  t.mean += mean;
  t.variance += sq - mean * mean;
}

/** Abramowitz-Stegun 7.1.26 error function, accurate to about 1.5e-7. */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  return sign * (1 - poly * Math.exp(-a * a));
}

/** Share of equally long summon sequences that rolled worse than this one (0.5 = average). */
export function luckShare(t: LuckTotals): number {
  if (t.variance <= 1e-9) return 0.5;
  const z = (t.score - t.mean) / Math.sqrt(t.variance);
  return 0.5 * (1 + erf(z / Math.SQRT2));
}
