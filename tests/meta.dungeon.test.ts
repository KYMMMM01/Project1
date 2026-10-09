import { describe, expect, it } from 'vitest';
import type { RunStats } from '@/game/api';
import { GOLD_DUNGEON_WAVES, goldDungeonSpawns } from '@/game/data/goldDungeon';
import {
  DUNGEON_ENTRY_GEMS, DUNGEON_EXTRA_ENTRIES, DUNGEON_FIRST_CLEAR_GOLD, DUNGEON_FREE_ENTRIES, DUNGEON_KILL_GOLD, DUNGEON_TIERS,
  DUNGEON_VICTORY_MULT,
} from '@/meta/data/dungeon';
import {
  dungeonCanBuy, dungeonEntriesLeft, dungeonFirstClearGold, dungeonGold, dungeonMaxGold, dungeonTierOpen, dungeonTopTier, dungeonWaveGold,
} from '@/meta/dungeon';
import { CHAPTER_MULT } from '@/meta/data/economy';
import { sanitizeProfile, defaultProfile, normalizeProfile } from '@/meta/profileData';
import { chapterMult, computeRunPayout, runGold } from '@/meta/rewards';
import { at, createTestProfile, type TestRig } from '@/meta/testing';
import type { ProfileData, Reason } from '@/meta/types';

const HOUR = 3_600_000;

function stats(over: Partial<RunStats> = {}): RunStats {
  return {
    mode: 'gold', chapter: 1, stake: 0, seed: 99, victory: true, wavesCleared: GOLD_DUNGEON_WAVES, totalWaves: GOLD_DUNGEON_WAVES, kills: 300,
    bossesKilled: 0, summons: 20, merges: 12, molts: 0, awakenings: 0, relics: ['yarn_ball'], bestRarity: 'rare', peakEnemies: 30,
    duration: 126, revived: false, summonLuck: 0.5, damageByUnit: {}, ...over,
  };
}

/** A profile that has cleared the first `chapters` chapters, so the dungeon and that many tiers are open. */
async function opened(chapters = 3, over: Parameters<typeof createTestProfile>[0] = {}): Promise<TestRig> {
  const rig = await createTestProfile(over);
  rig.profile.data.cleared = Array.from({ length: 5 }, (_, i) => (i < chapters ? 1 : 0));
  rig.profile.data.stats.runs = 5;
  rig.profile.refresh();
  return rig;
}

/** Start a dungeon run and finish it with `over`. */
async function play(rig: TestRig, tier: number, over: Partial<RunStats> = {}) {
  const prep = await rig.profile.prepareRun({ mode: 'gold', chapter: tier });
  expect(prep.ok).toBe(true);
  return rig.profile.finishRun(stats({ chapter: tier, ...over }));
}

describe('what a dungeon run pays', () => {
  it('pays each wave more than the one before it: 10, 12, 14 ... summed over the waves cleared', () => {
    expect(dungeonWaveGold(0)).toBe(0);
    expect(dungeonWaveGold(1)).toBe(10);
    expect(dungeonWaveGold(2)).toBe(22);
    expect(dungeonWaveGold(8)).toBe(136);
    for (let w = 1; w < GOLD_DUNGEON_WAVES; w++) expect(dungeonWaveGold(w + 1) - dungeonWaveGold(w)).toBeGreaterThan(dungeonWaveGold(w) - dungeonWaveGold(w - 1));
    // Waves that were never in the run pay nothing: the count is held to the run's length.
    expect(dungeonWaveGold(30)).toBe(dungeonWaveGold(GOLD_DUNGEON_WAVES));
    expect(dungeonWaveGold(-3)).toBe(0);
  });

  it('is (waves + 0.35 per kill) x the tier multiplier x 1.25 for a win', () => {
    expect(DUNGEON_KILL_GOLD).toBe(0.35);
    expect(DUNGEON_VICTORY_MULT).toBe(1.25);
    expect(dungeonGold({ tier: 1, wavesCleared: 8, kills: 300, victory: true })).toBe(Math.round((136 + 105) * 1.25));
    expect(dungeonGold({ tier: 1, wavesCleared: 8, kills: 300, victory: false })).toBe(241);
    expect(dungeonGold({ tier: 3, wavesCleared: 5, kills: 200, victory: false })).toBe(Math.round((70 + 70) * 1.6));
    expect(dungeonGold({ tier: 2, wavesCleared: 0, kills: 0, victory: false })).toBe(0);
  });

  it('grows with kills and with waves, and a win pays more than the same run lost', () => {
    const base = { tier: 2, wavesCleared: 6, kills: 150, victory: false };
    expect(dungeonGold({ ...base, kills: 250 })).toBeGreaterThan(dungeonGold(base));
    expect(dungeonGold({ ...base, wavesCleared: 7 })).toBeGreaterThan(dungeonGold(base));
    expect(dungeonGold({ ...base, victory: true })).toBeGreaterThan(dungeonGold(base));
    expect(dungeonGold({ ...base, kills: -40 })).toBe(dungeonGold({ ...base, kills: 0 }));
  });

  it('scales with the tier by the chapter multiplier (1 / 1.3 / 1.6 / 2 / 2.5)', () => {
    const run = { wavesCleared: 8, kills: 300, victory: true };
    for (let tier = 1; tier <= DUNGEON_TIERS; tier++) {
      expect(chapterMult(tier)).toBe(CHAPTER_MULT[tier - 1]);
      expect(dungeonGold({ tier, ...run })).toBe(Math.round(241 * chapterMult(tier) * 1.25));
    }
  });

  it('caps a full clear per tier at 345 / 448 / 551 / 689 / 861 gold, and the first win of the day adds 100 x the multiplier', () => {
    expect([1, 2, 3, 4, 5].map(dungeonMaxGold)).toEqual([345, 448, 551, 689, 861]);
    expect(DUNGEON_FIRST_CLEAR_GOLD).toBe(100);
    expect([1, 2, 3, 4, 5].map(dungeonFirstClearGold)).toEqual([100, 130, 160, 200, 250]);
    // The most a run can have is every enemy the script spawns.
    expect(goldDungeonSpawns()).toBe(399);
  });

  it('is a meaningful but not dominant source: a clean tier-3 win pays about a patrol and about 0.7 of a chapter win', () => {
    const win = dungeonMaxGold(3);
    expect(win).toBeLessThan(runGold(24, 3, 0, true));
    expect(win).toBeGreaterThan(runGold(24, 3, 0, true) * 0.6);
    // The two free entries and the bonus of a day at tier 3: about 1,250 gold.
    expect(win * DUNGEON_FREE_ENTRIES + dungeonFirstClearGold(3)).toBeLessThan(1300);
  });
});

describe('tiers and entries', () => {
  it('opens tier n with chapter n cleared at butler level 0 (higher levels do not matter)', () => {
    expect([1, 2, 3, 4, 5].map((n) => dungeonTierOpen([0, 0, 0, 0, 0], n))).toEqual([false, false, false, false, false]);
    expect([1, 2, 3, 4, 5].map((n) => dungeonTierOpen([1, 0, 0, 0, 0], n))).toEqual([true, false, false, false, false]);
    expect([1, 2, 3, 4, 5].map((n) => dungeonTierOpen([6, 6, 1, 0, 0], n))).toEqual([true, true, true, false, false]);
    expect(dungeonTierOpen([6, 6, 6, 6, 6], 6)).toBe(false);
    expect(dungeonTierOpen([6, 6, 6, 6, 6], 0)).toBe(false);
    expect(dungeonTierOpen([6, 6, 6, 6, 6], 2.5)).toBe(false);
    expect([0, 1, 3, 5].map((n) => dungeonTopTier(Array.from({ length: 5 }, (_, i) => (i < n ? 1 : 0))))).toEqual([0, 1, 3, 5]);
  });

  it('holds two free entries and one more to buy a day', () => {
    expect([DUNGEON_FREE_ENTRIES, DUNGEON_EXTRA_ENTRIES, DUNGEON_ENTRY_GEMS]).toEqual([2, 1, 30]);
    const day = { used: 0, bought: 0, firstClear: false };
    expect(dungeonEntriesLeft(day)).toBe(2);
    expect(dungeonEntriesLeft({ ...day, used: 2 })).toBe(0);
    expect(dungeonEntriesLeft({ ...day, used: 2, bought: 1 })).toBe(1);
    expect(dungeonEntriesLeft({ ...day, used: 9 })).toBe(0);
    expect(dungeonCanBuy(day)).toBe(true);
    expect(dungeonCanBuy({ ...day, bought: 1 })).toBe(false);
  });
});

describe('the payout of a run', () => {
  const ctx = { cleared: [1, 1, 1, 0, 0], dailyAlreadyCleared: false };

  it('is gold and XP only: no chest, no first-clear reward, no consolation cards', () => {
    const win = computeRunPayout(stats({ chapter: 3 }), ctx);
    expect(win.bundle).toEqual({});
    expect(win.firstClear).toBe(false);
    expect(win.dailyFirstClear).toBe(false);
    expect(win.xp).toBe(10 + 2 * 8);
    const lost = computeRunPayout(stats({ chapter: 3, victory: false, wavesCleared: 12 }), ctx);
    expect(lost.bundle).toEqual({});
  });

  it('adds the first-victory bonus once a day, and only for a victory', () => {
    const win = computeRunPayout(stats({ chapter: 3 }), ctx);
    expect(win.dungeonBonus).toBe(160);
    expect(win.gold).toBe(dungeonGold({ tier: 3, wavesCleared: 8, kills: 300, victory: true }) + 160);
    const again = computeRunPayout(stats({ chapter: 3 }), { ...ctx, dungeonFirstDone: true });
    expect(again.dungeonBonus).toBe(0);
    expect(again.gold).toBe(win.gold - 160);
    const lost = computeRunPayout(stats({ chapter: 3, victory: false }), ctx);
    expect(lost.dungeonBonus).toBe(0);
  });
});

describe('entering the dungeon', () => {
  it('is locked until chapter 1 is cleared, and a tier is locked until its chapter is', async () => {
    const rig = await createTestProfile();
    expect(rig.profile.featureUnlocked('dungeon')).toBe(false);
    expect((await rig.profile.prepareRun({ mode: 'gold', chapter: 1 })).ok).toBe(false);
    const open = await opened(2);
    expect(open.profile.featureUnlocked('dungeon')).toBe(true);
    const locked = await open.profile.prepareRun({ mode: 'gold', chapter: 3 });
    expect(locked).toEqual({ ok: false, error: 'locked' });
    expect(open.profile.pendingRun).toBeNull();
    expect(open.profile.dungeonView().entriesLeft).toBe(2);
  });

  it('opens with chapter 1 and says so once, through the unlock event', async () => {
    const rig = await createTestProfile();
    const unlocked: string[] = [];
    rig.profile.events.on('unlock', (e) => unlocked.push(e.feature));
    rig.profile.data.cleared = [1, 0, 0, 0, 0];
    rig.profile.refresh();
    rig.profile.refresh();
    expect(unlocked.filter((f) => f === 'dungeon')).toEqual(['dungeon']);
    expect(rig.analytics.filter((a) => a.event === 'feature_unlock' && a.params.feature === 'dungeon')).toHaveLength(1);
  });

  it('builds the run from the profile: the tier is the chapter, the stake is 0, the cats are the player\'s own, no snack', async () => {
    const rig = await opened(3);
    rig.profile.data.levels.w_paw = 7;
    const prep = await rig.profile.prepareRun({ mode: 'gold', chapter: 3, stake: 4 });
    expect(prep.ok).toBe(true);
    if (!prep.ok) return;
    expect(prep.value).toMatchObject({ mode: 'gold', chapter: 3, stake: 0 });
    expect(prep.value.loadout.unitLevels.w_paw).toBe(7);
    expect(prep.value.modifiers).toBeUndefined();
    expect(rig.analytics.find((a) => a.event === 'run_start')?.params).toMatchObject({ mode: 'gold', chapter: 3 });
    await rig.profile.discardPendingRun();
    const snack = await rig.profile.prepareRun({ mode: 'gold', chapter: 1, snack: { id: 'fish', via: 'gems' } });
    expect(snack).toEqual({ ok: false, error: 'locked' });
  });

  it('takes an entry when the run starts, and there are two a day', async () => {
    const rig = await opened(3);
    const { profile } = rig;
    expect(profile.dungeonView()).toMatchObject({ entriesLeft: 2, used: 0, canBuy: true });
    await play(rig, 1);
    expect(profile.dungeonView().entriesLeft).toBe(1);
    await play(rig, 2);
    expect(profile.dungeonView().entriesLeft).toBe(0);
    expect(await profile.prepareRun({ mode: 'gold', chapter: 1 })).toEqual({ ok: false, error: 'limit_reached' });
    expect(profile.pendingRun).toBeNull();
    expect(profile.dungeonView().used).toBe(2);
  });

  it('does not give the entry back when the run is thrown away, or when the app is closed in the middle of it', async () => {
    const rig = await opened(3);
    await rig.profile.prepareRun({ mode: 'gold', chapter: 1 });
    expect(rig.profile.dungeonView().entriesLeft).toBe(1);
    await rig.profile.discardPendingRun();
    expect(rig.profile.dungeonView().entriesLeft).toBe(1);

    await rig.profile.prepareRun({ mode: 'gold', chapter: 1 });
    const restarted = await createTestProfile({ keepStorage: true, start: at(2026, 10, 6, 9) });
    expect(restarted.profile.pendingRun?.init.mode).toBe('gold');
    expect(restarted.profile.dungeonView()).toMatchObject({ used: 2, entriesLeft: 0 });
    // The pending run blocks a second start; it is the same entry, not a new one.
    expect(await restarted.profile.prepareRun({ mode: 'gold', chapter: 1 })).toEqual({ ok: false, error: 'run_active' });
    expect(restarted.profile.dungeonView().used).toBe(2);
  });
});

describe('paying the run out', () => {
  it('pays gold with the reason "dungeon", records the run and flies the numbers through the one money path', async () => {
    const rig = await opened(3);
    const events: { delta: number; reason: Reason }[] = [];
    rig.profile.events.on('currency', (e) => {
      if (e.currency === 'gold') events.push({ delta: e.delta, reason: e.reason });
    });
    const goldBefore = rig.profile.data.gold;
    const r = await play(rig, 3, { kills: 300 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const base = dungeonGold({ tier: 3, wavesCleared: 8, kills: 300, victory: true });
    expect(r.value).toMatchObject({ mode: 'gold', chapter: 3, victory: true, wavesCleared: 8, gold: base + 160, bonus: 160, kills: 300, xp: 26, newBest: true });
    expect(r.value.bundle).toEqual({});
    expect(rig.profile.data.gold).toBe(goldBefore + base + 160);
    expect(events).toEqual([{ delta: base + 160, reason: 'dungeon' }]);
    expect(rig.analytics.find((a) => a.event === 'run_end')?.params).toMatchObject({ mode: 'gold', chapter: 3, result: 'victory', waves: 8 });
    expect(rig.profile.data.lastRun?.id).toBe(r.value.id);
    expect(rig.ads.runs).toEqual(['begin', 'victory']);
  });

  it('pays a lost run by what it got through, with no victory multiplier and no bonus', async () => {
    const rig = await opened(1);
    const r = await play(rig, 1, { victory: false, wavesCleared: 5, kills: 160 });
    expect(r.ok && r.value.gold).toBe(Math.round(70 + 56));
    expect(r.ok && r.value.bonus).toBe(0);
    // A defeat leaves the day's bonus for the first win.
    expect(rig.profile.dungeonView().firstClearOpen).toBe(true);
    const win = await play(rig, 1);
    expect(win.ok && win.value.bonus).toBe(100);
    expect(rig.profile.dungeonView().firstClearOpen).toBe(false);
  });

  it('pays the first-victory bonus once a day, and again after the day rolls over', async () => {
    const rig = await opened(2);
    const a = await play(rig, 2);
    const b = await play(rig, 2);
    expect(a.ok && a.value.bonus).toBe(130);
    expect(b.ok && b.value.bonus).toBe(0);
    expect(a.ok && b.ok && a.value.gold - 130).toBe(b.ok ? b.value.gold : -1);
    rig.clock.advance(24 * HOUR);
    rig.profile.refresh();
    expect(rig.profile.dungeonView()).toMatchObject({ used: 0, entriesLeft: 2, firstClearOpen: true });
    const c = await play(rig, 2);
    expect(c.ok && c.value.bonus).toBe(130);
  });

  it('keeps the best run of each tier by its own gold (the bonus is not part of it)', async () => {
    const rig = await opened(3, { start: at(2026, 10, 6, 9) });
    const first = await play(rig, 2, { kills: 200 });
    expect(first.ok && first.value.newBest).toBe(true);
    const base = dungeonGold({ tier: 2, wavesCleared: 8, kills: 200, victory: true });
    expect(rig.profile.dungeonView().tiers[1]?.best).toEqual({ waves: 8, kills: 200, gold: base });
    // A weaker run later: the best stays, and no "new best" is announced.
    rig.clock.advance(24 * HOUR);
    rig.profile.refresh();
    const weaker = await play(rig, 2, { victory: false, wavesCleared: 6, kills: 120 });
    expect(weaker.ok && weaker.value.newBest).toBe(false);
    expect(rig.profile.dungeonView().tiers[1]?.best.gold).toBe(base);
    const better = await play(rig, 2, { kills: 380 });
    expect(better.ok && better.value.newBest).toBe(true);
    expect(rig.profile.dungeonView().tiers[1]?.best).toMatchObject({ kills: 380 });
    // Another tier keeps its own record.
    expect(rig.profile.dungeonView().tiers[2]?.best).toEqual({ waves: 0, kills: 0, gold: 0 });
  });

  it('counts for the daily missions that count runs, merges, toys and wins, but never for bosses and elites', async () => {
    const rig = await opened(3);
    const before = rig.profile.data.stats.runs;
    await play(rig, 1, { merges: 12, relics: ['yarn_ball', 'mouse_toy'] });
    const d = rig.profile.data;
    expect(d.stats).toMatchObject({ runs: before + 1 });
    // d_runs, d_merges, d_bosses, d_relics, d_wins
    expect(d.day.missions.progress).toEqual([1, 12, 0, 2, 1]);
    // The elite wave of a chapter (wave 4) never exists in the dungeon.
    expect(d.stats.bosses).toBe(0);
    expect(d.piggy.gems).toBe(6);
    expect(d.accountXp).toBeGreaterThan(0);
  });

  it('can be doubled on the result screen like any run, and the doubling is paid once', async () => {
    const rig = await opened(1);
    const r = await play(rig, 1);
    const gold = rig.profile.data.gold;
    expect(r.ok).toBe(true);
    rig.profile.data.gems = 100;
    const doubled = await rig.profile.doubleResult('gems');
    expect(doubled.ok).toBe(true);
    expect(rig.profile.data.gold).toBe(gold + (r.ok ? r.value.gold : 0));
    expect((await rig.profile.doubleResult('gems')).ok).toBe(false);
  });
});

describe('no double pay', () => {
  it('refuses a second payout for the same run, and one for a run that never started', async () => {
    const rig = await opened(2);
    expect((await rig.profile.finishRun(stats({ chapter: 1 }))).ok).toBe(false);
    expect(rig.profile.data.gold).toBe(0);
    const first = await play(rig, 1);
    const gold = rig.profile.data.gold;
    expect(first.ok).toBe(true);
    expect(await rig.profile.finishRun(stats({ chapter: 1 }))).toEqual({ ok: false, error: 'nothing_to_claim' });
    expect(rig.profile.data.gold).toBe(gold);
    expect(rig.profile.data.stats.runs).toBe(6);
  });

  it('keeps what was paid when the app restarts, and the restart pays nothing again', async () => {
    const rig = await opened(2, { start: at(2026, 10, 6, 9) });
    const r = await play(rig, 2);
    await rig.profile.flush();
    const gold = rig.profile.data.gold;
    const restarted = await createTestProfile({ keepStorage: true, start: at(2026, 10, 6, 9, 30) });
    expect(restarted.profile.data.gold).toBe(gold);
    expect(restarted.profile.pendingRun).toBeNull();
    expect(restarted.profile.data.lastRun?.id).toBe(r.ok ? r.value.id : -1);
    expect(restarted.profile.dungeonView()).toMatchObject({ used: 1, entriesLeft: 1, firstClearOpen: false });
    expect((await restarted.profile.settlePendingRun()).ok).toBe(false);
    expect(restarted.profile.data.gold).toBe(gold);
  });

  it('pays a run the app died in once, by the last wave it saved, and then never again', async () => {
    const rig = await opened(1, { start: at(2026, 10, 6, 9) });
    await rig.profile.prepareRun({ mode: 'gold', chapter: 1 });
    await rig.profile.saveSnapshot({ simVersion: 99, wave: 5, data: '{}' });
    const restarted = await createTestProfile({ keepStorage: true, start: at(2026, 10, 6, 10) });
    expect(restarted.profile.pendingRun?.snapshot?.wave).toBe(5);
    const settled = await restarted.profile.settlePendingRun();
    // Four waves cleared, no kills known: 10 + 12 + 14 + 16.
    expect(settled.ok && settled.value.gold).toBe(52);
    expect(restarted.profile.data.gold).toBe(52);
    expect((await restarted.profile.settlePendingRun()).ok).toBe(false);
    const again = await createTestProfile({ keepStorage: true, start: at(2026, 10, 6, 11) });
    expect(again.profile.data.gold).toBe(52);
    expect(again.profile.dungeonView().used).toBe(1);
  });
});

describe('the extra entry', () => {
  async function spent(): Promise<TestRig> {
    const rig = await opened(3);
    await play(rig, 1);
    await play(rig, 1);
    expect(rig.profile.dungeonView().entriesLeft).toBe(0);
    return rig;
  }

  it('costs 30 gems, and gives exactly one entry that the run then takes', async () => {
    const rig = await spent();
    rig.profile.data.gems = 100;
    const spentEvents: Reason[] = [];
    rig.profile.events.on('currency', (e) => {
      if (e.currency === 'gems') spentEvents.push(e.reason);
    });
    const r = await rig.profile.buyDungeonEntry('gems');
    expect(r.ok).toBe(true);
    expect(rig.profile.data.gems).toBe(70);
    expect(spentEvents).toEqual(['offer_dungeon']);
    expect(rig.profile.dungeonView()).toMatchObject({ bought: 1, entriesLeft: 1, canBuy: false });
    const run = await play(rig, 2);
    expect(run.ok).toBe(true);
    expect(rig.profile.dungeonView()).toMatchObject({ used: 3, entriesLeft: 0 });
    expect(await rig.profile.prepareRun({ mode: 'gold', chapter: 1 })).toEqual({ ok: false, error: 'limit_reached' });
  });

  it('is sold once a day: a second purchase is refused before anything is charged', async () => {
    const rig = await spent();
    rig.profile.data.gems = 100;
    await rig.profile.buyDungeonEntry('gems');
    const gems = rig.profile.data.gems;
    expect(await rig.profile.buyDungeonEntry('gems')).toEqual({ ok: false, error: 'limit_reached' });
    expect(await rig.profile.buyDungeonEntry('ad')).toEqual({ ok: false, error: 'limit_reached' });
    expect(rig.profile.data.gems).toBe(gems);
    expect(rig.ads.shown).toEqual([]);
    expect(rig.profile.dungeonView().bought).toBe(1);
  });

  it('charges nothing when the gems are short', async () => {
    const rig = await spent();
    rig.profile.data.gems = 29;
    expect(await rig.profile.buyDungeonEntry('gems')).toEqual({ ok: false, error: 'not_enough_gems' });
    expect(rig.profile.data.gems).toBe(29);
    expect(rig.profile.dungeonView()).toMatchObject({ bought: 0, entriesLeft: 0, canBuy: true });
  });

  it('takes a rewarded ad instead of gems, on its own placement, and gives the entry only when the ad was watched', async () => {
    const rig = await spent();
    rig.profile.data.gems = 100;
    rig.ads.outcome = 'dismissed';
    expect(await rig.profile.buyDungeonEntry('ad')).toEqual({ ok: false, error: 'ad_failed' });
    rig.ads.outcome = 'capped';
    expect(await rig.profile.buyDungeonEntry('ad')).toEqual({ ok: false, error: 'limit_reached' });
    rig.ads.outcome = 'unavailable';
    expect((await rig.profile.buyDungeonEntry('ad')).ok).toBe(false);
    expect(rig.profile.dungeonView().bought).toBe(0);
    rig.ads.outcome = 'rewarded';
    const r = await rig.profile.buyDungeonEntry('ad');
    expect(r.ok).toBe(true);
    expect(rig.ads.shown.every((p) => p === 'dungeon_entry')).toBe(true);
    expect(rig.ads.shown).toHaveLength(4);
    expect(rig.profile.data.gems).toBe(100);
    expect(rig.profile.dungeonView()).toMatchObject({ bought: 1, entriesLeft: 1 });
  });

  it('is locked with the dungeon, and the purchase of yesterday does not carry over', async () => {
    const locked = await createTestProfile();
    locked.profile.data.gems = 100;
    expect(await locked.profile.buyDungeonEntry('gems')).toEqual({ ok: false, error: 'locked' });
    expect(locked.profile.data.gems).toBe(100);

    const rig = await spent();
    rig.profile.data.gems = 100;
    await rig.profile.buyDungeonEntry('gems');
    rig.clock.advance(24 * HOUR);
    rig.profile.refresh();
    expect(rig.profile.dungeonView()).toMatchObject({ used: 0, bought: 0, entriesLeft: 2, canBuy: true });
  });
});

describe('the day', () => {
  it('starts over with the daily reset: two entries, the bonus open', async () => {
    const rig = await opened(1);
    await play(rig, 1);
    await play(rig, 1);
    expect(rig.profile.dungeonView()).toMatchObject({ entriesLeft: 0, firstClearOpen: false });
    rig.clock.advance(HOUR * 6);
    rig.profile.refresh();
    expect(rig.profile.dungeonView().entriesLeft).toBe(0);
    rig.clock.advance(HOUR * 18);
    rig.profile.refresh();
    expect(rig.profile.dungeonView()).toMatchObject({ entriesLeft: 2, used: 0, firstClearOpen: true });
  });

  it('does not come back when the clock is set back: the reset only goes forward', async () => {
    const rig = await opened(1, { start: at(2026, 10, 6, 9) });
    await play(rig, 1);
    await play(rig, 1);
    rig.clock.advance(24 * HOUR);
    rig.profile.refresh();
    expect(rig.profile.dungeonView().entriesLeft).toBe(2);
    await play(rig, 1);
    // The device clock is turned back to yesterday: today's entries are still today's.
    rig.clock.setWall(at(2026, 10, 6, 12));
    rig.profile.resume();
    expect(rig.profile.dungeonView()).toMatchObject({ used: 1, entriesLeft: 1 });
  });

  it('takes a run that ends after midnight into the new day: its bonus is the new day\'s', async () => {
    const rig = await opened(1, { start: at(2026, 10, 6, 23, 55) });
    await rig.profile.prepareRun({ mode: 'gold', chapter: 1 });
    rig.clock.advance(10 * 60_000);
    const r = await rig.profile.finishRun(stats());
    expect(r.ok && r.value.bonus).toBe(100);
    expect(rig.profile.dungeonView()).toMatchObject({ used: 0, firstClearOpen: false });
  });
});

describe('the save', () => {
  it('has the dungeon with its defaults, and a save from before it loads without losing the rest', () => {
    const fresh = defaultProfile(1, 2);
    expect(fresh.dungeon.best).toHaveLength(DUNGEON_TIERS);
    expect(fresh.day.dungeon).toEqual({ used: 0, bought: 0, firstClear: false });
    const old = JSON.parse(JSON.stringify(fresh)) as Record<string, unknown>;
    delete old.dungeon;
    delete (old.day as Record<string, unknown>).dungeon;
    (old as { gold: number }).gold = 777;
    const loaded = sanitizeProfile(old, 1, 2) as ProfileData;
    expect(loaded.gold).toBe(777);
    expect(loaded.dungeon.best).toHaveLength(DUNGEON_TIERS);
    expect(loaded.day.dungeon).toEqual({ used: 0, bought: 0, firstClear: false });
  });

  it('brings damaged counters back into range', () => {
    const p = defaultProfile(1, 2);
    p.day.dungeon.used = -4;
    p.day.dungeon.bought = Number.NaN;
    p.dungeon.best = [{ waves: -1, kills: 12.7, gold: 1e12 }];
    normalizeProfile(p);
    expect(p.day.dungeon).toMatchObject({ used: 0, bought: 0 });
    expect(p.dungeon.best).toHaveLength(DUNGEON_TIERS);
    expect(p.dungeon.best[0]).toEqual({ waves: 0, kills: 12, gold: 2_000_000_000 });
    expect(p.dungeon.best[4]).toEqual({ waves: 0, kills: 0, gold: 0 });
  });

  it('survives a backup code: the records and the day\'s entries come along', async () => {
    const rig = await opened(2);
    await play(rig, 2);
    const code = await rig.profile.exportCode();
    const other = await createTestProfile({ start: at(2026, 10, 6, 9, 5) });
    expect((await other.profile.importCode(code)).ok).toBe(true);
    expect(other.profile.dungeonView().tiers[1]?.best.gold).toBeGreaterThan(0);
    expect(other.profile.dungeonView()).toMatchObject({ used: 1, firstClearOpen: false });
  });
});

describe('the test grants (development platform only)', () => {
  it('are refused on a profile that was not told it runs on the development platform', async () => {
    const rig = await createTestProfile();
    expect(rig.profile.grantTest('gold', 10_000)).toEqual({ ok: false, error: 'unavailable' });
    expect(rig.profile.data.gold).toBe(0);
  });

  it('hand out gold, gems and tickets through the money path with the reason "test"', async () => {
    const rig = await createTestProfile({ testGrants: true });
    const events: { currency: string; delta: number; reason: Reason }[] = [];
    rig.profile.events.on('currency', (e) => events.push({ currency: e.currency, delta: e.delta, reason: e.reason }));
    const gems = rig.profile.data.gems;
    expect(rig.profile.grantTest('gold', 10_000)).toEqual({ ok: true, value: 10_000 });
    expect(rig.profile.grantTest('gems', 1_000)).toEqual({ ok: true, value: 1_000 });
    expect(rig.profile.data.gold).toBe(10_000);
    expect(rig.profile.data.gems).toBe(gems + 1_000);
    expect(events).toEqual([
      { currency: 'gold', delta: 10_000, reason: 'test' },
      { currency: 'gems', delta: 1_000, reason: 'test' },
    ]);
    expect(rig.analytics.filter((a) => a.event === 'currency' && a.params.reason === 'test')).toHaveLength(2);
  });

  it('stop tickets at their cap and refuse nonsense amounts', async () => {
    const rig = await createTestProfile({ testGrants: true });
    const tickets = rig.profile.data.tickets;
    expect(rig.profile.grantTest('tickets', 5)).toEqual({ ok: true, value: 5 });
    expect(rig.profile.data.tickets).toBe(tickets + 5);
    rig.profile.data.tickets = 97;
    expect(rig.profile.grantTest('tickets', 5)).toEqual({ ok: true, value: 2 });
    expect(rig.profile.grantTest('tickets', 5)).toEqual({ ok: false, error: 'limit_reached' });
    for (const bad of [0, -5, Number.NaN, 100_001]) expect(rig.profile.grantTest('gold', bad)).toEqual({ ok: false, error: 'invalid' });
    expect(rig.profile.data.gold).toBe(0);
  });
});
