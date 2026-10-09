import { describe, expect, it, vi } from 'vitest';
import type { RunStats } from '@/game/api';
import { SaveStore, getStorageBackend, setStorageBackend } from '@/core/save';
import { createMemoryBackend } from '@/platform/storage';
import { crc32, decodeBackup, encodeBackup, toBase64Url } from '@/meta/backup';
import { attachPlatform } from '@/meta/platformLink';
import { MIGRATIONS, PROFILE_VERSION, SAVE_KEY, defaultProfile, migrateProfile, normalizeProfile } from '@/meta/profileData';
import { IAP_SPECS } from '@/meta/data/catalog';
import { PASS_XP_PER_TIER } from '@/meta/data/schedule';
import { runGold } from '@/meta/rewards';
import { at, createTestProfile, type TestRig } from '@/meta/testing';
import { BASE_UNITS, type ChestKind, type CurrencyId, type ProfileData, type Reason } from '@/meta/types';
import { IapService } from '@/platform/iapService';
import { ModalGate } from '@/platform/modal';
import { Analytics } from '@/platform/analytics';
import { fakeAdapter, makeAds, makePauser } from './platformHelpers';

function stats(over: Partial<RunStats> = {}): RunStats {
  return {
    mode: 'chapter', chapter: 1, stake: 0, seed: 4321, victory: true, wavesCleared: 24, totalWaves: 24, kills: 300,
    bossesKilled: 5, summons: 40, merges: 25, molts: 0, awakenings: 0, relics: ['yarn_ball', 'mouse_toy', 'bell_collar', 'scratcher', 'fishing_rod'],
    bestRarity: 'epic', peakEnemies: 20, duration: 400, revived: false, summonLuck: 0.5, damageByUnit: {}, ...over,
  };
}

async function playRun(rig: TestRig, over: Partial<RunStats> = {}, opts: Parameters<TestRig['profile']['prepareRun']>[0] = { mode: 'chapter' }) {
  const prep = await rig.profile.prepareRun(opts);
  expect(prep.ok).toBe(true);
  return rig.profile.finishRun(stats({ mode: opts.mode, chapter: opts.chapter ?? 1, stake: opts.stake ?? 0, ...over }));
}

const REASONS: readonly Reason[] = [
  'run_reward', 'run_double', 'first_clear', 'daily_clear', 'sweep', 'level_up', 'training', 'chest_buy',
  'chest_overflow', 'chest_skip', 'patrol', 'patrol_double', 'mission', 'mission_chest', 'weekly_mission', 'calendar',
  'comeback', 'treat', 'snack_chest', 'shop_buy', 'shop_refresh', 'ticket_buy', 'ticket_ad', 'ticket_daily', 'pass_free',
  'pass_premium', 'account_level', 'cup', 'endless', 'cosmetic_buy', 'piggy', 'iap', 'iap_revoke', 'gem_pass',
  'offer_revive', 'offer_double', 'offer_snack', 'offer_relic', 'free_chest', 'consolation', 'dungeon', 'offer_dungeon', 'test',
];

describe('the one money path', () => {
  it('reports every currency change with a reason, and the events add up to the balance', async () => {
    const rig = await createTestProfile();
    const { profile } = rig;
    const sums: Record<CurrencyId, number> = { gold: 0, gems: 0, tickets: 0 };
    const seen: string[] = [];
    profile.events.on('currency', (e) => {
      sums[e.currency] += e.delta;
      seen.push(e.reason);
      expect(e.total).toBe(profile.data[e.currency]);
    });
    const start = { gold: profile.data.gold, gems: profile.data.gems, tickets: profile.data.tickets };
    const recordedBefore = rig.analytics.length;

    await playRun(rig, {}, { mode: 'tutorial' });
    await playRun(rig);
    await playRun(rig, { victory: false, wavesCleared: 11 });
    profile.claimCalendar();
    for (let i = 0; i < 6; i++) profile.train('start_fish');
    profile.grant('gems', 1200, 'iap');
    profile.buyChest('gold');
    profile.buyChest('silver');
    await profile.openChest('gold');
    await profile.openChest('silver');
    await profile.openChest('wooden');
    for (const u of BASE_UNITS) profile.levelUp(u);
    profile.buyTicket();
    profile.sweep(1, 0);
    await profile.doubleResult('gems');
    profile.buyCosmetic('rug_gem1');
    await profile.pay('revive', 'gems');
    profile.claimMission('daily', 0);

    const tracked = rig.analytics.slice(recordedBefore).filter((r) => r.event === 'currency');
    expect(tracked.length).toBe(seen.length);
    expect(tracked.length).toBeGreaterThan(20);
    for (const r of tracked) expect(REASONS).toContain(r.params.reason as Reason);
    for (const c of ['gold', 'gems', 'tickets'] as const) expect(profile.data[c]).toBe(start[c] + sums[c]);
    expect(seen).toEqual(expect.arrayContaining(['run_reward', 'first_clear', 'training', 'level_up', 'chest_buy', 'sweep', 'cosmetic_buy', 'offer_revive']));
  });

  it('never goes below zero: a spend that does not fit changes nothing', async () => {
    const { profile, analytics } = await createTestProfile();
    const before = analytics.length;
    expect(profile.spend('gold', 1, 'training')).toBe(false);
    expect(profile.data.gold).toBe(0);
    expect(analytics.length).toBe(before);
    expect(profile.train('damage')).toEqual({ ok: false, error: 'not_enough_gold' });
    expect(profile.clawback('gems', 50, 'iap_revoke')).toBe(0);
  });
});

describe('unit levels and training', () => {
  it('levels a unit with its own cards, then wild cards, and pays gold', async () => {
    const { profile, analytics } = await createTestProfile();
    const d = profile.data;
    const events: string[] = [];
    profile.events.on('unitLevel', (e) => events.push(`${e.unit}:${e.level}`));
    d.cards.m_storm = 2;
    d.wild.epic = 3;
    d.gold = 100;
    expect(profile.levelUp('m_storm')).toEqual({ ok: false, error: 'not_enough_gold' });
    d.gold = 100_000;
    expect(profile.levelUp('m_storm')).toEqual({ ok: true, value: 2 });
    expect(d.cards.m_storm).toBe(0);
    expect(d.wild.epic).toBe(3);
    expect(profile.levelUp('m_storm')).toEqual({ ok: true, value: 3 });
    expect(d.wild.epic).toBe(0);
    expect(profile.levelUp('m_storm')).toEqual({ ok: false, error: 'not_enough_cards' });
    expect(events).toEqual(['m_storm:2', 'm_storm:3']);
    expect(analytics.filter((r) => r.event === 'unit_level')).toHaveLength(2);
  });

  it('turns the leftover cards of a unit that reaches level 10 into gold', async () => {
    const { profile } = await createTestProfile();
    const d = profile.data;
    d.levels.w_paw = 9;
    d.cards.w_paw = 250;
    d.gold = 20_000;
    expect(profile.levelUp('w_paw')).toEqual({ ok: true, value: 10 });
    expect(d.cards.w_paw).toBe(0);
    expect(d.gold).toBe(50 * 10);
    expect(profile.levelUp('w_paw')).toEqual({ ok: false, error: 'max_level' });
  });

  it('trains each skill to 10 and hands the levels to the battle', async () => {
    const { profile } = await createTestProfile();
    profile.data.gold = 1_000_000;
    for (let i = 0; i < 10; i++) expect(profile.train('laser_cd').ok).toBe(true);
    expect(profile.train('laser_cd')).toEqual({ ok: false, error: 'max_level' });
    expect(profile.trainingEffects().laserCdSec).toBe(3);
    expect(profile.trainingRows().find((r) => r.id === 'laser_cd')).toMatchObject({ level: 10, cost: null });
    const r = await profile.prepareRun({ mode: 'tutorial' });
    expect(r.ok && r.value.loadout.training.laser_cd).toBe(10);
  });
});

describe('runs', () => {
  it('pays a first clear: gold, gems, chests, rug, XP, piggy bank, missions, unlocks, ad bookkeeping', async () => {
    const rig = await createTestProfile();
    const { profile, ads } = rig;
    const unlocks: string[] = [];
    profile.events.on('unlock', (e) => unlocks.push(e.feature));
    const r = await playRun(rig);
    expect(r.ok).toBe(true);
    const d = profile.data;
    expect(d.gold).toBe(470);
    expect(d.gems).toBe(12);
    expect(d.chests).toMatchObject({ wooden: 1, gold: 1 });
    expect(d.cleared).toEqual([1, 0, 0, 0, 0]);
    expect(d.cosmetics.owned).toContain('rug_ch1');
    expect(d.accountXp).toBe(58);
    expect(d.pass.xp).toBe(58);
    expect(d.piggy.gems).toBe(6);
    expect(d.stats).toMatchObject({ runs: 1, wins: 1, merges: 25, bosses: 5 });
    expect(d.day.missions.progress).toEqual([1, 20, 4, 5, 1]);
    expect(d.pending).toBeNull();
    expect(d.lastRun).toMatchObject({ gold: 470, xp: 58, firstClear: true, doubled: false });
    expect(unlocks).toEqual(['speed2x', 'cats', 'patrol', 'daily', 'sweep', 'cup', 'dungeon']);
    expect(ads.runs).toEqual(['begin', 'victory']);
    expect(rig.analytics.map((a) => a.event).filter((e) => e === 'run_start' || e === 'run_end')).toEqual(['run_start', 'run_end']);

    const again = await playRun(rig);
    expect(again.ok && again.value.firstClear).toBe(false);
    expect(profile.data.cleared).toEqual([1, 0, 0, 0, 0]);
    expect(profile.data.chests.gold).toBe(1);
    expect(profile.data.chests.wooden).toBe(2);
  });

  it('opens stakes and chapters in order and refuses a second run while one is unfinished', async () => {
    const rig = await createTestProfile();
    const { profile } = rig;
    expect(await profile.prepareRun({ mode: 'chapter', chapter: 2 })).toEqual({ ok: false, error: 'locked' });
    expect(await profile.prepareRun({ mode: 'chapter', chapter: 1, stake: 1 })).toEqual({ ok: false, error: 'locked' });
    expect(await profile.prepareRun({ mode: 'daily' })).toEqual({ ok: false, error: 'locked' });
    expect(await profile.prepareRun({ mode: 'endless' })).toEqual({ ok: false, error: 'locked' });
    await playRun(rig);
    expect((await profile.prepareRun({ mode: 'chapter', chapter: 1, stake: 1 })).ok).toBe(true);
    expect(await profile.prepareRun({ mode: 'chapter', chapter: 1 })).toEqual({ ok: false, error: 'run_active' });
    await profile.discardPendingRun();
    expect(profile.pendingRun).toBeNull();
    expect(rig.ads.runs.at(-1)).toBe('abandon');
    expect((await profile.prepareRun({ mode: 'chapter', chapter: 2 })).ok).toBe(true);
  });

  it('sets up the daily challenge from the date: seed, rule, level 5 for everyone, training off, no snack', async () => {
    const rig = await createTestProfile();
    const { profile } = rig;
    await playRun(rig);
    profile.data.training.damage = 6;
    profile.data.levels.w_paw = 9;
    const view = profile.dailyView();
    const init = await profile.prepareRun({ mode: 'daily' });
    expect(init.ok).toBe(true);
    if (!init.ok) return;
    expect(init.value.seed).toBe(view.setup.seed);
    expect(init.value.chapter).toBe(view.setup.chapter);
    expect(init.value.modifiers).toEqual(view.setup.modifiers);
    expect(init.value.loadout.unitLevels.w_paw).toBe(5);
    expect(init.value.loadout.training).toEqual({});
    expect(view.setup.code).toBe('D-20261006-r1');
    await profile.discardPendingRun();
    expect(await profile.prepareRun({ mode: 'daily', snack: { id: 'fish', via: 'gems' } })).toEqual({ ok: false, error: 'locked' });
  });

  it('daily challenge: one silver chest a day, best wave per day feeds the cup', async () => {
    const rig = await createTestProfile();
    await playRun(rig);
    const day = { mode: 'daily' as const };
    await playRun(rig, { wavesCleared: 12, victory: false }, day);
    expect(rig.profile.data.chests.silver).toBe(0);
    expect(rig.profile.data.cup.days['2026-10-06']).toBe(12);
    await playRun(rig, { wavesCleared: 20, victory: true }, day);
    expect(rig.profile.data.chests.silver).toBe(1);
    expect(rig.profile.dailyView()).toMatchObject({ clearedToday: true, bestToday: 20 });
    await playRun(rig, { wavesCleared: 20, victory: true }, day);
    expect(rig.profile.data.chests.silver).toBe(1);
    await playRun(rig, { wavesCleared: 7, victory: false }, day);
    expect(rig.profile.cupView().score).toBe(20);
    rig.clock.advance(24 * 3_600_000);
    rig.profile.refresh();
    expect(rig.profile.dailyView()).toMatchObject({ clearedToday: false, bestToday: 0 });
    await playRun(rig, { wavesCleared: 15, victory: false }, day);
    expect(rig.profile.cupView().score).toBe(35);
  });

  it('endless: keeps the best wave and the week best, opens after chapter 2', async () => {
    const rig = await createTestProfile();
    await playRun(rig);
    await playRun(rig, {}, { mode: 'chapter', chapter: 2 });
    const defaulted = await rig.profile.prepareRun({ mode: 'endless' });
    expect(defaulted.ok && defaulted.value.chapter).toBe(2);
    await rig.profile.discardPendingRun();
    const scores: number[] = [];
    for (const waves of [41, 33, 62]) {
      const r = await playRun(rig, { wavesCleared: waves, victory: false }, { mode: 'endless', chapter: 2 });
      scores.push(r.ok && r.value.newBest ? waves : 0);
    }
    expect(scores).toEqual([41, 0, 62]);
    expect(rig.profile.endlessView()).toMatchObject({ best: 62, weekBest: 62 });
    expect(rig.profile.endlessView().tiers.map((t) => t.reached)).toEqual([true, true, false]);
  });

  it('adds the snack to the battle setup and charges for it: gems, or an ad', async () => {
    const rig = await createTestProfile();
    const { profile, ads } = rig;
    await playRun(rig);
    profile.data.gems = 0;
    expect(await profile.prepareRun({ mode: 'chapter', snack: { id: 'fish', via: 'gems' } })).toEqual({ ok: false, error: 'not_enough_gems' });
    expect(profile.pendingRun).toBeNull();
    profile.grant('gems', 100, 'iap');
    const a = await profile.prepareRun({ mode: 'chapter', snack: { id: 'fish', via: 'gems' } });
    expect(a.ok && a.value.bonusFish).toBe(60);
    expect(profile.data.gems).toBe(100 - 15);
    await profile.discardPendingRun();
    const b = await profile.prepareRun({ mode: 'chapter', snack: { id: 'purr', via: 'ad' } });
    expect(b.ok && b.value.bonusPurr).toBe(2);
    expect(ads.shown).toEqual(['pre_run_snack']);
    await profile.discardPendingRun();
    const c = await profile.prepareRun({ mode: 'chapter', snack: { id: 'rare_summon', via: 'ad' } });
    expect(c.ok && c.value.firstSummonRarePlus).toBe(true);
    await profile.discardPendingRun();
    ads.outcome = 'dismissed';
    expect(await profile.prepareRun({ mode: 'chapter', snack: { id: 'fish', via: 'ad' } })).toEqual({ ok: false, error: 'ad_failed' });
  });

  it('doubles the gold and XP of the last run once: ad or 20 gems', async () => {
    const rig = await createTestProfile();
    const { profile } = rig;
    await playRun(rig);
    const gold = profile.data.gold;
    const xp = profile.data.accountXp;
    profile.data.gems = 0;
    expect(await profile.doubleResult('gems')).toEqual({ ok: false, error: 'not_enough_gems' });
    const r = await profile.doubleResult('ad');
    expect(r.ok && r.value.doubled).toBe(true);
    expect(profile.data.gold).toBe(gold + 470);
    expect(profile.data.accountXp).toBe(xp + 58);
    expect(await profile.doubleResult('ad')).toEqual({ ok: false, error: 'already_claimed' });
    rig.ads.outcome = 'dismissed';
    await playRun(rig);
    expect(await profile.doubleResult('ad')).toEqual({ ok: false, error: 'ad_failed' });
    expect(profile.data.lastRun?.doubled).toBe(false);
  });

  it('keeps the run for "continue?" after the app is killed, then pays it as a defeat or drops it', async () => {
    const rig = await createTestProfile();
    await playRun(rig);
    const init = await rig.profile.prepareRun({ mode: 'chapter', chapter: 1, stake: 1 });
    expect(init.ok).toBe(true);
    await rig.profile.saveSnapshot({ simVersion: 1, wave: 9, data: 'abc' });

    const after = await createTestProfile({ keepStorage: true, start: at(2026, 10, 6, 10) });
    expect(after.profile.pendingRun?.snapshot).toEqual({ simVersion: 1, wave: 9, data: 'abc' });
    expect(after.profile.pendingRun?.init).toEqual(init.ok ? init.value : null);
    expect(await after.profile.prepareRun({ mode: 'chapter' })).toEqual({ ok: false, error: 'run_active' });
    const goldBefore = after.profile.data.gold;
    const r = await after.profile.settlePendingRun();
    expect(r.ok && r.value.wavesCleared).toBe(8);
    expect(after.profile.data.gold - goldBefore).toBe(runGold(8, 1, 1, false));
    expect(after.profile.pendingRun).toBeNull();
    expect(await after.profile.settlePendingRun()).toEqual({ ok: false, error: 'nothing_to_claim' });
  });
});

describe('purchases', () => {
  it('grants an order once, however often it is delivered', async () => {
    const { profile } = await createTestProfile();
    await profile.grantOrder('starter_pack', 'order-1');
    await profile.grantOrder('starter_pack', 'order-1');
    await Promise.all([profile.grantOrder('starter_pack', 'order-1'), profile.grantOrder('starter_pack', 'order-1')]);
    expect(profile.data).toMatchObject({ gems: 300, gold: 5000 });
    expect(profile.data.chests.gold).toBe(1);
    expect(profile.isPurchasable('starter_pack')).toBe(false);
    await profile.grantOrder('gems_680', 'order-2');
    await profile.grantOrder('gems_680', 'order-3');
    expect(profile.data.gems).toBe(300 + 1360);
    expect(profile.isPurchasable('gems_680')).toBe(true);
    await expect(profile.grantOrder('nope', 'order-4')).rejects.toThrow();
  });

  it('survives a restart between the grant and anything else: the replay gives nothing more', async () => {
    const a = await createTestProfile();
    await a.profile.grantOrder('baby_cat_pack', 'o-a');
    const b = await createTestProfile({ keepStorage: true });
    expect(b.profile.data.gems).toBe(180);
    await b.profile.grantOrder('baby_cat_pack', 'o-a');
    expect(b.profile.data.gems).toBe(180);
    expect(b.profile.data.chests.silver).toBe(1);
    expect(b.profile.data.cosmetics.owned).toContain('rug_baby');
  });

  it('buys the Butler Pass: flag, rug, 3x speed; and takes it all back on a refund', async () => {
    const { profile } = await createTestProfile();
    await profile.grantOrder('butler_pass', 'bp-1');
    expect(profile.data.owned.butler).toBe(true);
    expect(profile.featureUnlocked('speed3x')).toBe(true);
    expect(profile.equip('rug_butler')).toEqual({ ok: true, value: undefined });
    expect(profile.equipped.rug).toBe('rug_butler');
    expect(profile.isPurchasable('butler_pass')).toBe(false);

    await profile.revokeOrder('bp-1');
    expect(profile.data.owned.butler).toBe(false);
    expect(profile.data.cosmetics.owned).not.toContain('rug_butler');
    expect(profile.equipped.rug).toBe('rug_default');
    expect(profile.isPurchasable('butler_pass')).toBe(true);
    await profile.revokeOrder('bp-1');
    await profile.grantOrder('butler_pass', 'bp-1');
    expect(profile.data.owned.butler).toBe(false);
  });

  it('takes back gems, gold and unopened chests of a refunded pack, never more than the player has', async () => {
    const { profile } = await createTestProfile();
    await profile.grantOrder('growth_pack', 'gp');
    profile.data.gems -= 500;
    profile.data.gold = 100;
    profile.data.chests.gold = 0;
    await profile.revokeOrder('gp');
    expect(profile.data).toMatchObject({ gems: 0, gold: 0 });
    expect(profile.data.chests.gold).toBe(0);
    expect(profile.isPurchasable('growth_pack')).toBe(true);
  });

  it('blocks an order that was refunded before its grant arrived', async () => {
    const { profile } = await createTestProfile();
    await profile.revokeOrder('late', 'gems_260');
    await profile.grantOrder('gems_260', 'late');
    expect(profile.data.gems).toBe(0);
  });

  it('gives a restored consumable nothing (it was paid out on the old device) but restores the pass', async () => {
    const { profile } = await createTestProfile();
    await profile.grantOrder('gems_1450', 'old-1', 'restore');
    await profile.grantOrder('butler_pass', 'old-2', 'restore');
    expect(profile.data.gems).toBe(0);
    expect(profile.data.owned.butler).toBe(true);
    await profile.grantOrder('gems_1450', 'old-1', 'purchase');
    expect(profile.data.gems).toBe(0);
  });

  it('breaks the piggy bank for everything in it; the pool is capped and refills only from runs', async () => {
    const rig = await createTestProfile();
    const { profile } = rig;
    expect(profile.isPurchasable('piggy_bank')).toBe(false);
    for (let i = 0; i < 3; i++) await playRun(rig);
    expect(profile.piggyView().gems).toBe(18);
    expect(profile.isPurchasable('piggy_bank')).toBe(true);
    const gems = profile.data.gems;
    await profile.grantOrder('piggy_bank', 'pig');
    expect(profile.data.gems).toBe(gems + 18);
    expect(profile.data.piggy).toEqual({ gems: 0, since: 0 });
    for (let i = 0; i < 120; i++) profile.addPiggy(6);
    expect(profile.piggyView().gems).toBe(600);
  });

  it('opens the piggy bank for a quarter after 7 days without paying', async () => {
    const rig = await createTestProfile();
    for (let i = 0; i < 20; i++) rig.profile.addPiggy(6);
    expect(rig.profile.breakPiggyFree()).toEqual({ ok: false, error: 'not_ready' });
    expect(rig.profile.piggyView().daysUntilFree).toBe(7);
    rig.clock.advance(7 * 24 * 3_600_000);
    rig.profile.resume();
    expect(rig.profile.piggyView()).toMatchObject({ freeBreakReady: true, freeBreakGems: 30 });
    expect(rig.profile.breakPiggyFree()).toEqual({ ok: true, value: 30 });
    expect(rig.profile.piggyView()).toMatchObject({ gems: 0, freeBreakReady: false });
  });

  it('applies a second season pass as gems, and the first as the premium row', async () => {
    const { profile } = await createTestProfile();
    await profile.grantOrder('season_pass', 's1');
    expect(profile.data.pass.premium).toBe(true);
    expect(profile.isPurchasable('season_pass')).toBe(false);
    await profile.grantOrder('season_pass', 's2');
    expect(profile.data.gems).toBe(600);
  });

  it('pays what a season still owes when it ends: free tiers always, premium tiers only to an owner', async () => {
    for (const owner of [false, true]) {
      const rig = await createTestProfile({ start: at(2026, 10, 30, 9) });
      const { profile } = rig;
      profile.data.pass = { ...profile.data.pass, xp: 5 * PASS_XP_PER_TIER, premium: owner, claimedFree: [1], claimedPremium: owner ? [5] : [] };
      const before = { gold: profile.data.gold, gems: profile.data.gems, wooden: profile.data.chests.wooden, silver: profile.data.chests.silver };
      const reasons: Reason[] = [];
      profile.events.on('currency', (e) => reasons.push(e.reason));

      rig.clock.advance(24 * 3_600_000); // 2026-10-31, season 1
      profile.refresh();

      expect(profile.data.pass).toEqual({ season: 1, xp: 0, premium: false, claimedFree: [], claimedPremium: [] });
      // free tiers 2 and 3 pay 400 gold each, tier 4 a wooden chest, tier 5 25 gems; tier 1 was taken
      expect(profile.data.gold - before.gold).toBe(800);
      expect(profile.data.chests.wooden - before.wooden).toBe(1);
      expect(reasons.includes('pass_free')).toBe(true);
      // premium tiers 1 to 4 (tier 5 was taken): 40 gems each and a silver chest on tier 4
      expect(reasons.includes('pass_premium')).toBe(owner);
      expect(profile.data.chests.silver - before.silver).toBe(owner ? 1 : 0);
      expect(profile.data.gems - before.gems).toBe(25 + (owner ? 160 : 0));
    }
  });

  it('settles every skipped season once, and nothing while the season runs', async () => {
    const rig = await createTestProfile({ start: at(2026, 10, 6, 9) });
    const { profile } = rig;
    profile.data.pass = { ...profile.data.pass, xp: 2 * PASS_XP_PER_TIER };
    const gold = profile.data.gold;
    rig.clock.advance(10 * 24 * 3_600_000);
    profile.refresh();
    expect(profile.data.gold).toBe(gold);
    expect(profile.data.pass.xp).toBe(2 * PASS_XP_PER_TIER);
    rig.clock.advance(70 * 24 * 3_600_000); // two seasons later
    profile.refresh();
    expect(profile.data.gold - gold).toBe(800);
    expect(profile.data.pass.season).toBe(2);
    profile.refresh();
    expect(profile.data.gold - gold).toBe(800);
  });

  it('knows all 11 products', () => {
    expect(IAP_SPECS).toHaveLength(11);
  });
});

describe('platform wiring', () => {
  it('moves ad counters into the profile and keeps them through a restart', async () => {
    const rig = await createTestProfile();
    const { ads } = makeAds();
    const detach = attachPlatform(rig.profile, { ads, iap: new IapService({ getAdapter: () => fakeAdapter().adapter, modal: new ModalGate(makePauser().pauser), analytics: new Analytics() }) });
    ads.qaSetProgress({ sessions: 2, runsBegun: 2, runsCompleted: 3 });
    expect(await ads.showRewarded('free_chest')).toBe('rewarded');
    expect(rig.profile.data.ads.daily.free_chest).toBe(1);
    await rig.profile.flush();
    detach();

    const again = await createTestProfile({ keepStorage: true });
    const { ads: ads2 } = makeAds();
    attachPlatform(again.profile, { ads: ads2, iap: new IapService({ getAdapter: () => fakeAdapter().adapter, modal: new ModalGate(makePauser().pauser), analytics: new Analytics() }) });
    expect(ads2.remaining('free_chest')).toBe(3);
  });

  it('runs a purchase through the IAP service, restores a lost grant, and revokes a refund', async () => {
    const rig = await createTestProfile();
    const fake = fakeAdapter();
    const { ads } = makeAds();
    const iap = new IapService({
      getAdapter: () => fake.adapter, modal: new ModalGate(makePauser().pauser), analytics: new Analytics(),
    });
    attachPlatform(rig.profile, { ads, iap });
    expect(iap.list()).toHaveLength(11);
    expect(iap.isAvailable('butler_pass')).toBe(true);

    expect(await iap.purchase('butler_pass')).toBe('purchased');
    expect(rig.profile.data.owned.butler).toBe(true);
    expect(ads.adFree).toBe(true);
    expect(await iap.purchase('gems_260')).toBe('purchased');
    expect(rig.profile.data.gems).toBe(260);
    const orderIds = Object.keys(rig.profile.data.orders);
    expect(orderIds).toHaveLength(2);
    expect(Object.keys(rig.profile.data.iapLedger.orders)).toEqual(orderIds);

    fake.state.listing = [{ orderId: orderIds[0]!, productId: 'butler_pass', status: 'refunded' }];
    const summary = await iap.restorePurchases();
    expect(summary.revoked).toBe(1);
    expect(rig.profile.data.owned.butler).toBe(false);
    expect(ads.adFree).toBe(false);
    expect(rig.profile.data.gems).toBe(260);
  });

  it('recovers a payment the app died on, once', async () => {
    const rig = await createTestProfile();
    const fake = fakeAdapter();
    fake.state.pending = [{ orderId: 'died-1', productId: 'gems_680' }];
    const { ads } = makeAds();
    const iap = new IapService({ getAdapter: () => fake.adapter, modal: new ModalGate(makePauser().pauser), analytics: new Analytics() });
    attachPlatform(rig.profile, { ads, iap });
    expect(await iap.recoverPending()).toBe(1);
    expect(await iap.recoverPending()).toBe(0);
    expect(rig.profile.data.gems).toBe(680);
  });
});

describe('backup code', () => {
  async function richProfile(): Promise<TestRig> {
    const rig = await createTestProfile();
    await playRun(rig);
    await playRun(rig, {}, { mode: 'chapter', chapter: 1, stake: 1 });
    rig.profile.data.gold = 123_456;
    rig.profile.data.gems = 789;
    rig.profile.data.levels.r_gunner = 7;
    rig.profile.data.cards.m_frost = 33;
    rig.profile.data.training.damage = 4;
    rig.profile.data.chests.gold = 2;
    await rig.profile.grantOrder('butler_pass', 'bp');
    return rig;
  }

  it('moves the whole profile to another device', async () => {
    const a = await richProfile();
    const code = await a.profile.exportCode();
    expect(code).toMatch(/^MG1\.z\.[0-9a-f]{8}\.[A-Za-z0-9_-]+$/);
    console.log(`[meta] backup code of a 2-run profile: ${code.length} characters`);

    const b = await createTestProfile({ start: at(2026, 10, 8) });
    const preview = await b.profile.inspectCode(code);
    expect(preview).toMatchObject({ ok: true, value: { gold: 123_456, gems: 789, chaptersCleared: 1 } });
    expect(b.profile.data.gold).toBe(0);
    const done = await b.profile.importCode(`\n  ${code.slice(0, 40)}\n${code.slice(40)}  \n`);
    expect(done.ok).toBe(true);
    const x = a.profile.data;
    const y = b.profile.data;
    for (const k of ['gold', 'gems', 'levels', 'cards', 'wild', 'training', 'chests', 'cleared', 'cosmetics', 'owned', 'orders', 'stats', 'accountXp', 'pass', 'piggy', 'goldOpened'] as const) {
      expect(y[k], k).toEqual(x[k]);
    }
    expect(b.profile.featureUnlocked('speed3x')).toBe(true);
    await b.profile.flush();
    const c = await createTestProfile({ keepStorage: true, start: at(2026, 10, 8, 13) });
    expect(c.profile.data.gold).toBe(123_456);
  });

  it('works without CompressionStream (stored, not deflated) and reads either kind', async () => {
    const a = await richProfile();
    const z = await a.profile.exportCode();
    vi.stubGlobal('CompressionStream', undefined);
    try {
      const raw = await a.profile.exportCode();
      expect(raw).toMatch(/^MG1\.r\./);
      expect(raw.length).toBeGreaterThan(z.length);
      expect((await decodeBackup(raw)).ok).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
    vi.stubGlobal('DecompressionStream', undefined);
    try {
      expect(await decodeBackup(z)).toEqual({ ok: false, error: 'unavailable' });
    } finally {
      vi.unstubAllGlobals();
    }
    expect((await decodeBackup(z)).ok).toBe(true);
  });

  it('rejects a damaged, cut, mistyped or foreign code without touching the profile', async () => {
    const a = await richProfile();
    const code = await a.profile.exportCode();
    const b = await createTestProfile({ start: at(2026, 10, 8) });
    const before = JSON.stringify(b.profile.data);
    const flip = (s: string, i: number): string => s.slice(0, i) + (s[i] === 'A' ? 'B' : 'A') + s.slice(i + 1);
    const payload = code.indexOf('.', code.indexOf('.', code.indexOf('.') + 1) + 1) + 1;
    const cases: [string, string][] = [
      ['flipped payload', flip(code, payload + 30)],
      ['flipped checksum', flip(code, 5)],
      ['cut', code.slice(0, code.length - 40)],
      ['empty', ''],
      ['words', 'hello meow world'],
      ['bad tag', 'XX1' + code.slice(3)],
      ['bad alphabet', code + '$$$'],
      ['missing part', code.split('.').slice(0, 3).join('.')],
    ];
    for (const [name, text] of cases) {
      const r = await b.profile.importCode(text);
      expect(r.ok, name).toBe(false);
      if (!r.ok) expect(['invalid_code', 'corrupt_code'], name).toContain(r.error);
    }
    expect(JSON.stringify(b.profile.data)).toBe(before);
  });

  it('refuses codes from a newer format or profile version, and valid JSON that is not a profile', async () => {
    const make = (env: unknown, mode: 'r' = 'r', tag = 'MG1'): string => {
      const bytes = new TextEncoder().encode(JSON.stringify(env));
      return `${tag}.${mode}.${crc32(bytes).toString(16).padStart(8, '0')}.${toBase64Url(bytes)}`;
    };
    const { profile } = await createTestProfile();
    const good = defaultProfile(0, 1);
    expect(await profile.importCode(make({ v: 1, t: 0, data: good }, 'r', 'MG2'))).toEqual({ ok: false, error: 'newer_version' });
    expect(await profile.importCode(make({ v: PROFILE_VERSION + 1, t: 0, data: good }))).toEqual({ ok: false, error: 'newer_version' });
    expect(await profile.importCode(make({ v: 1, t: 0, data: { hello: 'world' } }))).toEqual({ ok: false, error: 'invalid_code' });
    expect(await profile.importCode(make([1, 2, 3]))).toEqual({ ok: false, error: 'corrupt_code' });
    expect(await profile.importCode(make({ v: 0, t: 0, data: good }))).toEqual({ ok: false, error: 'corrupt_code' });
    expect((await profile.importCode(make({ v: 1, t: 5, data: good }))).ok).toBe(true);
  });

  it('clamps nonsense values in an imported profile and fills fields a newer build added', async () => {
    const { profile } = await createTestProfile();
    const bad = { ...defaultProfile(0, 1), gold: 5, gems: -50, levels: { ...defaultProfile(0, 1).levels, w_paw: 99, r_sling: -4 }, cleared: [9, 9] } as unknown;
    const stripped = bad as Record<string, unknown>;
    delete stripped.piggy;
    const bytes = new TextEncoder().encode(JSON.stringify({ v: 1, t: 0, data: stripped }));
    const code = `MG1.r.${crc32(bytes).toString(16).padStart(8, '0')}.${toBase64Url(bytes)}`;
    expect((await profile.importCode(code)).ok).toBe(true);
    const d = profile.data;
    expect(d.gems).toBe(0);
    expect(d.levels.w_paw).toBe(10);
    expect(d.levels.r_sling).toBe(1);
    expect(d.cleared).toEqual([6, 6, 0, 0, 0]);
    expect(d.piggy).toEqual({ gems: 0, since: 0 });
  });

  it('keeps purchases of both devices: an order known here is still blocked after importing a code that lacks it', async () => {
    const a = await richProfile();
    const code = await a.profile.exportCode();
    const b = await createTestProfile({ start: at(2026, 10, 8) });
    await b.profile.grantOrder('gems_260', 'only-on-b');
    expect((await b.profile.importCode(code)).ok).toBe(true);
    const gems = b.profile.data.gems;
    await b.profile.grantOrder('gems_260', 'only-on-b');
    expect(b.profile.data.gems).toBe(gems);
  });

  it('does not unfreeze a session whose clock was moved', async () => {
    const a = await richProfile();
    const code = await a.profile.exportCode();
    const b = await createTestProfile({ start: at(2026, 10, 8) });
    b.clock.advance(3_600_000);
    b.clock.setWall(b.clock.wall() + 5 * 24 * 3_600_000);
    b.profile.refresh();
    expect(b.profile.frozen).toBe(true);
    expect((await b.profile.importCode(code)).ok).toBe(true);
    expect(b.profile.frozen).toBe(true);
    expect(b.profile.calendarView().canClaim).toBe(false);
  });

  it('does not take the run in progress along', async () => {
    const a = await createTestProfile();
    await a.profile.prepareRun({ mode: 'tutorial' });
    const env = await decodeBackup(await a.profile.exportCode());
    expect(env.ok && (env.value.data as ProfileData).pending).toBeNull();
  });

  it('compresses: a fresh profile is a code of well under 2,000 characters, and unseen chest animations stay behind', async () => {
    const code = await encodeBackup(defaultProfile(0, 1), 0);
    expect(code.length).toBeLessThan(2000);
    const rig = await richProfile();
    rig.profile.data.chests.gold = 3;
    for (let i = 0; i < 3; i++) await rig.profile.openChest('gold');
    expect(rig.profile.data.reveals).toHaveLength(3);
    const env = await decodeBackup(await rig.profile.exportCode());
    expect(env.ok && (env.value.data as ProfileData).reveals).toEqual([]);
  });
});

describe('save and migration', () => {
  it('walks a migration table step by step through a SaveStore', async () => {
    setStorageBackend(createMemoryBackend());
    const table = {
      1: (raw: Record<string, unknown>) => ({ ...raw, coins: raw.gold, gold: undefined }),
      2: (raw: Record<string, unknown>) => ({ ...raw, gold: raw.coins, coins: undefined }),
    };
    expect(migrateProfile({ gold: 7 }, 1, table, 3)).toEqual({ gold: 7, coins: undefined });
    expect(migrateProfile({ gold: 7 }, 3, table, 3)).toEqual({ gold: 7 });
    expect(migrateProfile({ gold: 7 }, 1, {}, 3)).toEqual({ gold: 7 });
    expect(migrateProfile('x', 1, table, 3)).toBe('x');

    await getStorageBackend().set('k', JSON.stringify({ v: 1, t: 0, data: { gold: 7, gems: 3 } }));
    const store = new SaveStore<{ gold: number; gems: number; coins: number }>({
      key: 'k',
      version: 2,
      defaults: () => ({ gold: 0, gems: 0, coins: 0 }),
      migrate: (raw, from) => migrateProfile(raw, from, { 1: (r) => ({ ...r, coins: r.gold, gold: 0 }) }, 2),
    });
    await store.load();
    expect(store.data).toEqual({ gold: 0, gems: 3, coins: 7 });
  });

  it('has version 1, an empty migration table, and fills missing fields from the defaults on load', async () => {
    expect(PROFILE_VERSION).toBe(1);
    expect(Object.keys(MIGRATIONS)).toEqual([]);
    setStorageBackend(createMemoryBackend());
    await getStorageBackend().set(SAVE_KEY, JSON.stringify({ v: 1, t: 0, data: { gold: 999, levels: { w_paw: 4 } } }));
    const rig = await createTestProfile({ keepStorage: true });
    expect(rig.profile.data.gold).toBe(999);
    expect(rig.profile.data.levels.w_paw).toBe(4);
    expect(rig.profile.data.levels.t_alch).toBe(1);
    expect(rig.profile.data.cosmetics.rug).toBe('rug_default');
    expect(rig.profile.data.calendar).toEqual({ stamp: 0, lastDate: '', cycles: 0 });
  });

  it('survives a corrupt save: starts fresh and keeps the broken blob for support', async () => {
    setStorageBackend(createMemoryBackend());
    await getStorageBackend().set(SAVE_KEY, '{not json');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const rig = await createTestProfile({ keepStorage: true });
      expect(rig.profile.data.gold).toBe(0);
      expect(await getStorageBackend().get(SAVE_KEY + '.corrupt')).toBe('{not json');
    } finally {
      warn.mockRestore();
    }
  });

  it('clamps a hand-edited save', async () => {
    setStorageBackend(createMemoryBackend());
    await getStorageBackend().set(
      SAVE_KEY,
      JSON.stringify({ v: 1, t: 0, data: { gold: -5, tickets: 5000, levels: { w_paw: 50 }, training: { damage: 77 }, chests: { gold: -1 } } }),
    );
    const { profile } = await createTestProfile({ keepStorage: true });
    expect(profile.data.gold).toBe(0);
    expect(profile.data.levels.w_paw).toBe(10);
    expect(profile.data.training.damage).toBe(10);
    expect(profile.data.chests.gold).toBe(0);
    expect(profile.data.tickets).toBeLessThanOrEqual(5000);
    const p = defaultProfile(0, 1);
    p.cosmetics.rug = 'not_owned';
    expect(normalizeProfile(p).cosmetics.rug).toBe('rug_default');
  });

  it('writes through to storage on the commands that matter, and subscribers hear every change once', async () => {
    const rig = await createTestProfile();
    let changes = 0;
    const off = rig.profile.subscribe(() => changes++);
    rig.profile.grant('gold', 10, 'iap');
    expect(changes).toBe(0);
    rig.profile.claimCalendar();
    expect(changes).toBe(1);
    await rig.profile.flush();
    const raw = await getStorageBackend().get(SAVE_KEY);
    expect(JSON.parse(raw ?? '{}').data.calendar.stamp).toBe(1);
    off();
    rig.profile.claimFreeChest();
    expect(changes).toBe(1);
  });
});

describe('chest odds screen on the profile', () => {
  it('shows the counter and the target the next bonus would go to', async () => {
    const { profile } = await createTestProfile();
    Object.assign(profile.data.levels, { w_samurai: 3, r_gunner: 2, m_frost: 4, t_alch: 5 });
    const v = profile.oddsOf('gold');
    expect(v.pity?.target).toBe('r_gunner');
    expect(v.pity?.counter).toBe(0);
    for (const kind of ['wooden', 'silver'] as ChestKind[]) expect(profile.oddsOf(kind).pity).toBeNull();
  });
});

describe('the singleton', () => {
  it('imports the platform barrel in node and builds the app profile without side effects', async () => {
    setStorageBackend(createMemoryBackend());
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    try {
      const m = await import('@/meta');
      expect(m.profile.data.gold).toBe(0);
      expect(typeof m.initMeta).toBe('function');
      expect(m.IAP_SPECS).toHaveLength(11);
    } finally {
      debug.mockRestore();
    }
  });
});
