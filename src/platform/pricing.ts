/**
 * Catalogue price rules. Pure (no DOM, no SDK): used by IapService.registerProducts and unit-tested.
 *
 * Apps in Toss sells at 400..1,400,000 KRW in 10 KRW steps, VAT excluded (docs/research/02 B-3). Our
 * catalogue states VAT-included prices, so a valid Toss price is a multiple of 11 within 440..1,540,000.
 */
import type { ChannelPrice, IapProductDef, PlatformId } from './types';

export const TOSS_PRICE_MIN_KRW = 440;
export const TOSS_PRICE_MAX_KRW = 1_540_000;
export const TOSS_PRICE_STEP_KRW = 11;

export type PriceProblem = 'not_integer' | 'below_min' | 'above_max' | 'not_multiple_of_11';

/** Every rule a Toss price (KRW, VAT included) breaks. Empty means valid. */
export function tossPriceProblems(krw: number): PriceProblem[] {
  if (!Number.isInteger(krw)) return ['not_integer'];
  const out: PriceProblem[] = [];
  if (krw < TOSS_PRICE_MIN_KRW) out.push('below_min');
  if (krw > TOSS_PRICE_MAX_KRW) out.push('above_max');
  if (krw % TOSS_PRICE_STEP_KRW !== 0) out.push('not_multiple_of_11');
  return out;
}

export function isValidTossPriceKrw(krw: number): boolean {
  return tossPriceProblems(krw).length === 0;
}

export type CatalogueProblem = PriceProblem | 'bad_amount' | 'wrong_currency' | 'missing_price';

export interface PriceIssue {
  productId: string;
  channel: PlatformId;
  problem: CatalogueProblem;
}

/**
 * Check the per-channel price data of a catalogue. Every stated amount must be a positive finite
 * number; the Toss entry must be KRW and obey the Toss rules. With `buildChannel === 'toss'` a product
 * without a Toss price is an issue too (the console would reject it).
 */
export function validateCatalogue(defs: readonly IapProductDef[], buildChannel?: string): PriceIssue[] {
  const issues: PriceIssue[] = [];
  for (const d of defs) {
    const prices: Partial<Record<PlatformId, ChannelPrice>> = d.prices ?? {};
    for (const channel of Object.keys(prices) as PlatformId[]) {
      const p = prices[channel];
      if (!p) continue;
      if (!Number.isFinite(p.amount) || p.amount <= 0) {
        issues.push({ productId: d.id, channel, problem: 'bad_amount' });
        continue;
      }
      if (channel !== 'toss') continue;
      if (p.currency !== 'KRW') {
        issues.push({ productId: d.id, channel, problem: 'wrong_currency' });
        continue;
      }
      for (const problem of tossPriceProblems(p.amount)) issues.push({ productId: d.id, channel, problem });
    }
    if (buildChannel === 'toss' && !prices.toss) issues.push({ productId: d.id, channel: 'toss', problem: 'missing_price' });
  }
  return issues;
}
