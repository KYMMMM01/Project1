import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setLang, t } from '@/core/i18n';
import { AWAKEN_COST, MOLT_COSTS, MOLT_LIMIT } from '@/game';
import '@/game/data/strings';
import '@/view/hud/strings';
import { costArgs, moltRefusal, moltState } from '@/view/hud/moltMath';
import { CURRENCY_ROW, FISH_X, PURR_X, incomeShown } from '@/view/hud/incomeMath';
import { flies } from '@/view/landings';

beforeAll(() => {
  vi.stubGlobal('document', { documentElement: { lang: '' } });
});
afterAll(() => {
  setLang('ko');
  vi.unstubAllGlobals();
});

describe('what the molt button knows about itself', () => {
  it('is ready when the rank is paid, short when it is not, spent when the run has none left, none for a guardian', () => {
    for (const cost of MOLT_COSTS) {
      expect(moltState(cost, MOLT_LIMIT, cost)).toBe('ready');
      expect(moltState(cost, MOLT_LIMIT, cost - 1)).toBe('short');
      expect(moltState(cost, 0, 99)).toBe('spent');
    }
    expect(moltState(-1, MOLT_LIMIT, 99)).toBe('none');
    expect(moltState(-1, 0, 99)).toBe('none');
  });

  it('refuses with the code the simulation would answer, and opens the picker only when ready', () => {
    expect(moltRefusal('ready')).toBeNull();
    expect(moltRefusal('short')).toBe('not_enough_purr');
    expect(moltRefusal('spent')).toBe('molt_limit');
    expect(moltRefusal('none')).toBe('not_available');
  });

  it('quotes the price of the selected cat, the cheapest one with nothing selected, the awakening price and the purr in hand', () => {
    const b = { moltCost: () => 1, moltCostOf: (c: number) => (c === 4 ? 3 : c === 9 ? -1 : 2), awakenCost: () => AWAKEN_COST, purr: 5, moltsLeft: () => 4 };
    expect(costArgs(b, 4)).toEqual({ cost: 3, awaken: AWAKEN_COST, have: 5, left: 4 });
    expect(costArgs(b, 0).cost).toBe(2);
    expect(costArgs(b, 9).cost).toBe(1);
    expect(costArgs(b, null).cost).toBe(1);
  });

  for (const lang of ['ko', 'en'] as const) {
    it(`says the price and the purr in hand in the refusal of a short purse (${lang})`, () => {
      setLang(lang);
      const text = t('hud.fail.molt.not_enough_purr', { cost: 3, have: 1 });
      expect(text).toContain('3');
      expect(text).toContain('1');
      expect(text).not.toMatch(/\{\w+\}/);
      const awaken = t('hud.fail.awaken.not_enough_purr', { awaken: AWAKEN_COST, have: 4 });
      expect(awaken).toContain(String(AWAKEN_COST));
      expect(t('hud.fail.molt.not_available')).not.toMatch(/\{\w+\}|hud\.fail/);
      const info = t('hud.molt.info', { rank: t('rarity.legendary'), cost: 3, left: 6 });
      expect(info).toContain('3');
      expect(info).toContain(t('rarity.legendary'));
    });
  }
});

describe('the income tag beside the fish pill', () => {
  it('shows at most two decimals and none for a whole number', () => {
    expect(incomeShown(0.5)).toBe('0.5');
    expect(incomeShown(0.65)).toBe('0.65');
    expect(incomeShown(1)).toBe('1');
    expect(incomeShown(1.3)).toBe('1.3');
    expect(incomeShown(0.8000000000000002)).toBe('0.8');
    expect(incomeShown(2)).toBe('2');
  });

  it('is worded in both languages with the number in it', () => {
    for (const lang of ['ko', 'en'] as const) {
      setLang(lang);
      expect(t('hud.income', { n: '0.5' })).toContain('0.5');
      expect(t('hud.income.tip', { n: '0.5' })).toContain('0.5');
    }
  });

  it('fits the row: fish pill, tag, purr pill and the pity chip (104 px at least) before the odds button, nothing touching', () => {
    const fishRight = FISH_X + CURRENCY_ROW.fishW / 2;
    const tagRight = fishRight + CURRENCY_ROW.gap + CURRENCY_ROW.tagW;
    const purrIconLeft = PURR_X - CURRENCY_ROW.purrW / 2 - CURRENCY_ROW.purrIcon;
    const purrRight = PURR_X + CURRENCY_ROW.purrW / 2;
    const pityLeft = 592 - 104;
    expect(FISH_X - CURRENCY_ROW.fishW / 2).toBe(CURRENCY_ROW.left);
    expect(purrIconLeft - tagRight).toBeGreaterThanOrEqual(8);
    expect(pityLeft - purrRight).toBeGreaterThanOrEqual(4);
  });

  it('does not send a flying icon for the steady income, nor for the opening purse; everything else flies', () => {
    expect(flies('income')).toBe(false);
    expect(flies('start')).toBe(false);
    for (const reason of ['kill', 'wave', 'act', 'sell', 'boss'] as const) expect(flies(reason)).toBe(true);
  });
});
