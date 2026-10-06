import { describe, expect, it } from 'vitest';
import {
  TOSS_PRICE_MAX_KRW,
  TOSS_PRICE_MIN_KRW,
  isValidTossPriceKrw,
  tossPriceProblems,
  validateCatalogue,
} from '@/platform/pricing';
import type { IapProductDef } from '@/platform/types';
import { makeIap } from './platformHelpers';

describe('Toss price rule: KRW, VAT included, a multiple of 11, within 440..1,540,000', () => {
  it('the bounds are the Toss supply range 400..1,400,000 plus 10% VAT', () => {
    expect(TOSS_PRICE_MIN_KRW).toBe((400 * 11) / 10);
    expect(TOSS_PRICE_MAX_KRW).toBe((1_400_000 * 11) / 10);
  });

  it.each([440, 451, 1100, 3300, 5500, 6600, 9900, 11_000, 33_000, 1_539_989, 1_540_000])('accepts %i', (krw) => {
    expect(tossPriceProblems(krw)).toEqual([]);
    expect(isValidTossPriceKrw(krw)).toBe(true);
  });

  it.each([
    [439, ['below_min', 'not_multiple_of_11']],
    [429, ['below_min']], // 429 = 39 * 11, a multiple but below the floor
    [0, ['below_min']],
    [-1100, ['below_min']],
    [1000, ['not_multiple_of_11']],
    [1500, ['not_multiple_of_11']],
    [9901, ['not_multiple_of_11']],
    [1_540_001, ['above_max', 'not_multiple_of_11']],
    [1_540_011, ['above_max']], // a multiple, over the ceiling
    [2_000_000, ['above_max', 'not_multiple_of_11']],
  ] as const)('rejects %i: %j', (krw, problems) => {
    expect(tossPriceProblems(krw)).toEqual(problems);
    expect(isValidTossPriceKrw(krw)).toBe(false);
  });

  it('rejects anything that is not a whole number of won', () => {
    for (const bad of [1100.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(tossPriceProblems(bad)).toEqual(['not_integer']);
    }
  });

  it('every price of the GDD 8.3 catalogue passes', () => {
    for (const krw of [1100, 3300, 6600, 9900, 5500, 2200, 11_000, 33_000]) expect(isValidTossPriceKrw(krw)).toBe(true);
  });
});

const def = (id: string, prices?: IapProductDef['prices']): IapProductDef => ({
  id,
  type: 'consumable',
  price: { ko: '', en: '' },
  prices,
});

describe('validateCatalogue', () => {
  it('passes a clean catalogue and ignores products without price data', () => {
    expect(
      validateCatalogue([
        def('pass', { toss: { currency: 'KRW', amount: 9900 }, capacitor: { currency: 'USD', amount: 7.99 } }),
        def('free_form'),
      ]),
    ).toEqual([]);
  });

  it('reports every Toss problem with the product and channel', () => {
    const issues = validateCatalogue([
      def('a', { toss: { currency: 'KRW', amount: 1000 } }),
      def('b', { toss: { currency: 'KRW', amount: 100 } }),
      def('c', { toss: { currency: 'USD', amount: 9.9 } }),
      def('ok', { toss: { currency: 'KRW', amount: 1100 } }),
    ]);
    expect(issues).toEqual([
      { productId: 'a', channel: 'toss', problem: 'not_multiple_of_11' },
      { productId: 'b', channel: 'toss', problem: 'below_min' },
      { productId: 'b', channel: 'toss', problem: 'not_multiple_of_11' },
      { productId: 'c', channel: 'toss', problem: 'wrong_currency' },
    ]);
  });

  it('applies the Toss rule only to the Toss channel, but every channel needs a positive amount', () => {
    expect(validateCatalogue([def('a', { capacitor: { currency: 'KRW', amount: 1000 } })])).toEqual([]);
    expect(validateCatalogue([def('a', { capacitor: { currency: 'USD', amount: 0 } })])).toEqual([
      { productId: 'a', channel: 'capacitor', problem: 'bad_amount' },
    ]);
    expect(validateCatalogue([def('a', { poki: { currency: 'USD', amount: Number.NaN } })])).toEqual([
      { productId: 'a', channel: 'poki', problem: 'bad_amount' },
    ]);
  });

  it('a Toss build needs a Toss price on every product', () => {
    const defs = [def('a', { toss: { currency: 'KRW', amount: 1100 } }), def('b'), def('c', { capacitor: { currency: 'USD', amount: 1 } })];
    expect(validateCatalogue(defs, 'toss')).toEqual([
      { productId: 'b', channel: 'toss', problem: 'missing_price' },
      { productId: 'c', channel: 'toss', problem: 'missing_price' },
    ]);
    expect(validateCatalogue(defs, 'capacitor')).toEqual([]);
    expect(validateCatalogue(defs)).toEqual([]);
  });

  it('IapService.registerProducts returns the issues of the build channel and still registers everything', () => {
    const toss = makeIap({ channel: 'toss' });
    const issues = toss.iap.registerProducts([def('bad', { toss: { currency: 'KRW', amount: 1500 } }), def('good', { toss: { currency: 'KRW', amount: 1100 } })]);
    expect(issues).toEqual([{ productId: 'bad', channel: 'toss', problem: 'not_multiple_of_11' }]);
    expect(toss.iap.product('bad')).toBeDefined();
    expect(toss.iap.product('good')).toBeDefined();
    const web = makeIap({ channel: 'poki' });
    expect(web.iap.registerProducts([def('x')])).toEqual([]);
  });
});
