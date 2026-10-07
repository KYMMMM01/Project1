import { describe, expect, it } from 'vitest';
import { setLang } from '@/core/i18n';
import { formatOdds } from '@/ui/oddsMath';
import { bundleParts } from '@/meta/bundle';
import { IAP_SPECS } from '@/meta/data/catalog';
import { ODDS, oddsView } from '@/meta/odds';
import { createTestProfile } from '@/meta/testing';
import type { ChestCard, ChestKind, ChestResult } from '@/meta/types';
import '@/meta/strings';
import '../src/screens/shop/strings';
import { couponPath, cutPoly, lowered } from '../src/screens/shop/cutMath';
import {
  bestRarity, flourishOf, gridLayout, mergePile, nameBlockOf, pilesOf, resultsOf, stacksOf, totalCards,
} from '../src/screens/shop/revealPlan';
import {
  chestAction, cosmeticStatus, gemBonusPercent, isBundleParts, isShopSection, listBundleProducts, partAmount, partLabel, pileSize, shortBy,
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
});

describe('reveal grid', () => {
  it('fits every plate and its name inside the area and centres each row', () => {
    for (const n of [1, 2, 3, 5, 8, 12, 16, 20, 24]) {
      const g = gridLayout(n, 672, 700);
      expect(g.slots).toHaveLength(n);
      expect(g.scale).toBeLessThanOrEqual(1.5);
      for (const s of g.slots) {
        expect(s.x - g.cellW / 2).toBeGreaterThanOrEqual(-0.5);
        expect(s.x + g.cellW / 2).toBeLessThanOrEqual(672.5);
        expect(s.y - g.plateH / 2).toBeGreaterThanOrEqual(-0.5);
        expect(s.y + g.plateH / 2 + g.nameBlock).toBeLessThanOrEqual(700.5);
      }
      const lastRow = g.slots.slice((g.rows - 1) * g.cols);
      const first = lastRow[0] as { x: number };
      const last = lastRow[lastRow.length - 1] as { x: number };
      expect(first.x + last.x).toBeCloseTo(672, 3);
    }
  });

  it('prefers a compact block of fewer rows when its plates are nearly as big as the biggest', () => {
    // Four plates: two rows of two would be a touch bigger, one row of four is nearly as big and has no wide gaps.
    const four = gridLayout(4, 672, 700);
    expect(four.rows).toBe(1);
    expect(four.scale).toBeGreaterThan(1.3);
    // Five do not fit one row at a useful size: two rows.
    expect(gridLayout(5, 672, 700).rows).toBe(2);
  });

  it('uses bigger plates when there are few and keeps them readable when there are many', () => {
    expect(gridLayout(4, 672, 700).scale).toBeGreaterThan(gridLayout(20, 672, 700).scale);
    expect(gridLayout(20, 672, 700).scale).toBeGreaterThanOrEqual(0.7);
  });

  it('makes room for a second name line instead of shrinking the name', () => {
    const one = gridLayout(12, 672, 700, () => nameBlockOf(1));
    const two = gridLayout(12, 672, 700, () => nameBlockOf(2));
    expect(two.nameBlock).toBeGreaterThan(one.nameBlock);
    expect(two.scale).toBeLessThanOrEqual(one.scale);
    for (const s of two.slots) expect(s.y + two.plateH / 2 + two.nameBlock).toBeLessThanOrEqual(700.5);
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

describe('reward parts', () => {
  it('names and counts every kind of part', () => {
    setLang('ko');
    const parts = bundleParts({ gold: 500, gems: 20, tickets: 2, chests: { silver: 1 }, wild: { epic: 4 }, cards: { w_paw: 20 }, cosmetics: ['rug_baby'] });
    expect(isBundleParts(parts)).toBe(true);
    expect(parts).toHaveLength(7);
    const of = (kind: string) => parts.find((p) => p.kind === kind) as (typeof parts)[number];
    expect(partAmount(of('gold'))).toBe(500);
    expect(partAmount(of('card'))).toBe(20);
    expect(partAmount(of('cosmetic'))).toBe(1);
    expect(partLabel(of('chest'))).toBe('은 상자');
    expect(partLabel(of('wild'))).toContain('골목대장');
    expect(partLabel(of('card'))).toBe('솜방망이');
    expect(isBundleParts({})).toBe(false);
  });
});

describe('gem pack value', () => {
  it('compares gems per won with the cheapest pack', () => {
    const bonus = (id: string) => gemBonusPercent(IAP_SPECS.find((s) => s.id === id) as (typeof IAP_SPECS)[number], IAP_SPECS);
    expect(['gems_260', 'gems_680', 'gems_1450', 'gems_4600'].map(bonus)).toEqual([0, 5, 12, 18]);
  });
});

describe('chest reveal plan', () => {
  it('piles up several chests into one view of cards, bonuses, gold and ids', () => {
    const results = [
      { id: 7, kind: 'gold', seed: 1, oddsVersion: 1, upgraded: 0, overflowGold: 5, batch: 7, cards: [card('common', 'w_paw'), card('rare', null)], pity: { unit: null, cards: 0 } },
      { id: 8, kind: 'gold', seed: 2, oddsVersion: 1, upgraded: 0, overflowGold: 0, batch: 7, cards: [card('common', 'w_paw'), card('legendary', 'w_samurai')], pity: { unit: 'w_samurai', cards: 8 } },
    ];
    const pile = mergePile(results as ChestResult[]);
    expect(pile).toMatchObject({ kind: 'gold', count: 2, overflowGold: 5, ids: [7, 8] });
    expect(pile.bonuses).toEqual([{ unit: 'w_samurai', cards: 8 }]);
    const merged = stacksOf(pile);
    expect(merged.find((s) => s.key === 'w_paw')?.count).toBe(2);
    expect(merged.find((s) => s.key === 'bonus:w_samurai')?.count).toBe(8);
    expect(totalCards(merged)).toBe(4 + 8);
    expect(bestRarity(merged)).toBe('legendary');
    // Two bonuses for the same cat make one stack.
    const twice = stacksOf({ cards: [], bonuses: [{ unit: 'w_samurai', cards: 8 }, { unit: 'w_samurai', cards: 8 }] });
    expect(twice).toHaveLength(1);
    expect(twice[0]?.count).toBe(16);
  });

  it('replays stored chests of one pile as one opening and lone chests one by one', () => {
    const r = (id: number, batch?: number) => ({ id, kind: 'wooden', seed: id, oddsVersion: 1, upgraded: 0, overflowGold: 0, cards: [], pity: { unit: null, cards: 0 }, ...(batch !== undefined ? { batch } : {}) }) as ChestResult;
    const list = [r(1), r(2, 2), r(3, 2), r(4, 2), r(5), r(6, 6), r(7, 6)];
    expect(pilesOf(list).map((p) => p.map((x) => x.id))).toEqual([[1], [2, 3, 4], [5], [6, 7]]);
  });

  it('plays a single result or a list of them and nothing else', () => {
    const r = { id: 1, kind: 'silver', seed: 1, oddsVersion: 1, upgraded: 0, overflowGold: 0, cards: [], pity: { unit: null, cards: 0 } };
    expect(resultsOf(r)).toEqual([r]);
    expect(resultsOf([r, r])).toHaveLength(2);
    expect(resultsOf([])).toBeNull();
    expect(resultsOf({ id: 'x' })).toBeNull();
    expect(resultsOf([r, 5])).toBeNull();
  });

  it('shows "open all" from two chests on, never for more than the cap', () => {
    expect([0, 1, 2, 4, 50, 51, 500].map(pileSize)).toEqual([0, 0, 2, 4, 50, 50, 50]);
  });

  it('adds a flourish with every rarity and gives the best card the big finish', () => {
    const rarities = ['common', 'rare', 'epic', 'legendary'] as const;
    const marks = (r: (typeof rarities)[number], best: boolean) => {
      const f = flourishOf(r, best);
      return [f.tape, f.stamp, f.sun, f.confetti].filter(Boolean).length;
    };
    expect(flourishOf('common', false)).toEqual({ dust: true, tape: false, stamp: false, sun: false, confetti: false });
    expect(rarities.map((r) => marks(r, false))).toEqual([0, 1, 2, 2]);
    expect(rarities.map((r) => marks(r, true))).toEqual([0, 1, 3, 4]);
    expect(flourishOf('rare', true).sun).toBe(false);
  });
});

describe('cut paper geometry', () => {
  const has = (pts: number[], px: number, py: number) =>
    pts.some((v, k) => k % 2 === 0 && Math.abs(v - px) < 0.01 && Math.abs((pts[k + 1] as number) - py) < 0.01);

  it('cuts a die-cut coupon with a notch on each side of the perforation', () => {
    const w = 640;
    const h = 250;
    const across = couponPath(w, h, { axis: 'x', at: 190, r: 14 });
    const xs = across.filter((_, k) => k % 2 === 0);
    const ys = across.filter((_, k) => k % 2 === 1);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(w);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(h);
    expect(has(across, 190, 14)).toBe(true);
    expect(has(across, 190, h - 14)).toBe(true);
    const down = couponPath(326, 336, { axis: 'y', at: 176, r: 14 });
    expect(has(down, 14, 176)).toBe(true);
    expect(has(down, 326 - 14, 176)).toBe(true);
  });

  it('wobbles an edge by a pixel or so, the same way every time', () => {
    const rect = [0, 0, 300, 0, 300, 90, 0, 90];
    const a = cutPoly(rect, 7, 1.2);
    expect(cutPoly(rect, 7, 1.2)).toEqual(a);
    expect(cutPoly(rect, 8, 1.2)).not.toEqual(a);
    expect(a.length).toBeGreaterThan(rect.length);
    for (let i = 0; i < a.length; i += 2) {
      const x = a[i] as number;
      const y = a[i + 1] as number;
      const off = Math.min(Math.abs(y), Math.abs(y - 90), Math.abs(x), Math.abs(x - 300));
      expect(off).toBeLessThanOrEqual(1.2001);
    }
    expect(lowered(rect, 5)).toEqual([0, 5, 300, 5, 300, 95, 0, 95]);
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
