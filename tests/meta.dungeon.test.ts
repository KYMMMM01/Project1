import { describe, expect, it } from 'vitest';
import type { RunStats } from '@/game/api';
import { GOLD_DUNGEON_WAVES, goldDungeonSpawns } from '@/game/data/goldDungeon';
import {
  DUNGEON_CHEST_GOLD, DUNGEON_ENTRY_GEMS, DUNGEON_EXTRA_ENTRIES, DUNGEON_FREE_ENTRIES, DUNGEON_KILL_GOLD, DUNGEON_TIERS, DUNGEON_WAVE_BASE, DUNGEON_WAVE_STEP,
} from '@/meta/data/dungeon';
import {
  dungeonCanBuy, dungeonChestGold, dungeonEntriesLeft, dungeonGold, dungeonMaxChest, dungeonMaxGold, dungeonTierOpen, dungeonTopTier, dungeonWaveGold,
} from '@/meta/dungeon';
import { CHAPTER_MULT } from '@/meta/data/economy';
import { sanitizeProfile, defaultProfile, normalizeProfile } from '@/meta/profileData';
import { chapterMult, computeRunPayout, runGold } from '@/meta/rewards';
import { at, createTestProfile, type TestRig } from '@/meta/testing';
import type { ProfileData, Reason } from '@/meta/types';
import { entriesText } from '@/screens/battle/dungeonModel';

const HOUR = 3_600_000;
/** What a full clear of the script spawns: every coin, the chest and the coins it spills. */
const ALL = goldDungeonSpawns();

function stats(over: Partial<RunStats> = {}): RunStats {
  return {
    mode: 'gold', chapter: 1, stake: 0, seed: 99, victory: true, wavesCleared: GOLD_DUNGEON_WAVES, totalWaves: GOLD_DUNGEON_WAVES, kills: ALL,
    bossesKilled: 1, summons: 20, merges: 12, molts: 0, awakenings: 0, relics: ['yarn_ball'], bestRarity: 'rare', peakEnemies: 30,
    duration: 140, revived: false, summonLuck: 0.5, damageByUnit: {}, ...over,
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

/** The next day: the one entry comes back. */
function tomorrow(rig: TestRig): void {
  rig.clock.advance(24 * HOUR);
  rig.profile.refresh();
}

describe('what a dungeon run pays', () => {
  it('pays each wave more than the one before it: 17, 20, 23 ... summed over the waves cleared', () => {
    expect([DUNGEON_WAVE_BASE, DUNGEON_WAVE_STEP]).toEqual([14, 3]);
    expect(dungeonWaveGold(0)).toBe(0);
    expect(dungeonWaveGold(1)).toBe(17);
    expect(dungeonWaveGold(2)).toBe(37);
    expect(dungeonWaveGold(8)).toBe(220);
    for (let w = 1; w < GOLD_DUNGEON_WAVES; w++) expect(dungeonWaveGold(w + 1) - dungeonWaveGold(w)).toBeGreaterThan(dungeonWaveGold(w) - dungeonWaveGold(w - 1));
    // Waves that were never in the run pay nothing: the count is held to the run's length.
    expect(dungeonWaveGold(30)).toBe(dungeonWaveGold(GOLD_DUNGEON_WAVES));
    expect(dungeonWaveGold(-3)).toBe(0);
  });

  it('is one formula: (the waves cleared + 4 a kill + 456 for the chest) x the tier multiplier', () => {
    expect([DUNGEON_KILL_GOLD, DUNGEON_CHEST_GOLD]).toEqual([4, 456]);
    expect(ALL).toBe(131);
    // A full clear at tier 1: 220 for the waves, 4 x 131 for the kills, 456 for the chest.
    expect(dungeonGold({ tier: 1, wavesCleared: 8, kills: ALL, victory: true })).toBe(220 + 524 + 456);
    expect(dungeonGold({ tier: 1, wavesCleared: 8, kills: ALL, victory: true })).toBe(1200);
    // The same run without the chest (the chest did not fall, so it is a defeat) is the first two parts only.
    expect(dungeonGold({ tier: 1, wavesCleared: 8, kills: ALL, victory: false })).toBe(220 + 524);
    expect(dungeonGold({ tier: 3, wavesCleared: 5, kills: 80, victory: false })).toBe(Math.round((115 + 320) * 1.6));
    expect(dungeonGold({ tier: 2, wavesCleared: 0, kills: 0, victory: false })).toBe(0);
  });

  it('grows with kills and with waves, and a win (the chest) pays more than the same run lost', () => {
    const base = { tier: 2, wavesCleared: 6, kills: 70, victory: false };
    expect(dungeonGold({ ...base, kills: 90 })).toBeGreaterThan(dungeonGold(base));
    expect(dungeonGold({ ...base, wavesCleared: 7 })).toBeGreaterThan(dungeonGold(base));
    expect(dungeonGold({ ...base, victory: true })).toBe(dungeonGold(base) + Math.round(456 * 1.3));
    expect(dungeonGold({ ...base, kills: -40 })).toBe(dungeonGold({ ...base, kills: 0 }));
  });

  it('holds the kills to what the script can spawn: a run saved under the older, longer script (399 kills) cannot pay more than a full clear', () => {
    const full = { tier: 1, wavesCleared: 8, kills: ALL, victory: true };
    expect(dungeonGold({ ...full, kills: 399 })).toBe(dungeonGold(full));
    expect(dungeonGold({ ...full, kills: 9_999_999 })).toBe(dungeonGold(full));
    expect(dungeonGold({ ...full, kills: ALL - 1 })).toBe(dungeonGold(full) - DUNGEON_KILL_GOLD);
  });

  it('scales with the tier by the chapter multiplier (1 / 1.3 / 1.6 / 2 / 2.5)', () => {
    const run = { wavesCleared: 8, kills: ALL, victory: true };
    for (let tier = 1; tier <= DUNGEON_TIERS; tier++) {
      expect(chapterMult(tier)).toBe(CHAPTER_MULT[tier - 1]);
      expect(dungeonGold({ tier, ...run })).toBe(Math.round(1200 * chapterMult(tier)));
    }
  });

  it('caps a full clear per tier at 1,200 / 1,560 / 1,920 / 2,400 / 3,000 gold: about 90% of the old day (two full free runs and the first-clear bonus)', () => {
    expect([1, 2, 3, 4, 5].map(dungeonMaxGold)).toEqual([1200, 1560, 1920, 2400, 3000]);
    // The old table (2026-10-10 to 2026-10-11): a run's maximum 574 / 747 / 919 / 1,149 / 1,436 x 2 free runs + the bonus 200 x the multiplier.
    const OLD_MAX = [574, 747, 919, 1149, 1436];
    const OLD_BONUS = [200, 260, 320, 400, 500];
    const OLD_DAY = OLD_MAX.map((max, i) => max * 2 + (OLD_BONUS[i] as number));
    expect(OLD_DAY).toEqual([1348, 1754, 2158, 2698, 3372]);
    for (let tier = 1; tier <= DUNGEON_TIERS; tier++) {
      const ratio = dungeonMaxGold(tier) / (OLD_DAY[tier - 1] as number);
      expect(ratio, `tier ${tier}`).toBeGreaterThan(0.88);
      expect(ratio, `tier ${tier}`).toBeLessThan(0.91);
    }
  });

  it('holds the chest\'s share apart: what the same win would have paid without it', () => {
    expect([1, 2, 3, 4, 5].map(dungeonMaxChest)).toEqual([456, 593, 730, 912, 1140]);
    const win = { tier: 3, wavesCleared: 8, kills: 100, victory: true };
    expect(dungeonChestGold(win)).toBe(dungeonGold(win) - dungeonGold({ ...win, victory: false }));
    expect(dungeonChestGold({ ...win, victory: false })).toBe(0);
    // The two parts always add up to the pay, whatever the rounding of the multiplier does.
    for (let tier = 1; tier <= DUNGEON_TIERS; tier++) {
      const run = { tier, wavesCleared: 8, kills: ALL, victory: true };
      expect(dungeonGold({ ...run, victory: false }) + dungeonChestGold(run)).toBe(dungeonGold(run));
    }
  });

  it('is worth the one entry a day: a full clear pays about two and a half chapter wins of the same tier', () => {
    for (const tier of [1, 2, 3, 4, 5]) {
      const share = dungeonMaxGold(tier) / runGold(24, tier, 0, true);
      expect(share).toBeGreaterThan(2.4);
      expect(share).toBeLessThan(2.7);
    }
    // A day at tier 3: 1,920, the price of a level-6 upgrade of a common or uncommon cat (2,500) in about 1.3 days.
    expect(dungeonMaxGold(3)).toBe(1920);
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

  it('holds one free entry a day and sells none', () => {
    expect([DUNGEON_FREE_ENTRIES, DUNGEON_EXTRA_ENTRIES, DUNGEON_ENTRY_GEMS]).toEqual([1, 0, 30]);
    const day = { used: 0, bought: 0 };
    expect(dungeonEntriesLeft(day)).toBe(1);
    expect(dungeonEntriesLeft({ ...day, used: 1 })).toBe(0);
    expect(dungeonEntriesLeft({ ...day, used: 9 })).toBe(0);
    expect(dungeonCanBuy(day)).toBe(false);
    expect(dungeonCanBuy({ ...day, used: 1 })).toBe(false);
  });

  it('reads a day saved under the old rules (two free entries and one to buy): what was used stays used, what was paid for is honoured', () => {
    // Used one or two of the old two: nothing is left today, whatever was left of the old allowance.
    for (const used of [1, 2]) expect(dungeonEntriesLeft({ used, bought: 0 })).toBe(0);
    // Bought the third entry and used all three: nothing left. Bought it and used only one: the paid entry still stands.
    expect(dungeonEntriesLeft({ used: 3, bought: 1 })).toBe(0);
    expect(dungeonEntriesLeft({ used: 2, bought: 1 })).toBe(0);
    expect(dungeonEntriesLeft({ used: 1, bought: 1 })).toBe(1);
    expect(dungeonEntriesLeft({ used: 0, bought: 1 })).toBe(2);
    // Nothing more can be bought on top of it.
    expect(dungeonCanBuy({ used: 1, bought: 1 })).toBe(false);
    // The card writes what is left over what the day holds.
    expect(entriesText(dungeonEntriesLeft({ used: 2, bought: 0 }), DUNGEON_FREE_ENTRIES, 0)).toBe('0/1');
    expect(entriesText(dungeonEntriesLeft({ used: 0, bought: 0 }), DUNGEON_FREE_ENTRIES, 0)).toBe('1/1');
    expect(entriesText(dungeonEntriesLeft({ used: 1, bought: 1 }), DUNGEON_FREE_ENTRIES, 1)).toBe('1/2');
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
    const lost = computeRunPayout(stats({ chapter: 3, victory: false, wavesCleared: 5 }), ctx);
    expect(lost.bundle).toEqual({});
  });

  it('pays the chest inside the gold of a win, tells how much of it that is, and pays it on every win (there is one run a day)', () => {
    const win = computeRunPayout(stats({ chapter: 3 }), ctx);
    expect(win.gold).toBe(1920);
    expect(win.dungeonBonus).toBe(730);
    expect(win.gold - (win.dungeonBonus ?? 0)).toBe(dungeonGold({ tier: 3, wavesCleared: 8, kills: ALL, victory: false }));
    // No guard of the day on it any more: the same win pays the same again.
    expect(computeRunPayout(stats({ chapter: 3 }), ctx)).toEqual(win);
    const lost = computeRunPayout(stats({ chapter: 3, victory: false }), ctx);
    expect(lost.dungeonBonus).toBe(0);
    expect(lost.gold).toBe(win.gold - 730);
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
    expect(open.profile.dungeonView().entriesLeft).toBe(1);
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
    // No snack in the dungeon (asked first: the day's one entry is still there).
    const snack = await rig.profile.prepareRun({ mode: 'gold', chapter: 1, snack: { id: 'fish', via: 'gems' } });
    expect(snack).toEqual({ ok: false, error: 'locked' });
    const prep = await rig.profile.prepareRun({ mode: 'gold', chapter: 3, stake: 4 });
    expect(prep.ok).toBe(true);
    if (!prep.ok) return;
    expect(prep.value).toMatchObject({ mode: 'gold', chapter: 3, stake: 0 });
    expect(prep.value.loadout.unitLevels.w_paw).toBe(7);
    expect(prep.value.modifiers).toBeUndefined();
    expect(rig.analytics.find((a) => a.event === 'run_start')?.params).toMatchObject({ mode: 'gold', chapter: 3 });
  });

  it('takes the day\'s one entry when the run starts', async () => {
    const rig = await opened(3);
    const { profile } = rig;
    expect(profile.dungeonView()).toMatchObject({ freeEntries: 1, entriesLeft: 1, used: 0, canBuy: false });
    await play(rig, 2);
    expect(profile.dungeonView().entriesLeft).toBe(0);
    expect(await profile.prepareRun({ mode: 'gold', chapter: 1 })).toEqual({ ok: false, error: 'limit_reached' });
    expect(profile.pendingRun).toBeNull();
    expect(profile.dungeonView().used).toBe(1);
  });

  it('does not give the entry back when the run is thrown away, or when the app is closed in the middle of it', async () => {
    const rig = await opened(3);
    await rig.profile.prepareRun({ mode: 'gold', chapter: 1 });
    expect(rig.profile.dungeonView().entriesLeft).toBe(0);
    await rig.profile.discardPendingRun();
    expect(rig.profile.dungeonView().entriesLeft).toBe(0);
    expect(await rig.profile.prepareRun({ mode: 'gold', chapter: 1 })).toEqual({ ok: false, error: 'limit_reached' });

    const again = await opened(3, { start: at(2026, 10, 7, 9) });
    await again.profile.prepareRun({ mode: 'gold', chapter: 1 });
    const restarted = await createTestProfile({ keepStorage: true, start: at(2026, 10, 7, 9, 30) });
    expect(restarted.profile.pendingRun?.init.mode).toBe('gold');
    expect(restarted.profile.dungeonView()).toMatchObject({ used: 1, entriesLeft: 0 });
    // The pending run blocks a second start; it is the same entry, not a new one.
    expect(await restarted.profile.prepareRun({ mode: 'gold', chapter: 1 })).toEqual({ ok: false, error: 'run_active' });
    expect(restarted.profile.dungeonView().used).toBe(1);
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
    const r = await play(rig, 3, { kills: 120 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const base = dungeonGold({ tier: 3, wavesCleared: 8, kills: 120, victory: true });
    expect(base).toBe(Math.round((220 + 480 + 456) * 1.6));
    expect(r.value).toMatchObject({ mode: 'gold', chapter: 3, victory: true, wavesCleared: 8, gold: base, bonus: 730, kills: 120, xp: 26, newBest: true });
    expect(r.value.bundle).toEqual({});
    expect(rig.profile.data.gold).toBe(goldBefore + base);
    expect(events).toEqual([{ delta: base, reason: 'dungeon' }]);
    expect(rig.analytics.find((a) => a.event === 'run_end')?.params).toMatchObject({ mode: 'gold', chapter: 3, result: 'victory', waves: 8 });
    expect(rig.profile.data.lastRun?.id).toBe(r.value.id);
    expect(rig.ads.runs).toEqual(['begin', 'victory']);
  });

  it('pays a lost run by what it got through, with no chest', async () => {
    const rig = await opened(1);
    const r = await play(rig, 1, { victory: false, wavesCleared: 5, kills: 80, bossesKilled: 0 });
    expect(r.ok && r.value.gold).toBe(115 + 320);
    expect(r.ok && r.value.bonus).toBe(0);
  });

  it('pays the same win on any day: the chest is part of the run\'s pay, there is nothing to claim once a day', async () => {
    const rig = await opened(2);
    const a = await play(rig, 2);
    expect(rig.profile.dungeonView().entriesLeft).toBe(0);
    tomorrow(rig);
    expect(rig.profile.dungeonView()).toMatchObject({ used: 0, entriesLeft: 1 });
    const b = await play(rig, 2);
    expect(a.ok && a.value.bonus).toBe(593);
    expect(b.ok && b.value.bonus).toBe(593);
    expect(a.ok && b.ok && a.value.gold).toBe(b.ok ? b.value.gold : -1);
    expect(a.ok && a.value.gold).toBe(1560);
  });

  it('keeps the best run of each tier by its pay, the chest included', async () => {
    const rig = await opened(3, { start: at(2026, 10, 6, 9) });
    const first = await play(rig, 2, { kills: 100 });
    expect(first.ok && first.value.newBest).toBe(true);
    const base = dungeonGold({ tier: 2, wavesCleared: 8, kills: 100, victory: true });
    expect(rig.profile.dungeonView().tiers[1]?.best).toEqual({ waves: 8, kills: 100, gold: base });
    // A weaker run on the next day: the best stays, and no "new best" is announced.
    tomorrow(rig);
    const weaker = await play(rig, 2, { victory: false, wavesCleared: 6, kills: 60, bossesKilled: 0 });
    expect(weaker.ok && weaker.value.newBest).toBe(false);
    expect(rig.profile.dungeonView().tiers[1]?.best.gold).toBe(base);
    tomorrow(rig);
    const better = await play(rig, 2, { kills: 130 });
    expect(better.ok && better.value.newBest).toBe(true);
    expect(rig.profile.dungeonView().tiers[1]?.best).toMatchObject({ kills: 130 });
    // Another tier keeps its own record.
    expect(rig.profile.dungeonView().tiers[2]?.best).toEqual({ waves: 0, kills: 0, gold: 0 });
  });

  it('beats a record made under the old rules with any win: a record was at most 574 at tier 1 (no chest, 399 kills), a win is 1,000 and more', async () => {
    const rig = await opened(1);
    rig.profile.data.dungeon.best[0] = { waves: 8, kills: 380, gold: 560 };
    expect(rig.profile.dungeonView().tiers[0]?.best).toEqual({ waves: 8, kills: 380, gold: 560 });
    const r = await play(rig, 1, { kills: 90 });
    expect(r.ok && r.value.newBest).toBe(true);
    expect(rig.profile.dungeonView().tiers[0]?.best).toEqual({ waves: 8, kills: 90, gold: 220 + 360 + 456 });
    // A lost run does not take the old record away.
    const rig2 = await opened(1);
    rig2.profile.data.dungeon.best[0] = { waves: 8, kills: 380, gold: 560 };
    const lost = await play(rig2, 1, { victory: false, wavesCleared: 7, kills: 50, bossesKilled: 0 });
    expect(lost.ok && lost.value.newBest).toBe(false);
    expect(rig2.profile.dungeonView().tiers[0]?.best.gold).toBe(560);
  });

  it('counts for the daily missions that count runs, merges, toys and wins, but never for bosses and elites (the chest is not a boss for them)', async () => {
    const rig = await opened(3);
    const before = rig.profile.data.stats.runs;
    await play(rig, 1, { merges: 12, relics: ['yarn_ball', 'mouse_toy'], bossesKilled: 1 });
    const d = rig.profile.data;
    expect(d.stats).toMatchObject({ runs: before + 1 });
    // d_runs, d_merges, d_bosses, d_relics, d_wins
    expect(d.day.missions.progress).toEqual([1, 12, 0, 2, 1]);
    // Neither the missions nor the lifetime count take the chest for a boss.
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

  it('pays a run resumed from the older, longer script by the new script\'s own limits (380 kills pay like 131)', async () => {
    const rig = await opened(1);
    const r = await play(rig, 1, { kills: 380 });
    expect(r.ok && r.value.gold).toBe(1200);
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
    expect(restarted.profile.dungeonView()).toMatchObject({ used: 1, entriesLeft: 0 });
    expect((await restarted.profile.settlePendingRun()).ok).toBe(false);
    expect(restarted.profile.data.gold).toBe(gold);
  });

  it('pays a run the app died in once, by the last wave it saved, and then never again (a save of the old script settles the same way)', async () => {
    const rig = await opened(1, { start: at(2026, 10, 6, 9) });
    await rig.profile.prepareRun({ mode: 'gold', chapter: 1 });
    await rig.profile.saveSnapshot({ simVersion: 99, wave: 5, data: '{}' });
    const restarted = await createTestProfile({ keepStorage: true, start: at(2026, 10, 6, 10) });
    expect(restarted.profile.pendingRun?.snapshot?.wave).toBe(5);
    const settled = await restarted.profile.settlePendingRun();
    // Four waves cleared, no kills known, no chest: 17 + 20 + 23 + 26.
    expect(settled.ok && settled.value.gold).toBe(86);
    expect(restarted.profile.data.gold).toBe(86);
    expect((await restarted.profile.settlePendingRun()).ok).toBe(false);
    const again = await createTestProfile({ keepStorage: true, start: at(2026, 10, 6, 11) });
    expect(again.profile.data.gold).toBe(86);
    expect(again.profile.dungeonView().used).toBe(1);
  });
});

describe('the extra entry', () => {
  it('is not sold: a purchase by gems or by ad is refused before anything is charged or shown', async () => {
    const rig = await opened(3);
    await play(rig, 1);
    expect(rig.profile.dungeonView()).toMatchObject({ entriesLeft: 0, canBuy: false, bought: 0 });
    rig.profile.data.gems = 100;
    expect(await rig.profile.buyDungeonEntry('gems')).toEqual({ ok: false, error: 'limit_reached' });
    expect(await rig.profile.buyDungeonEntry('ad')).toEqual({ ok: false, error: 'limit_reached' });
    expect(rig.profile.data.gems).toBe(100);
    expect(rig.ads.shown).toEqual([]);
    expect(rig.profile.dungeonView()).toMatchObject({ bought: 0, entriesLeft: 0 });
    expect(await rig.profile.prepareRun({ mode: 'gold', chapter: 1 })).toEqual({ ok: false, error: 'limit_reached' });
  });

  it('is locked with the dungeon', async () => {
    const locked = await createTestProfile();
    locked.profile.data.gems = 100;
    expect(await locked.profile.buyDungeonEntry('gems')).toEqual({ ok: false, error: 'locked' });
    expect(locked.profile.data.gems).toBe(100);
  });

  it('honours an entry bought under the old rules, once, and not the day after', async () => {
    const rig = await opened(3);
    rig.profile.data.day.dungeon = { used: 1, bought: 1 };
    expect(rig.profile.dungeonView()).toMatchObject({ used: 1, bought: 1, entriesLeft: 1, canBuy: false });
    const run = await play(rig, 2);
    expect(run.ok).toBe(true);
    expect(rig.profile.dungeonView()).toMatchObject({ used: 2, entriesLeft: 0 });
    tomorrow(rig);
    expect(rig.profile.dungeonView()).toMatchObject({ used: 0, bought: 0, entriesLeft: 1, canBuy: false });
  });
});

describe('the day', () => {
  it('starts over with the daily reset: one entry', async () => {
    const rig = await opened(1);
    await play(rig, 1);
    expect(rig.profile.dungeonView()).toMatchObject({ entriesLeft: 0 });
    rig.clock.advance(HOUR * 6);
    rig.profile.refresh();
    expect(rig.profile.dungeonView().entriesLeft).toBe(0);
    rig.clock.advance(HOUR * 18);
    rig.profile.refresh();
    expect(rig.profile.dungeonView()).toMatchObject({ entriesLeft: 1, used: 0 });
  });

  it('does not come back when the clock is set back: the reset only goes forward', async () => {
    const rig = await opened(1, { start: at(2026, 10, 6, 9) });
    await play(rig, 1);
    tomorrow(rig);
    expect(rig.profile.dungeonView().entriesLeft).toBe(1);
    await play(rig, 1);
    // The device clock is turned back to yesterday: today's entry is still today's.
    rig.clock.setWall(at(2026, 10, 6, 12));
    rig.profile.resume();
    expect(rig.profile.dungeonView()).toMatchObject({ used: 1, entriesLeft: 0 });
  });

  it('takes a run that ends after midnight into the new day', async () => {
    const rig = await opened(1, { start: at(2026, 10, 6, 23, 55) });
    await rig.profile.prepareRun({ mode: 'gold', chapter: 1 });
    rig.clock.advance(10 * 60_000);
    const r = await rig.profile.finishRun(stats());
    expect(r.ok && r.value.gold).toBe(1200);
    expect(rig.profile.dungeonView()).toMatchObject({ used: 0 });
  });
});

describe('the save', () => {
  it('has the dungeon with its defaults, and a save from before it loads without losing the rest', () => {
    const fresh = defaultProfile(1, 2);
    expect(fresh.dungeon.best).toHaveLength(DUNGEON_TIERS);
    expect(fresh.day.dungeon).toEqual({ used: 0, bought: 0 });
    const old = JSON.parse(JSON.stringify(fresh)) as Record<string, unknown>;
    delete old.dungeon;
    delete (old.day as Record<string, unknown>).dungeon;
    (old as { gold: number }).gold = 777;
    const loaded = sanitizeProfile(old, 1, 2) as ProfileData;
    expect(loaded.gold).toBe(777);
    expect(loaded.dungeon.best).toHaveLength(DUNGEON_TIERS);
    expect(loaded.day.dungeon).toEqual({ used: 0, bought: 0 });
  });

  it('loads a day and records saved under the old rules (the first-clear flag, 2+1 entries, a 399-kill record) and plays on with them', () => {
    const fresh = defaultProfile(1, 2);
    const old = JSON.parse(JSON.stringify(fresh)) as ProfileData & { day: { dungeon: Record<string, unknown> } };
    old.day.dungeon = { used: 2, bought: 1, firstClear: true };
    old.dungeon.best[0] = { waves: 8, kills: 399, gold: 574 };
    const loaded = sanitizeProfile(old, 1, 2) as ProfileData;
    expect(loaded.day.dungeon).toMatchObject({ used: 2, bought: 1 });
    expect(dungeonEntriesLeft(loaded.day.dungeon)).toBe(0);
    expect(dungeonCanBuy(loaded.day.dungeon)).toBe(false);
    expect(loaded.dungeon.best[0]).toEqual({ waves: 8, kills: 399, gold: 574 });
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

  it('survives a backup code: the records and the day\'s entry come along', async () => {
    const rig = await opened(2);
    await play(rig, 2);
    const code = await rig.profile.exportCode();
    const other = await createTestProfile({ start: at(2026, 10, 6, 9, 5) });
    expect((await other.profile.importCode(code)).ok).toBe(true);
    expect(other.profile.dungeonView().tiers[1]?.best.gold).toBeGreaterThan(0);
    expect(other.profile.dungeonView()).toMatchObject({ used: 1, entriesLeft: 0 });
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
