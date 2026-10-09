/** The gold dungeon's card and pre-run page, and the settings sheet's test block: their rules, without any drawing. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getLang, setLang, t, type Lang } from '@/core/i18n';
import { PLATFORM_ID } from '@/platform';
import { dungeonOffer, entriesText, shownTier, stepTier } from '@/screens/battle/dungeonModel';
import { selectionAfterRun } from '@/screens/battle/model';
import { planRun } from '@/screens/shell/runPlan';
import { TEST_TOOLS, testBundle, testTools } from '@/screens/system/testTools';
import { nextRunPlan } from '@/app/nextRun';
import { bundleParts } from '@/meta/bundle';
import { UNLOCK_ORDER, jumpTarget, sortUnlocks } from '@/screens/system/popupPolicy';
import { FEATURES } from '@/meta/data/schedule';
import '@/screens/battle/strings';
import '@/screens/shell/strings';
import '@/screens/system/strings';
import '@/meta/strings';

describe('what the card offers', () => {
  it('lets the player in while an entry is left, sells the extra one when the free ones are gone, and says tomorrow when everything is used', () => {
    expect(dungeonOffer({ entriesLeft: 2, canBuy: true })).toBe('enter');
    expect(dungeonOffer({ entriesLeft: 1, canBuy: false })).toBe('enter');
    expect(dungeonOffer({ entriesLeft: 0, canBuy: true })).toBe('buy');
    expect(dungeonOffer({ entriesLeft: 0, canBuy: false })).toBe('spent');
  });

  it('shows the tier the player picked while it is open, and otherwise the highest open one', () => {
    expect(shownTier(0, 0)).toBe(0);
    expect(shownTier(0, 3)).toBe(0);
    expect(shownTier(3, 0)).toBe(3);
    expect(shownTier(3, 2)).toBe(2);
    expect(shownTier(3, 5)).toBe(3);
    expect(shownTier(5, 1)).toBe(1);
  });

  it('steps through the open tiers and stops at both ends', () => {
    expect(stepTier(3, 3, 1)).toBe(3);
    expect(stepTier(3, 3, -1)).toBe(2);
    expect(stepTier(3, 1, -1)).toBe(1);
    expect(stepTier(3, 1, 1)).toBe(2);
    expect(stepTier(0, 1, 1)).toBe(1);
  });

  it('writes the entries left over the entries of the day, a bought one included', () => {
    expect(entriesText(2, 2, 0)).toBe('2/2');
    expect(entriesText(0, 2, 0)).toBe('0/2');
    expect(entriesText(1, 2, 1)).toBe('1/3');
  });
});

describe('the run the card starts', () => {
  const input = { cleared: [1, 1, 1, 0, 0], daily: { chapter: 2, modifiers: [] } };

  it('is the gold dungeon of the tier, at butler level 0, without a snack', () => {
    expect(planRun({ mode: 'gold', chapter: 3 }, input)).toEqual({ mode: 'gold', chapter: 3, stake: 0, modifiers: [], snackAllowed: false });
    expect(planRun({ mode: 'gold', chapter: 3, stake: 4 }, input).stake).toBe(0);
    expect(planRun({ mode: 'gold' }, input).chapter).toBe(1);
    expect(planRun({ mode: 'gold', chapter: 99 }, input).chapter).toBe(5);
  });

  it('leads nowhere after a win (no "next chapter"), and leaves the home tab on its chapter', () => {
    const run = { mode: 'gold', chapter: 3, stake: 0, victory: true, firstClear: false } as const;
    expect(nextRunPlan([1, 1, 1, 0, 0], run)).toBeNull();
    expect(selectionAfterRun([1, 1, 1, 0, 0], run, { chapter: 2, stake: 0 })).toEqual({ chapter: 2, stake: 0 });
  });
});

describe('the unlock of the dungeon', () => {
  it('is announced like the other features, in a place of its own, and leads to the home tab', () => {
    expect(FEATURES).toContain('dungeon');
    expect(UNLOCK_ORDER).toContain('dungeon');
    expect(jumpTarget('dungeon')).toBe('battle');
    expect(sortUnlocks(['endless', 'dungeon', 'daily'])).toEqual(['daily', 'endless', 'dungeon']);
  });
});

describe('the settings test block', () => {
  it('holds gold +10,000, gems +1,000 and tickets +5 on the development platform', () => {
    expect(testTools('dev')).toEqual(TEST_TOOLS);
    expect(TEST_TOOLS).toEqual([
      { currency: 'gold', amount: 10_000 },
      { currency: 'gems', amount: 1_000 },
      { currency: 'tickets', amount: 5 },
    ]);
  });

  it('is absent on every other platform: the stores and the portals never see it', () => {
    for (const id of ['itch', 'crazygames', 'poki', 'gd', 'yt', 'toss', 'capacitor', '', 'DEV', 'development']) expect(testTools(id), id).toEqual([]);
  });

  it('follows the platform this build is made for when no platform is named', () => {
    expect(testTools()).toEqual(PLATFORM_ID === 'dev' ? TEST_TOOLS : []);
  });

  it('flies what was granted: one currency part of that amount', () => {
    expect(bundleParts(testBundle('gold', 10_000))).toEqual([{ kind: 'gold', n: 10_000 }]);
    expect(bundleParts(testBundle('gems', 1_000))).toEqual([{ kind: 'gems', n: 1_000 }]);
    expect(bundleParts(testBundle('tickets', 5))).toEqual([{ kind: 'tickets', n: 5 }]);
  });
});

describe('the words', () => {
  const restore: Lang = getLang();
  beforeAll(() => {
    vi.stubGlobal('document', { documentElement: { lang: '' } });
  });
  afterAll(() => {
    setLang(restore);
    vi.unstubAllGlobals();
  });

  const keys = [
    'battle.dungeon.title', 'battle.dungeon.tier', 'battle.dungeon.entries', 'battle.dungeon.reward', 'battle.dungeon.best',
    'battle.dungeon.none', 'battle.dungeon.bonus', 'battle.dungeon.play', 'battle.dungeon.ad', 'battle.dungeon.buy',
    'battle.dungeon.spent', 'battle.dungeon.tomorrow', 'shell.pre.mode.gold', 'shell.pre.gold.rules.waves', 'shell.pre.gold.rules.pay',
    'shell.pre.gold.rules.win', 'shell.pre.gold.rules.first', 'rt.sys.section.test', 'rt.sys.test.hint', 'rt.sys.test.gold',
    'rt.sys.test.gems', 'rt.sys.test.tickets', 'rt.sys.test.got', 'rt.sys.test.full', 'rt.sys.feat.dungeon', 'meta.feature.dungeon',
  ];
  const holes = (s: string): string[] => (s.match(/\{\w+\}/g) ?? []).sort();

  it('exist in Korean and English with the same placeholders', () => {
    for (const key of keys) {
      setLang('ko');
      const ko = t(key);
      setLang('en');
      const en = t(key);
      expect(ko, key).not.toBe(key);
      expect(en, key).not.toBe(key);
      expect(holes(en), key).toEqual(holes(ko));
    }
  });

  it('read well with their numbers filled in', () => {
    setLang('ko');
    expect(t('rt.sys.test.gold', { n: '10,000' })).toBe('골드 +10,000');
    expect(t('battle.dungeon.entries', { n: '2/2' })).toBe('입장 2/2');
    expect(t('battle.dungeon.tier', { n: 3 })).toBe('3단계');
    setLang('en');
    expect(t('rt.sys.test.gold', { n: '10,000' })).toBe('Gold +10,000');
    expect(t('battle.dungeon.tier', { n: 3 })).toBe('Tier 3');
  });
});
