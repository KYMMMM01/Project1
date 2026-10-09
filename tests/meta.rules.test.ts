import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { RELIC_IDS, type RunStats } from '@/game/api';
import { BASE_UNIT_IDS, unitRarity } from '@/game/data/roster';
import { getLang, setLang, t } from '@/core/i18n';
import { validateCatalogue } from '@/platform/pricing';
import { isPlacement } from '@/platform/adPolicy';
import { newSim } from './simHelpers';
import '@/meta/strings';
import {
  CARD_BASE, CHAPTER_MULT, OFFERS, PLACEMENTS, SNACKS, TRAINING_MAX,
} from '@/meta/data/economy';
import { COSMETICS, IAP_SPECS, iapProductDefs } from '@/meta/data/catalog';
import { DUNGEON_AD_PLACEMENT } from '@/meta/data/dungeon';
import {
  CALENDAR, CALENDAR_DAYS, CUP_TIERS, DAILY_MISSIONS, DAILY_MODIFIERS, FEATURES, PASS_TIERS, WEEKLY_MISSIONS,
  passFreeReward, passPremiumReward,
} from '@/meta/data/schedule';
import { cupScore, dailyCode, dailySetup, hashString, parseDailyCode } from '@/meta/daily';
import { describeBundle, mergeBundles } from '@/meta/bundle';
import { featureHint, isFeatureUnlocked, unlockedFeatures } from '@/meta/features';
import { tn } from '@/meta/plural';
import { ODDS, oddsView, validateOdds } from '@/meta/odds';
import {
  canPlayStake, chaptersCleared, computeRunPayout, consolationCards, firstClearBundle, runGold, runXp, sweepPayout,
} from '@/meta/rewards';
import { shopOffers } from '@/meta/shop';
import { addDays, compactDate, dateKey, daysBetween, weekKey } from '@/meta/time';
import {
  BASE_UNITS, CHEST_KINDS, CHEST_RARITIES, TRAINING_IDS, type Bundle, type MetaError, type TrainingId,
} from '@/meta/types';
import {
  RARITY_OF, UNITS_BY_RARITY, accountProgress, buildLoadout, cardsToLevel, goldToLevel, quoteLevelUp,
  totalCardsTo, totalGoldTo, totalTrainingCost, trainCost, trainingEffects, xpForNext,
} from '@/meta/units';

function stats(over: Partial<RunStats>): RunStats {
  return {
    mode: 'chapter', chapter: 1, stake: 0, seed: 1234, victory: true, wavesCleared: 24, totalWaves: 24, kills: 0,
    bossesKilled: 0, summons: 0, merges: 0, molts: 0, awakenings: 0, relics: [], bestRarity: 'common',
    peakEnemies: 0, duration: 0, revived: false, summonLuck: 0.5, damageByUnit: {}, ...over,
  };
}

describe('run reward', () => {
  it('follows (40 + 14 x waves) x chapter x (1 + 0.15 x stake) x victory 1.25', () => {
    expect(runGold(24, 1, 0, true)).toBe(470);
    expect(runGold(10, 1, 0, false)).toBe(180);
    expect(runGold(12, 3, 2, false)).toBe(433);
    expect(runGold(24, 5, 5, true)).toBe(2056);
    expect(runGold(0, 1, 0, false)).toBe(40);
    expect(CHAPTER_MULT).toEqual([1, 1.3, 1.6, 2.0, 2.5]);
  });

  it('pays 10 + 2 x waves of XP', () => {
    expect(runXp(24)).toBe(58);
    expect(runXp(0)).toBe(10);
  });

  it('pays the first clear once: gems by stake, a gold chest at stake 0, lighter chests above, the rug for stake 0', () => {
    const first = computeRunPayout(stats({}), { cleared: [0, 0, 0, 0, 0], dailyAlreadyCleared: false });
    expect(first.firstClear).toBe(true);
    expect(first.gold).toBe(470);
    expect(first.bundle).toEqual({ chests: { wooden: 1, gold: 1 }, gems: 12, cosmetics: ['rug_ch1'] });
    const again = computeRunPayout(stats({}), { cleared: [1, 0, 0, 0, 0], dailyAlreadyCleared: false });
    expect(again.firstClear).toBe(false);
    expect(again.bundle).toEqual({ chests: { wooden: 1 } });
    const s1 = computeRunPayout(stats({ stake: 1 }), { cleared: [1, 0, 0, 0, 0], dailyAlreadyCleared: false });
    expect(s1.bundle).toEqual({ chests: { wooden: 3 }, gems: 17 });
    expect(firstClearBundle(5)).toEqual({ gems: 37, chests: { silver: 1 } });
  });

  it('pays two consolation cards only for a defeat of 10+ waves, the same cards for the same seed', () => {
    const ctx = { cleared: [1, 0, 0, 0, 0], dailyAlreadyCleared: false };
    const lost = computeRunPayout(stats({ victory: false, wavesCleared: 12 }), ctx);
    const total = Object.values(lost.bundle.cards ?? {}).reduce((a, n) => a + n, 0);
    expect(total).toBe(2);
    expect(computeRunPayout(stats({ victory: false, wavesCleared: 12 }), ctx).bundle).toEqual(lost.bundle);
    expect(consolationCards(1)).not.toEqual(consolationCards(2));
    expect(computeRunPayout(stats({ victory: false, wavesCleared: 9 }), ctx).bundle).toEqual({});
  });

  it('daily challenge: one silver chest a day, none for a defeat; endless and tutorial differ', () => {
    const base = { cleared: [1, 1, 0, 0, 0] };
    expect(computeRunPayout(stats({ mode: 'daily' }), { ...base, dailyAlreadyCleared: false }).bundle).toEqual({ chests: { silver: 1 } });
    expect(computeRunPayout(stats({ mode: 'daily' }), { ...base, dailyAlreadyCleared: true }).bundle).toEqual({});
    expect(computeRunPayout(stats({ mode: 'daily', victory: false }), { ...base, dailyAlreadyCleared: false }).bundle).toEqual({});
    expect(computeRunPayout(stats({ mode: 'endless', victory: false, wavesCleared: 45 }), { ...base, dailyAlreadyCleared: false }).bundle).toEqual({});
    expect(computeRunPayout(stats({ mode: 'tutorial', wavesCleared: 10 }), { ...base, dailyAlreadyCleared: false }).bundle).toEqual({ chests: { wooden: 1 } });
  });

  it('sweep pays 60% of a win', () => {
    expect(sweepPayout(1, 0)).toEqual({ gold: 282, xp: 34 });
    expect(sweepPayout(3, 2).gold).toBe(Math.floor(runGold(24, 3, 2, true) * 0.6));
  });

  it('opens stakes one after another, chapters after a stake-0 clear', () => {
    expect(canPlayStake([0, 0, 0, 0, 0], 1, 0)).toBe(true);
    expect(canPlayStake([0, 0, 0, 0, 0], 1, 1)).toBe(false);
    expect(canPlayStake([0, 0, 0, 0, 0], 2, 0)).toBe(false);
    expect(canPlayStake([1, 0, 0, 0, 0], 2, 0)).toBe(true);
    expect(canPlayStake([1, 0, 0, 0, 0], 1, 1)).toBe(true);
    expect(canPlayStake([1, 0, 0, 0, 0], 1, 2)).toBe(false);
    expect(canPlayStake([6, 6, 6, 6, 6], 5, 5)).toBe(true);
    expect(canPlayStake([6, 6, 6, 6, 6], 5, 6)).toBe(false);
    expect(chaptersCleared([1, 1, 0, 1, 0])).toBe(2);
  });
});

describe('unit levels and training', () => {
  it('maps the 16 units to their rarity like the roster does', () => {
    expect([...BASE_UNITS].sort()).toEqual([...BASE_UNIT_IDS].sort());
    for (const u of BASE_UNITS) expect(RARITY_OF[u]).toBe(unitRarity(u));
    for (const r of CHEST_RARITIES) expect(UNITS_BY_RARITY[r]).toHaveLength(4);
  });

  it('scales card costs by rarity (x1, x1, x0.6, x0.3, rounded up)', () => {
    const costs = (r: (typeof CHEST_RARITIES)[number]): number[] => CARD_BASE.map((_, i) => cardsToLevel(r, i + 2));
    expect(costs('common')).toEqual([2, 4, 8, 16, 30, 50, 80, 120, 200]);
    expect(costs('rare')).toEqual([2, 4, 8, 16, 30, 50, 80, 120, 200]);
    expect(costs('epic')).toEqual([2, 3, 5, 10, 18, 30, 48, 72, 120]);
    expect(costs('legendary')).toEqual([1, 2, 3, 5, 9, 15, 24, 36, 60]);
    expect(totalCardsTo('epic', 8)).toBe(116);
    expect(totalCardsTo('legendary', 8)).toBe(59);
    expect(totalCardsTo('common', 10)).toBe(510);
  });

  it('scales gold costs by rarity (x1 / x1.2 / x1.5 / x2)', () => {
    expect(goldToLevel('common', 2)).toBe(100);
    expect(goldToLevel('rare', 10)).toBe(24000);
    expect(goldToLevel('epic', 4)).toBe(900);
    expect(goldToLevel('legendary', 10)).toBe(40000);
    expect(totalGoldTo('legendary', 10)).toBe(105300);
  });

  it('adds up to the 1.37 million gold the design document promises', () => {
    let gold = 0;
    for (const u of BASE_UNITS) gold += totalGoldTo(RARITY_OF[u], 10);
    expect(Math.round((gold + totalTrainingCost()) / 10000)).toBe(137);
  });

  it('trains at 200 x 1.55^(level - 1)', () => {
    expect(trainCost(1)).toBe(200);
    expect(trainCost(2)).toBe(310);
    expect(trainCost(10)).toBe(Math.round(200 * Math.pow(1.55, 9)));
    expect(TRAINING_MAX).toBe(10);
    expect(TRAINING_IDS).toEqual(['start_fish', 'kill_fish', 'damage', 'boss_time', 'laser_cd', 'start_purr']);
  });

  it('trains each effect per level; start purr grows at levels 3, 6, 9', () => {
    const lv = (over: Partial<Record<TrainingId, number>>): Record<TrainingId, number> => ({
      start_fish: 0, kill_fish: 0, damage: 0, boss_time: 0, laser_cd: 0, start_purr: 0, ...over,
    });
    const e = trainingEffects(lv({ start_fish: 4, kill_fish: 5, damage: 5, boss_time: 7, laser_cd: 10 }));
    expect(e).toMatchObject({ startFish: 20, killFishPct: 10, damagePct: 10, bossTimeSec: 7, laserCdSec: 3, startPurr: 0 });
    const purr = [0, 2, 3, 5, 6, 8, 9, 10].map((n) => trainingEffects(lv({ start_purr: n })).startPurr);
    expect(purr).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });

  it('quotes a level-up: own cards first, wild cards for the rest', () => {
    const q = quoteLevelUp('m_storm', 3, 2, 5, 10_000);
    expect(q).toMatchObject({ cards: 5, gold: goldToLevel('epic', 4), ownUsed: 2, wildUsed: 3, enoughCards: true, enoughGold: true });
    expect(quoteLevelUp('m_storm', 3, 2, 2, 10_000).enoughCards).toBe(false);
    expect(quoteLevelUp('m_storm', 3, 20, 0, 10).enoughGold).toBe(false);
    expect(quoteLevelUp('m_storm', 10, 0, 0, 0).maxed).toBe(true);
  });

  it('levels the account by 80 + 40 x level', () => {
    expect(xpForNext(1)).toBe(120);
    expect(accountProgress(0)).toEqual({ level: 1, into: 0, need: 120 });
    expect(accountProgress(120).level).toBe(2);
    expect(accountProgress(279).level).toBe(2);
    expect(accountProgress(280).level).toBe(3);
  });

  it('builds a loadout: daily fixes level 5 and switches training off', () => {
    const levels = Object.fromEntries(BASE_UNITS.map((u, i) => [u, 1 + (i % 10)])) as Record<(typeof BASE_UNITS)[number], number>;
    const training: Record<TrainingId, number> = { start_fish: 3, kill_fish: 0, damage: 4, boss_time: 0, laser_cd: 0, start_purr: 1 };
    const normal = buildLoadout(levels, training, false);
    expect(normal.unitLevels.w_sword).toBe(levels.w_sword);
    expect(normal.training).toEqual(training);
    expect(normal.relicPool).toHaveLength(RELIC_IDS.length);
    const daily = buildLoadout(levels, training, true);
    expect(BASE_UNITS.every((u) => daily.unitLevels[u] === 5)).toBe(true);
    expect(daily.training).toEqual({});
  });
});

describe('odds table', () => {
  it('matches the published tables and is internally consistent', () => {
    for (const k of CHEST_KINDS) validateOdds(ODDS[k]);
    const pct = (k: (typeof CHEST_KINDS)[number]): number[] => ODDS[k].rows.map((r) => r.p);
    expect(pct('wooden')).toEqual([0.7, 0.25, 0.05, 0]);
    expect(pct('silver')).toEqual([0.5, 0.32, 0.15, 0.03]);
    expect(pct('gold')).toEqual([0.4, 0.3, 0.2, 0.1]);
    expect([ODDS.wooden.cards, ODDS.silver.cards, ODDS.gold.cards]).toEqual([8, 24, 60]);
    expect(ODDS.silver.guarantees).toEqual([{ atLeast: 'epic', count: 1 }]);
    expect(ODDS.gold.guarantees).toEqual([{ atLeast: 'legendary', count: 3 }]);
    expect(ODDS.gold.pity).toEqual({ every: 10, bonusCards: 8, rarity: 'legendary' });
    expect(ODDS.wooden.pity).toBeNull();
    for (const k of CHEST_KINDS) expect(ODDS[k].wildShare).toBe(0.3);
  });

  it('renders the odds screen from the same object: rows, guarantee, pity counter and target', () => {
    const v = oddsView(ODDS.gold, { goldOpened: 16, target: 'w_samurai' });
    expect(v.rows.map((r) => r.text)).toEqual(['40%', '30%', '20%', '10%']);
    expect(v.version).toBe(ODDS.gold.version);
    expect(v.pity?.counter).toBe(6);
    expect(v.pity?.next).toBe(false);
    expect(v.pity?.targetName).toBe(t('unit.w_samurai.name'));
    expect(v.summary).toContain('60');
    expect(v.guaranteeTexts).toHaveLength(1);
    expect(v.guaranteeTexts[0]).toContain(t('rarity.legendary'));
    expect(v.guaranteeTexts[0]).not.toContain('이상');
    expect(oddsView(ODDS.silver, { goldOpened: 0, target: null }).guaranteeTexts[0]).toContain('이상');
    expect(v.summary).toContain(v.pity?.targetName ?? 'x');
    expect(v.summary).toContain('(6/10)');
    expect(v.summary).not.toMatch(/rarity\.|unit\.|meta\./);
    expect(oddsView(ODDS.gold, { goldOpened: 19, target: null }).pity?.next).toBe(true);
    expect(oddsView(ODDS.wooden, { goldOpened: 3, target: null }).pity).toBeNull();
  });
});

describe('schedule data', () => {
  it('has 28 calendar days with gold chests on 7/14/21 and the rug on 28', () => {
    expect(CALENDAR).toHaveLength(CALENDAR_DAYS);
    for (const day of [7, 14, 21]) expect(CALENDAR[day - 1]).toEqual({ chests: { gold: 1 } });
    expect(CALENDAR[27]?.cosmetics).toEqual(['rug_calendar']);
  });

  it('missions: 5 daily worth 100 points, 5 weekly', () => {
    expect(DAILY_MISSIONS).toHaveLength(5);
    expect(DAILY_MISSIONS.reduce((a, m) => a + m.points, 0)).toBe(100);
    expect(WEEKLY_MISSIONS).toHaveLength(5);
  });

  it('season pass: 30 tiers, free row 150 gems, premium row 1,200 gems + 6 silver + 3 gold', () => {
    const sum = (f: (t: number) => Bundle): Bundle =>
      Array.from({ length: PASS_TIERS }, (_, i) => f(i + 1)).reduce(mergeBundles, {});
    expect(sum(passFreeReward).gems).toBe(150);
    const p = sum(passPremiumReward);
    expect(p.gems).toBe(1200);
    expect(p.chests).toEqual({ silver: 6, gold: 3 });
  });

  it('describes bundles in the current language without leaving placeholders', () => {
    const lines = describeBundle({ gold: 500, gems: 10, chests: { silver: 1 }, wild: { epic: 2 }, tickets: 3, cards: { w_paw: 4 } });
    expect(lines).toHaveLength(6);
    for (const l of lines) expect(l).not.toMatch(/\{|meta\./);
  });
});

describe('catalogue', () => {
  it('has the 11 products at the prices in GDD 8.3, all valid Toss prices', () => {
    expect(IAP_SPECS.map((s) => [s.id, s.krw])).toEqual([
      ['baby_cat_pack', 1100], ['starter_pack', 3300], ['growth_pack', 6600], ['butler_pass', 9900],
      ['season_pass', 9900], ['gem_pass', 5500], ['piggy_bank', 5500], ['gems_260', 2200],
      ['gems_680', 5500], ['gems_1450', 11000], ['gems_4600', 33000],
    ]);
    expect(validateCatalogue(iapProductDefs(), 'toss')).toEqual([]);
    expect(IAP_SPECS.find((s) => s.id === 'butler_pass')?.type).toBe('nonConsumable');
    const gems = IAP_SPECS.filter((s) => s.id.startsWith('gems_')).map((s) => s.bundle.gems);
    expect(gems).toEqual([260, 680, 1450, 4600]);
  });

  it('has 8 earnable rug skins (5 by chapter, 3 for 400 gems) and 4 summon themes (3 for 300 gems)', () => {
    const rugs = COSMETICS.filter((c) => c.kind === 'rug');
    expect(rugs.filter((c) => c.source.type === 'chapter')).toHaveLength(5);
    expect(rugs.filter((c) => c.source.type === 'gems' && c.source.price === 400)).toHaveLength(3);
    const fx = COSMETICS.filter((c) => c.kind === 'fx');
    expect(fx).toHaveLength(4);
    expect(fx.filter((c) => c.source.type === 'gems' && c.source.price === 300)).toHaveLength(3);
  });

  it('uses ad placements the platform knows', () => {
    const known = [...Object.values(OFFERS).map((o) => o.ad), ...Object.values(PLACEMENTS), DUNGEON_AD_PLACEMENT];
    for (const id of known) expect(isPlacement(id), id).toBe(true);
    expect(Object.fromEntries(Object.entries(OFFERS).map(([k, o]) => [k, o.gems]))).toEqual({
      revive: 30, result_double: 20, chest_skip: 20, relic_reroll: 10, start_snack: 15,
    });
    expect([...SNACKS]).toEqual(['fish', 'purr', 'rare_summon']);
  });
});

describe('feature unlocks', () => {
  const none = { runs: 0, accountLevel: 1, chaptersCleared: 0, butler: false };
  it('opens by progress', () => {
    expect(unlockedFeatures(none)).toEqual([]);
    expect(unlockedFeatures({ ...none, runs: 1 })).toEqual(['speed2x', 'cats', 'patrol']);
    expect(isFeatureUnlocked('missions', { ...none, runs: 3 })).toBe(true);
    expect(isFeatureUnlocked('pass', { ...none, runs: 9, accountLevel: 3 })).toBe(false);
    expect(isFeatureUnlocked('pass', { ...none, accountLevel: 4 })).toBe(true);
    expect(isFeatureUnlocked('daily', { ...none, chaptersCleared: 1 })).toBe(true);
    expect(isFeatureUnlocked('endless', { ...none, chaptersCleared: 1 })).toBe(false);
    expect(isFeatureUnlocked('endless', { ...none, chaptersCleared: 2 })).toBe(true);
    expect(isFeatureUnlocked('speed3x', none)).toBe(false);
    expect(isFeatureUnlocked('speed3x', { ...none, butler: true })).toBe(true);
    expect(unlockedFeatures({ runs: 3, accountLevel: 4, chaptersCleared: 2, butler: true })).toEqual([...FEATURES]);
  });
});

describe('dates and the daily challenge', () => {
  it('does calendar math on date keys', () => {
    expect(weekKey('2026-10-06')).toBe('2026-10-05');
    expect(weekKey('2026-10-05')).toBe('2026-10-05');
    expect(weekKey('2026-10-04')).toBe('2026-09-28');
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-10-06', '2026-11-07')).toBe(32);
    expect(compactDate('2026-11-07')).toBe('20261107');
    expect(dateKey(new Date(2026, 9, 6, 23, 59).getTime())).toBe('2026-10-06');
  });

  it('shows the date-derived seed as a code like D-20261107-r1', () => {
    expect(dailyCode('2026-11-07')).toBe('D-20261107-r1');
    expect(parseDailyCode('D-20261107-r1')).toEqual({ date: '2026-11-07', ruleset: 1 });
    expect(parseDailyCode('D-20261340-r1')).toBeNull();
    expect(parseDailyCode('hello')).toBeNull();
    const a = dailySetup('2026-11-07');
    expect(a).toEqual(dailySetup('2026-11-07'));
    expect(a.seed).toBe(hashString('D-20261107-r1'));
    expect(a.code).toBe('D-20261107-r1');
    expect(a.waves).toBe(newSim({ mode: 'daily' }).totalWaves);
    expect(a.modifiers).toHaveLength(1);
    expect(DAILY_MODIFIERS).toContain(a.modifiers[0]);
    const seeds = new Set(Array.from({ length: 30 }, (_, i) => dailySetup(addDays('2026-11-01', i)).seed));
    expect(seeds.size).toBe(30);
    expect(dailySetup('2026-11-07', 2).seed).not.toBe(a.seed);
  });

  it('sums the best wave of each day of the week for the cup', () => {
    const days = { '2026-10-05': 12, '2026-10-06': 15, '2026-10-11': 8, '2026-10-12': 20, '2026-09-30': 99 };
    expect(cupScore(days, '2026-10-05')).toBe(35);
    expect(cupScore(days, '2026-10-12')).toBe(20);
  });

  it('puts every cup tier within reach of a week of full-length daily challenges', () => {
    const best = 7 * newSim({ mode: 'daily' }).totalWaves;
    const mins = CUP_TIERS.map((c) => c.min);
    expect([...mins].sort((x, y) => x - y)).toEqual(mins);
    expect(Math.max(...mins)).toBeLessThanOrEqual(best);
    expect(Math.max(...mins) / best).toBeGreaterThan(0.85);
  });
});

describe('daily shop', () => {
  it('is the same for the same seed, date and refresh, and changes with the date or the refresh', () => {
    const a = shopOffers(77, '2026-10-06', 0);
    expect(shopOffers(77, '2026-10-06', 0)).toEqual(a);
    expect(a).toHaveLength(6);
    expect(a[0]).toMatchObject({ kind: 'free', price: {} });
    expect(a.slice(1, 5).map((o) => o.rarity)).toEqual(['common', 'rare', 'epic', 'legendary']);
    expect(a[5]?.price.gems).toBeGreaterThan(0);
    const others = [shopOffers(77, '2026-10-07', 0), shopOffers(77, '2026-10-06', 1), shopOffers(78, '2026-10-06', 0)];
    for (const o of others) expect(o).not.toEqual(a);
  });

  it('only offers units of the slot rarity', () => {
    for (let salt = 0; salt < 30; salt++) {
      for (const o of shopOffers(5, '2026-10-06', salt).slice(1, 5)) {
        for (const u of Object.keys(o.bundle.cards ?? {})) expect(RARITY_OF[u as (typeof BASE_UNITS)[number]]).toBe(o.rarity);
      }
    }
  });
});

describe('text', () => {
  const ERRORS: Record<MetaError, true> = {
    not_enough_gold: true, not_enough_gems: true, not_enough_tickets: true, not_enough_cards: true, max_level: true,
    locked: true, not_ready: true, already_claimed: true, limit_reached: true, ad_failed: true, unavailable: true,
    invalid: true, invalid_code: true, corrupt_code: true, newer_version: true, clock_frozen: true, already_owned: true,
    not_owned: true, nothing_to_claim: true, not_cleared: true, run_active: true,
  };

  function keys(): string[] {
    const list: string[] = [];
    for (const e of Object.keys(ERRORS)) list.push('meta.err.' + e);
    for (const f of FEATURES) list.push('meta.feature.' + f);
    for (const c of COSMETICS) list.push('meta.cos.' + c.id);
    for (const s of IAP_SPECS) list.push(`meta.iap.${s.id}.name`, `meta.iap.${s.id}.desc`);
    for (const m of [...DAILY_MISSIONS, ...WEEKLY_MISSIONS]) list.push('meta.mission.' + m.id);
    for (const k of CHEST_KINDS) list.push('meta.chest.' + k);
    for (const c of ['gold', 'gems', 'tickets']) list.push('meta.currency.' + c, 'meta.reward.' + c);
    for (const o of Object.keys(OFFERS)) list.push('meta.offer.' + o);
    for (const s of SNACKS) list.push('meta.snack.' + s);
    for (const k of ['free', 'cards', 'wild', 'gem']) list.push('meta.shop.' + k);
    for (const k of ['head', 'row', 'wild', 'guarantee', 'guaranteeTop', 'pity', 'version', 'title']) list.push('meta.odds.' + k);
    for (const k of ['chest', 'wild', 'card']) list.push('meta.reward.' + k);
    for (const k of ['runs', 'level', 'chapter', 'butler']) list.push('meta.unlock.' + k);
    for (const r of CHEST_RARITIES) list.push('rarity.' + r);
    for (const u of BASE_UNITS) list.push(`unit.${u}.name`);
    for (let c = 1; c <= 5; c++) list.push(`chapter.${c}.name`);
    list.push('meta.toast.claimed', 'meta.toast.levelUp', 'meta.toast.restored');
    return list;
  }

  const tokens = (s: string): string[] => (s.match(/\{\w+\}/g) ?? []).sort();
  const previous = getLang();

  beforeAll(() => {
    vi.stubGlobal('document', { documentElement: { lang: '' } });
  });
  afterAll(() => {
    setLang(previous);
    vi.unstubAllGlobals();
  });

  it('has every key in Korean and English with the same placeholders', () => {
    const table: Record<string, Record<string, string>> = { ko: {}, en: {} };
    for (const lang of ['ko', 'en'] as const) {
      setLang(lang);
      for (const k of keys()) {
        const text = t(k);
        expect(text, `${lang} ${k}`).not.toBe(k);
        table[lang]![k] = text;
      }
    }
    for (const k of keys()) expect(tokens(table.ko![k]!), k).toEqual(tokens(table.en![k]!));
  });

  it('keeps Korean in the friendly polite tone, never the stiff "-습니다" form', () => {
    setLang('ko');
    for (const k of keys()) expect(t(k), k).not.toMatch(/(습니다|합니다)[.!]?$/);
  });

  it('writes a count of one in the singular in English, with the same placeholders as the plural', () => {
    setLang('en');
    for (const k of [
      'meta.reward.gems', 'meta.reward.tickets', 'meta.reward.wild', 'meta.reward.card', 'meta.odds.guarantee',
      'meta.odds.guaranteeTop', 'meta.unlock.runs', 'meta.piggy.free',
    ]) expect(tokens(t(k + '.one')), k).toEqual(tokens(t(k)));
    expect(describeBundle({ wild: { rare: 1 } })).toEqual(['1 wild card (Street)']);
    expect(describeBundle({ wild: { rare: 3 } })).toEqual(['3 wild cards (Street)']);
    expect(describeBundle({ gold: 1, gems: 1, tickets: 1, cards: { w_paw: 1 } })).toEqual([
      '1 gold', '1 gem', '1 sweep ticket', `1 ${t('unit.w_paw.name')} card`,
    ]);
    expect(featureHint('cats')).toBe('Unlocks after 1 run.');
    expect(featureHint('missions')).toBe('Unlocks after 3 runs.');
    expect(oddsView(ODDS.silver, { goldOpened: 0, target: null }).guaranteeTexts).toEqual([
      'At least 1 Alley Boss card or better in every chest.',
    ]);
    expect(oddsView(ODDS.gold, { goldOpened: 0, target: null }).guaranteeTexts).toEqual(['At least 3 King cards in every chest.']);
    expect(tn('meta.piggy.free', 1, { days: 1, n: 40 })).toBe('After 1 day you can take 40 gems out for free.');
  });

  it('leaves Korean counts alone, whatever the count', () => {
    setLang('ko');
    expect(describeBundle({ wild: { rare: 1 } })).toEqual(['만능 카드(동네) 1장']);
    expect(featureHint('cats')).toBe('1판을 마치면 열려요.');
  });
});
