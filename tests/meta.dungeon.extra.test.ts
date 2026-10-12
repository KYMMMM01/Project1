/**
 * The gold dungeon's extra entry, with the rule that sells one switched back on. Since 2026-10-12 the rules sell none (`DUNGEON_EXTRA_ENTRIES` is 0,
 * tests/meta.dungeon.test.ts), but the code that sells an entry, charges for it and takes it when a run starts is kept so one constant brings it
 * back: this file holds the constant at 1 and plays the old purchase through.
 */
import { describe, expect, it, vi } from 'vitest';
import type { RunStats } from '@/game/api';
import { GOLD_DUNGEON_WAVES, goldDungeonSpawns } from '@/game/data/goldDungeon';
import { dungeonOffer, entriesText } from '@/screens/battle/dungeonModel';
import { createTestProfile, type TestRig } from '@/meta/testing';
import type { Reason } from '@/meta/types';

vi.mock('@/meta/data/dungeon', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/meta/data/dungeon')>()), DUNGEON_EXTRA_ENTRIES: 1 }));

const HOUR = 3_600_000;

function stats(over: Partial<RunStats> = {}): RunStats {
  return {
    mode: 'gold', chapter: 1, stake: 0, seed: 99, victory: true, wavesCleared: GOLD_DUNGEON_WAVES, totalWaves: GOLD_DUNGEON_WAVES, kills: goldDungeonSpawns(),
    bossesKilled: 1, summons: 20, merges: 12, molts: 0, awakenings: 0, relics: ['yarn_ball'], bestRarity: 'rare', peakEnemies: 30,
    duration: 140, revived: false, summonLuck: 0.5, damageByUnit: {}, ...over,
  };
}

async function play(rig: TestRig, tier: number) {
  const prep = await rig.profile.prepareRun({ mode: 'gold', chapter: tier });
  expect(prep.ok).toBe(true);
  return rig.profile.finishRun(stats({ chapter: tier }));
}

/** A profile with three chapters cleared that has used the day's free entry. */
async function spent(): Promise<TestRig> {
  const rig = await createTestProfile();
  rig.profile.data.cleared = [1, 1, 1, 0, 0];
  rig.profile.data.stats.runs = 5;
  rig.profile.refresh();
  await play(rig, 1);
  expect(rig.profile.dungeonView().entriesLeft).toBe(0);
  return rig;
}

describe('the extra entry, switched on (one a day, 30 gems or a rewarded ad)', () => {
  it('is offered once the free entry is used, and the card says so', async () => {
    const rig = await spent();
    const v = rig.profile.dungeonView();
    expect(v).toMatchObject({ freeEntries: 1, bought: 0, entriesLeft: 0, canBuy: true, entryGems: 30 });
    expect(dungeonOffer(v)).toBe('buy');
    expect(entriesText(v.entriesLeft, v.freeEntries, v.bought)).toBe('0/1');
  });

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
    const v = rig.profile.dungeonView();
    expect(v).toMatchObject({ bought: 1, entriesLeft: 1, canBuy: false });
    expect(entriesText(v.entriesLeft, v.freeEntries, v.bought)).toBe('1/2');
    expect(dungeonOffer(v)).toBe('enter');
    const run = await play(rig, 2);
    expect(run.ok).toBe(true);
    expect(rig.profile.dungeonView()).toMatchObject({ used: 2, entriesLeft: 0 });
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
    expect(rig.profile.dungeonView()).toMatchObject({ used: 0, bought: 0, entriesLeft: 1, canBuy: true });
  });
});
