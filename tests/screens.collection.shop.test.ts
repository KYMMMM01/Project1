import { describe, expect, it } from 'vitest';
import { setLang } from '@/core/i18n';
import { formatOdds } from '@/ui/oddsMath';
import { bundleParts } from '@/meta/bundle';
import { IAP_SPECS } from '@/meta/data/catalog';
import { ODDS, oddsView } from '@/meta/odds';
import { createTestProfile } from '@/meta/testing';
import type { ChestCard, ChestKind } from '@/meta/types';
import '@/meta/strings';
import '../src/screens/shop/strings';
import { bestRarity, gridLayout, revealSchedule, stacksOf, totalCards } from '../src/screens/shop/revealPlan';
import {
  chestAction, cosmeticStatus, flyingCurrencies, isBundleParts, isShopSection, listBundleProducts, rewardDescs, shortBy,
} from '../src/screens/shop/shopLogic';

const card = (rarity: ChestCard['rarity'], unit: ChestCard['unit']): ChestCard => ({ rarity, unit });

describe('reveal stacks', () => {
  const cards = [
    card('common', 'w_paw'), card('common', 'w_paw'), card('rare', 'r_archer'), card('common', null), card('legendary', 'm_frost'),
    card('common', 'w_paw'), card('epic', null),
  ];
  const stacks = stacksOf({ cards, pity: { unit: null, cards: 0 } });

  it('groups equal cards, keeps wild cards apart and ends on the best rarity', () => {
    expect(totalCards(stacks)).toBe(cards.length);
    expect(stacks.find((s) => s.key === 'w_paw')?.count).toBe(3);
    expect(stacks.find((s) => s.key === 'wild:common')?.unit).toBeNull();
    expect(stacks[stacks.length - 1]?.key).toBe('m_frost');
    expect(bestRarity(stacks)).toBe('legendary');
    for (let i = 1; i < stacks.length; i++) {
      const order = ['common', 'rare', 'epic', 'legendary'];
      expect(order.indexOf((stacks[i] as { rarity: string }).rarity)).toBeGreaterThanOrEqual(order.indexOf((stacks[i - 1] as { rarity: string }).rarity));
    }
  });

  it('adds the pity cards as their own bonus stack', () => {
    const s = stacksOf({ cards: [card('legendary', 'w_samurai')], pity: { unit: 'w_samurai', cards: 8 } });
    expect(s).toHaveLength(2);
    expect(s[1]).toMatchObject({ bonus: true, count: 8, unit: 'w_samurai' });
  });

  it('a wooden chest reveals in about a second and a half; rarer contents take longer', () => {
    const wood = stacksOf({ cards: [card('common', 'w_paw'), card('common', 'r_sling'), card('common', null), card('rare', 'w_sword'), card('common', 'm_snow')], pity: { unit: null, cards: 0 } });
    const a = revealSchedule(wood);
    expect(a.total).toBeGreaterThan(1.2);
    expect(a.total).toBeLessThan(2.1);
    const b = revealSchedule(stacks);
    expect(b.total).toBeGreaterThan(a.total + 0.8);
    expect(b.flightAt).toHaveLength(stacks.length);
    for (let i = 1; i < b.flightAt.length; i++) expect(b.flightAt[i] as number).toBeGreaterThan(b.flightAt[i - 1] as number);
  });

  it('keeps the flip phase of a huge chest bounded', () => {
    const many = Array.from({ length: 24 }, (_, i) => ({ key: 'k' + i, unit: null, rarity: 'common' as const, count: 2, bonus: false }));
    const s = revealSchedule(many);
    expect(s.lastFlipAt - s.rattle).toBeLessThan(3.2);
  });
});

describe('reveal grid', () => {
  it('fits every card inside the area and centres the last row', () => {
    for (const n of [1, 2, 3, 5, 8, 12, 16, 20]) {
      const g = gridLayout(n, 672, 700);
      expect(g.slots).toHaveLength(n);
      for (const s of g.slots) {
        expect(s.x - g.cardW / 2).toBeGreaterThanOrEqual(-0.5);
        expect(s.x + g.cardW / 2).toBeLessThanOrEqual(672.5);
        expect(s.y + g.cardH / 2).toBeLessThanOrEqual(700.5);
      }
    }
    const g = gridLayout(5, 672, 700);
    expect(g.cols).toBe(3);
    const lastRow = g.slots.slice(3);
    expect((lastRow[0] as { x: number }).x + (lastRow[1] as { x: number }).x).toBeCloseTo(672, 3);
  });

  it('uses bigger cards when there are few', () => {
    expect(gridLayout(4, 672, 700).size).toBe('medium');
    expect(gridLayout(20, 672, 700).size).toBe('small');
  });
});

describe('shop decisions', () => {
  it('lists only plain packs the player can still buy', async () => {
    const { profile } = await createTestProfile();
    const all = listBundleProducts(IAP_SPECS, (id) => profile.isPurchasable(id));
    expect(all.map((s) => s.id)).toEqual(['baby_cat_pack', 'starter_pack', 'growth_pack', 'gems_260', 'gems_680', 'gems_1450', 'gems_4600']);
    await profile.grantOrder('starter_pack', 'o1');
    const after = listBundleProducts(IAP_SPECS, (id) => profile.isPurchasable(id));
    expect(after.map((s) => s.id)).not.toContain('starter_pack');
    expect(listBundleProducts(IAP_SPECS, () => false)).toEqual([]);
  });

  it('picks the chest action, the missing amount and the cosmetic state', async () => {
    expect(chestAction(0)).toBe('buy');
    expect(chestAction(2)).toBe('open');
    expect(shortBy(150, 40)).toBe(110);
    expect(shortBy(150, 400)).toBe(0);
    const { profile } = await createTestProfile();
    const rows = profile.cosmetics();
    const by = (id: string) => rows.find((r) => r.id === id) as (typeof rows)[number];
    expect(cosmeticStatus(by('rug_default'))).toEqual({ kind: 'equipped' });
    expect(cosmeticStatus(by('rug_gem1'))).toEqual({ kind: 'buy', gems: 400 });
    expect(cosmeticStatus(by('rug_ch2'))).toEqual({ kind: 'chapter', chapter: 2 });
    expect(cosmeticStatus(by('rug_baby'))).toEqual({ kind: 'reward' });
    expect(isShopSection('piggy')).toBe(true);
    expect(isShopSection('nope')).toBe(false);
  });
});

describe('reward tiles', () => {
  it('describes every kind of part and picks currencies to fly', () => {
    setLang('ko');
    const parts = bundleParts({ gold: 500, gems: 20, tickets: 2, chests: { silver: 1 }, wild: { epic: 4 }, cards: { w_paw: 20 }, cosmetics: ['rug_baby'] });
    expect(isBundleParts(parts)).toBe(true);
    const tiles = rewardDescs(parts, () => null);
    expect(tiles).toHaveLength(7);
    expect(tiles[0]).toMatchObject({ icon: 'coin', amount: 500 });
    expect(tiles.find((x) => x.icon === 'chest')?.label).toBe('은 상자');
    expect(tiles.find((x) => x.rarity === 'epic')?.label).toContain('골목대장');
    expect(flyingCurrencies(parts).map((c) => c.kind)).toEqual(['gold', 'gems', 'tickets']);
    expect(isBundleParts({})).toBe(false);
  });
});

describe('odds screen data', () => {
  it('shows the same numbers the draw code rolls from', () => {
    setLang('ko');
    for (const kind of ['wooden', 'silver', 'gold'] as ChestKind[]) {
      const view = oddsView(ODDS[kind], { goldOpened: 7, target: 'w_samurai' });
      expect(view.rows.map((r) => r.p)).toEqual(ODDS[kind].rows.map((r) => r.p));
      for (const r of view.rows) expect(formatOdds(r.p)).toBe(r.text);
    }
    expect(oddsView(ODDS.gold, { goldOpened: 7, target: 'w_samurai' }).pity?.counter).toBe(7);
  });
});
