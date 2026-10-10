import { describe, expect, it } from 'vitest';
import type { RunStats } from '@/game/api';
import { runMissionDelta } from '@/meta/missions';
import { createTestProfile, type TestRig } from '@/meta/testing';

function stats(over: Partial<RunStats> = {}): RunStats {
  return {
    mode: 'chapter', chapter: 1, stake: 0, seed: 4321, victory: true, wavesCleared: 24, totalWaves: 24, kills: 300,
    bossesKilled: 5, summons: 40, merges: 25, molts: 0, awakenings: 0, relics: ['yarn_ball', 'mouse_toy', 'bell_collar', 'scratcher', 'fishing_rod'],
    bestRarity: 'epic', peakEnemies: 20, duration: 400, revived: false, summonLuck: 0.5, damageByUnit: {}, ...over,
  };
}

/** A tutorial-shaped result: eight waves of chapter 1, a win, a few merges, a boss and some toys. */
function tutorialStats(over: Partial<RunStats> = {}): RunStats {
  return stats({ mode: 'tutorial', wavesCleared: 8, totalWaves: 8, bossesKilled: 1, merges: 6, kills: 90, relics: ['yarn_ball', 'mouse_toy'], ...over });
}

async function playTutorial(rig: TestRig, over: Partial<RunStats> = {}) {
  expect((await rig.profile.prepareRun({ mode: 'tutorial' })).ok).toBe(true);
  return rig.profile.finishRun(tutorialStats(over));
}

async function playChapter(rig: TestRig, over: Partial<RunStats> = {}) {
  expect((await rig.profile.prepareRun({ mode: 'chapter' })).ok).toBe(true);
  return rig.profile.finishRun(stats(over));
}

const ZEROS = (n: number): number[] => Array.from({ length: n }, () => 0);

describe('what a settled run adds to the missions', () => {
  it('adds nothing for the tutorial, win or loss', () => {
    expect(runMissionDelta(tutorialStats())).toEqual({});
    expect(runMissionDelta(tutorialStats({ victory: false, wavesCleared: 3 }))).toEqual({});
  });

  it('adds the run, the win, the merges, the bosses and the toys for every other mode', () => {
    expect(runMissionDelta(stats())).toMatchObject({ runs: 1, wins: 1, merges: 25, relics: 5 });
    expect(runMissionDelta(stats({ victory: false }))).toMatchObject({ runs: 1, wins: 0 });
    for (const mode of ['chapter', 'daily', 'endless', 'gold'] as const) expect(runMissionDelta(stats({ mode })).runs).toBe(1);
  });
});

describe('the tutorial run and the missions', () => {
  it('a won tutorial leaves every daily and weekly mission at zero, so "win once" is not done by the guide', async () => {
    const rig = await createTestProfile();
    const { profile } = rig;
    const r = await playTutorial(rig);
    expect(r.ok).toBe(true);
    const d = profile.data;
    expect(d.day.missions.progress).toEqual(ZEROS(d.day.missions.progress.length));
    expect(d.week.missions.progress).toEqual(ZEROS(d.week.missions.progress.length));
    expect(profile.missionsView('daily').every((row) => row.progress === 0 && !row.complete)).toBe(true);
    expect(profile.missionsView('weekly').every((row) => row.progress === 0 && !row.complete)).toBe(true);
  });

  it('a lost or abandoned tutorial adds nothing either', async () => {
    const rig = await createTestProfile();
    const { profile } = rig;
    expect((await playTutorial(rig, { victory: false, wavesCleared: 3, bossesKilled: 0 })).ok).toBe(true);
    expect(profile.data.day.missions.progress.every((n) => n === 0)).toBe(true);
    expect(profile.data.week.missions.progress.every((n) => n === 0)).toBe(true);
  });

  it('still counts as a played run for the unlock rules, and still pays its rewards', async () => {
    const rig = await createTestProfile();
    const { profile } = rig;
    const unlocks: string[] = [];
    profile.events.on('unlock', (e) => unlocks.push(e.feature));
    const r = await playTutorial(rig);
    expect(r.ok).toBe(true);
    const d = profile.data;
    expect(d.stats.runs).toBe(1);
    expect(unlocks).toEqual(expect.arrayContaining(['speed2x', 'cats', 'patrol', 'pass']));
    expect(d.gold).toBeGreaterThan(0);
    expect(d.accountXp).toBeGreaterThan(0);
    expect(d.pass.xp).toBe(d.accountXp);
    expect(d.chests.wooden).toBe(1);
    expect(d.piggy.gems).toBe(0);
    expect(d.cleared).toEqual([0, 0, 0, 0, 0]);
    expect(d.lastRun).toMatchObject({ mode: 'tutorial', victory: true, firstClear: false });
  });

  it('a replay of the tutorial later does not move missions that real runs had moved', async () => {
    const rig = await createTestProfile();
    const { profile } = rig;
    await playChapter(rig);
    const day = profile.data.day.missions.progress.slice();
    const week = profile.data.week.missions.progress.slice();
    expect(day).toEqual([1, 20, 4, 5, 1]);
    await playTutorial(rig);
    expect(profile.data.day.missions.progress).toEqual(day);
    expect(profile.data.week.missions.progress).toEqual(week);
    await playChapter(rig, { victory: false, wavesCleared: 5, bossesKilled: 0 });
    expect(profile.data.day.missions.progress[0]).toBe(2);
  });

  it('a real run after the tutorial counts in full', async () => {
    const rig = await createTestProfile();
    const { profile } = rig;
    await playTutorial(rig);
    await playChapter(rig);
    expect(profile.data.day.missions.progress).toEqual([1, 20, 4, 5, 1]);
    expect(profile.missionsView('daily').find((row) => row.metric === 'wins')).toMatchObject({ progress: 1, complete: true });
  });

  it('a tutorial the app was killed in, paid as a defeat on the next launch, adds nothing either', async () => {
    const rig = await createTestProfile();
    const { profile } = rig;
    expect((await profile.prepareRun({ mode: 'tutorial' })).ok).toBe(true);
    expect((await profile.settlePendingRun()).ok).toBe(true);
    expect(profile.data.day.missions.progress.every((n) => n === 0)).toBe(true);
    expect(profile.data.week.missions.progress.every((n) => n === 0)).toBe(true);
  });
});
