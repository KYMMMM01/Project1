import { describe, expect, it } from 'vitest';
import { RELIC_IDS, type RunStats } from '@/game/api';
import { getStorageBackend } from '@/core/save';
import { MAX_STAKE } from '@/game/data/roster';
import { claimableAchievements, currentStep, achievementProgress, achievementText, reachedAchievements } from '@/meta/achievements';
import { ACHIEVEMENTS, type AchievementKey } from '@/meta/data/achievements';
import { MAX_LEVEL, TRAINING_MAX } from '@/meta/data/economy';
import { MIGRATIONS, PROFILE_VERSION, SAVE_KEY, defaultProfile, migrateProfile, normalizeProfile, sanitizeProfile } from '@/meta/profileData';
import { createTestProfile, type TestRig } from '@/meta/testing';
import { BASE_UNITS, type ProfileData } from '@/meta/types';
import '@/meta/strings';
import { missionBadges } from '@/screens/missions/model';

function stats(over: Partial<RunStats> = {}): RunStats {
  return {
    mode: 'chapter', chapter: 1, stake: 0, seed: 4321, victory: true, wavesCleared: 24, totalWaves: 24, kills: 300,
    bossesKilled: 5, summons: 40, merges: 25, molts: 0, awakenings: 0, relics: ['yarn_ball', 'mouse_toy'],
    bestRarity: 'epic', peakEnemies: 20, duration: 400, revived: false, summonLuck: 0.5, damageByUnit: {}, ...over,
  };
}

async function play(rig: TestRig, over: Partial<RunStats> = {}) {
  const mode = over.mode ?? 'chapter';
  expect((await rig.profile.prepareRun({ mode, chapter: over.chapter ?? 1, stake: over.stake ?? 0 })).ok).toBe(true);
  return rig.profile.finishRun(stats(over));
}

/** What a hand-built profile needs so that each key is reached (and nothing else of its group's later steps). */
const REACH: Record<AchievementKey, (d: ProfileData) => void> = {
  chapter_1: (d) => { d.cleared[0] = 1; },
  chapter_3: (d) => { d.cleared = [1, 1, 1, 0, 0]; },
  chapter_5: (d) => { d.cleared = [1, 1, 1, 1, 1]; },
  butler_3: (d) => { d.cleared[2] = 4; },
  butler_5: (d) => { d.cleared[4] = MAX_STAKE + 1; },
  butler_all: (d) => { d.cleared = d.cleared.map(() => MAX_STAKE + 1); },
  wins_10: (d) => { d.achv.wins = 10; },
  wins_50: (d) => { d.achv.wins = 50; },
  wins_150: (d) => { d.achv.wins = 150; },
  merges_500: (d) => { d.stats.merges = 500; },
  merges_3000: (d) => { d.stats.merges = 3000; },
  merges_10000: (d) => { d.stats.merges = 10000; },
  endless_30: (d) => { d.endless.best = 30; },
  endless_50: (d) => { d.endless.best = 50; },
  endless_80: (d) => { d.endless.best = 80; },
  daily_1: (d) => { d.achv.daily = 1; },
  daily_10: (d) => { d.achv.daily = 10; },
  daily_30: (d) => { d.achv.daily = 30; },
  dungeon_1: (d) => { d.dungeon.best[1] = { waves: 8, kills: 1, gold: 1 }; },
  dungeon_5: (d) => { d.dungeon.best = d.dungeon.best.map(() => ({ waves: 8, kills: 1, gold: 1 })); },
  units_4: (d) => { for (const u of BASE_UNITS.slice(0, 4)) d.levels[u] = 5; },
  units_16: (d) => { for (const u of BASE_UNITS) d.levels[u] = 5; },
  unit_max: (d) => { d.levels.w_paw = MAX_LEVEL; },
  training_10: (d) => { d.training.damage = TRAINING_MAX; },
  relics_20: (d) => { d.achv.relics = RELIC_IDS.slice(0, 20); },
  relics_25: (d) => { d.achv.relics = RELIC_IDS.slice(0, 25); },
  mythic_1: (d) => { d.achv.mythic = true; },
  awaken_50: (d) => { d.achv.awaken = 50; },
  calendar_28: (d) => { d.calendar.cycles = 1; },
  account_20: (d) => { d.accountXp = 9120; },
};

const blank = (): ProfileData => defaultProfile(0, 1);

describe('the achievement table', () => {
  it('has 30 unique keys in 15 groups, steps numbered 1.. in order, and the drafted totals', () => {
    const keys = ACHIEVEMENTS.map((a) => a.key);
    expect(new Set(keys).size).toBe(30);
    const groups = [...new Set(ACHIEVEMENTS.map((a) => a.group))];
    expect(groups).toHaveLength(15);
    for (const g of groups) {
      const steps = ACHIEVEMENTS.filter((a) => a.group === g);
      expect(steps.map((a) => a.step)).toEqual(steps.map((_, i) => i + 1));
      expect(steps.map((a) => a.target)).toEqual([...steps.map((a) => a.target)].sort((a, b) => a - b));
    }
    expect(ACHIEVEMENTS.reduce((n, a) => n + a.gems, 0)).toBe(1115);
    expect(ACHIEVEMENTS.reduce((n, a) => n + a.points, 0)).toBe(825);
  });

  it('has text for every key (the current language), the same {n} in Korean and English, filled from the target', async () => {
    const { t } = await import('@/core/i18n');
    for (const a of ACHIEVEMENTS) {
      expect(a.desc.ko.includes('{n}'), a.key).toBe(a.desc.en.includes('{n}'));
      expect(t('meta.ach.' + a.key + '.name'), a.key).toBe(a.name.ko);
      expect(achievementText(a).desc.includes('{n}'), a.key).toBe(false);
    }
    expect(achievementText(ACHIEVEMENTS.find((a) => a.key === 'merges_10000')!).desc).toBe('고양이를 10,000번 합쳤어요.');
  });
});

describe('progress from the profile', () => {
  it('reaches nothing on a new profile and every key from its hand-built profile', () => {
    expect(reachedAchievements(blank())).toEqual([]);
    for (const a of ACHIEVEMENTS) {
      const d = blank();
      REACH[a.key](d);
      const p = achievementProgress(d, a);
      expect(p.reached, a.key).toBe(true);
      expect(p.current, a.key).toBe(a.target);
      expect(reachedAchievements(d), a.key).toContain(a.key);
    }
  });

  it('holds current below target before reaching it, and caps it at the target after', () => {
    const d = blank();
    d.stats.merges = 1820;
    const def = ACHIEVEMENTS.find((a) => a.key === 'merges_3000')!;
    expect(achievementProgress(d, def)).toEqual({ current: 1820, target: 3000, reached: false });
    d.stats.merges = 99_999;
    expect(achievementProgress(d, def)).toEqual({ current: 3000, target: 3000, reached: true });
  });

  it('needs all five chapters at the top butler level for butler_all', () => {
    const all = ACHIEVEMENTS.find((a) => a.key === 'butler_all')!;
    const d = blank();
    d.cleared = [6, 6, 6, 6, 5];
    expect(achievementProgress(d, all)).toMatchObject({ current: 4, reached: false });
    expect(reachedAchievements(d)).toContain('butler_5');
    expect(reachedAchievements(d)).not.toContain('butler_all');
    d.cleared = [6, 6, 6, 6, 6];
    expect(reachedAchievements(d)).toContain('butler_all');
    d.cleared = [6, 6, 6];
    expect(reachedAchievements(d)).not.toContain('butler_all');
  });

  it('counts the butler level as the highest cleared stake: stake 0 alone is not level 3', () => {
    const d = blank();
    d.cleared[0] = 3;
    expect(reachedAchievements(d)).not.toContain('butler_3');
    d.cleared[0] = 4;
    expect(reachedAchievements(d)).toContain('butler_3');
    expect(reachedAchievements(d)).not.toContain('butler_5');
  });

  it('lists claimable keys (reached, not claimed) and shows each group at its first unclaimed step', () => {
    const d = blank();
    REACH.wins_50(d);
    expect(claimableAchievements(d)).toEqual(['wins_10', 'wins_50']);
    expect(currentStep(d, 'wins').key).toBe('wins_10');
    d.achv.claimed = ['wins_10'];
    expect(claimableAchievements(d)).toEqual(['wins_50']);
    expect(currentStep(d, 'wins').key).toBe('wins_50');
    d.achv.claimed = ['wins_10', 'wins_50', 'wins_150'];
    expect(currentStep(d, 'wins').key).toBe('wins_150');
    expect(currentStep(blank(), 'unit_max').key).toBe('unit_max');
  });
});

describe('what a finished run adds to the counters', () => {
  it('does not count the tutorial at all', async () => {
    const rig = await createTestProfile();
    await play(rig, { mode: 'tutorial', awakenings: 9, bestRarity: 'mythic', relics: ['yarn_ball'] });
    expect(rig.profile.data.achv).toEqual({ claimed: [], wins: 0, daily: 0, awaken: 0, mythic: false, relics: [] });
    expect(rig.profile.data.stats.wins).toBe(1);
  });

  it('counts a won chapter run, adds awakenings, notes a Guardian cat and unions the toys', async () => {
    const rig = await createTestProfile();
    await play(rig, { awakenings: 2, bestRarity: 'mythic', relics: ['yarn_ball', 'mouse_toy'] });
    await play(rig, { victory: false, wavesCleared: 5, awakenings: 1, bestRarity: 'epic', relics: ['mouse_toy', 'scratcher'] });
    expect(rig.profile.data.achv).toEqual({ claimed: [], wins: 1, daily: 0, awaken: 3, mythic: true, relics: ['yarn_ball', 'mouse_toy', 'scratcher'] });
  });

  it('counts the daily challenge once a day: only the first clear is a daily day and a win', async () => {
    const rig = await createTestProfile();
    await play(rig);
    const wins0 = rig.profile.data.achv.wins;
    await play(rig, { mode: 'daily', victory: false, wavesCleared: 7 });
    expect(rig.profile.data.achv).toMatchObject({ wins: wins0, daily: 0 });
    await play(rig, { mode: 'daily' });
    expect(rig.profile.data.achv).toMatchObject({ wins: wins0 + 1, daily: 1 });
    await play(rig, { mode: 'daily' });
    await play(rig, { mode: 'daily' });
    expect(rig.profile.data.achv).toMatchObject({ wins: wins0 + 1, daily: 1 });
    expect(rig.profile.data.stats.wins).toBe(wins0 + 3 + 0);
    rig.clock.advance(86_400_000);
    await play(rig, { mode: 'daily' });
    expect(rig.profile.data.achv).toMatchObject({ wins: wins0 + 2, daily: 2 });
  });
});

describe('claiming', () => {
  async function ready(): Promise<TestRig> {
    const rig = await createTestProfile();
    await play(rig);
    return rig;
  }

  it('pays the gems once, records the claim, saves once and tells analytics', async () => {
    const rig = await ready();
    const { profile } = rig;
    REACH.wins_10(profile.data);
    const gems = profile.data.gems;
    let changes = 0;
    profile.events.on('change', () => changes++);
    const first = profile.claimAchievement('wins_10');
    expect(first).toEqual({ ok: true, value: { gems: 15 } });
    expect(profile.data.gems).toBe(gems + 15);
    expect(profile.data.achv.claimed).toEqual(['wins_10']);
    expect(changes).toBe(1);
    expect(rig.analytics.filter((e) => e.event === 'achievement_claim')).toEqual([{ event: 'achievement_claim', params: { scope: 'achievement', id: 'wins_10' } }]);
    expect(rig.analytics.some((e) => e.event === 'currency' && e.params.reason === 'achievement' && e.params.delta === 15)).toBe(true);
    expect(profile.claimAchievement('wins_10')).toEqual({ ok: false, error: 'already_claimed' });
    expect(profile.data.gems).toBe(gems + 15);
    expect(changes).toBe(1);
  });

  it('refuses what is not reached, what is unknown, and everything while the missions tab is locked', async () => {
    const rig = await ready();
    const { profile } = rig;
    expect(profile.claimAchievement('wins_50')).toEqual({ ok: false, error: 'not_ready' });
    expect(profile.claimAchievement('nope')).toEqual({ ok: false, error: 'invalid' });
    expect(profile.data.achv.claimed).toEqual([]);
    const fresh = await createTestProfile();
    REACH.wins_10(fresh.profile.data);
    expect(fresh.profile.claimAchievement('wins_10')).toEqual({ ok: false, error: 'locked' });
    expect(fresh.profile.claimAllAchievements()).toEqual({ ok: false, error: 'locked' });
  });

  it('claims all reached, unclaimed ones in one save, and then has nothing left to claim', async () => {
    const rig = await ready();
    const { profile } = rig;
    REACH.wins_50(profile.data);
    REACH.unit_max(profile.data);
    profile.data.achv.claimed = ['wins_10'];
    const gems = profile.data.gems;
    let changes = 0;
    profile.events.on('change', () => changes++);
    const r = profile.claimAllAchievements();
    expect(r).toEqual({ ok: true, value: { count: 3, reward: { gems: 40 + 60 + 10 } } });
    expect(profile.data.gems).toBe(gems + 110);
    expect(changes).toBe(1);
    expect(claimableAchievements(profile.data)).toEqual([]);
    expect(profile.claimAllAchievements()).toEqual({ ok: false, error: 'nothing_to_claim' });
  });

  it('puts the claimable count into the missions badges and the total', async () => {
    const rig = await ready();
    const { profile } = rig;
    const before = missionBadges(profile);
    REACH.wins_50(profile.data);
    expect(missionBadges(profile)).toMatchObject({ achievement: before.achievement + 2, total: before.total + 2 });
    profile.claimAllAchievements();
    expect(missionBadges(profile).achievement).toBe(0);
  });
});

describe('saving and versions', () => {
  it('migrates a version 1 save: fills achv and backfills the wins from the lifetime wins', async () => {
    expect(PROFILE_VERSION).toBe(2);
    const migrated = migrateProfile({ gold: 5, stats: { wins: 7 } }, 1, MIGRATIONS) as { achv: ProfileData['achv']; gold: number };
    expect(migrated.gold).toBe(5);
    expect(migrated.achv).toEqual({ claimed: [], wins: 7, daily: 0, awaken: 0, mythic: false, relics: [] });
    expect((migrateProfile({}, 1, MIGRATIONS) as { achv: ProfileData['achv'] }).achv.wins).toBe(0);

    const rig = await createTestProfile();
    const old = JSON.parse(JSON.stringify(rig.profile.data)) as Record<string, unknown>;
    delete old.achv;
    (old.stats as { wins: number }).wins = 12;
    await getStorageBackend().set(SAVE_KEY, JSON.stringify({ v: 1, t: 0, data: old }));
    const reloaded = await createTestProfile({ keepStorage: true });
    expect(reloaded.profile.data.achv).toEqual({ claimed: [], wins: 12, daily: 0, awaken: 0, mythic: false, relics: [] });
  });

  it('leaves an existing achv alone when a version 1 save already holds one (an older app re-saved it)', () => {
    const achv = { claimed: ['wins_10'], wins: 40, daily: 2, awaken: 3, mythic: true, relics: ['yarn_ball'] };
    const out = migrateProfile({ achv, stats: { wins: 99 } }, 1, MIGRATIONS) as { achv: unknown };
    expect(out.achv).toEqual(achv);
  });

  it('normalizes: unknown and repeated keys go, counters are clamped, toys must exist', () => {
    const p = blank();
    p.achv = {
      claimed: ['wins_10', 'bogus', 'wins_10', 'chapter_1', 5 as unknown as string],
      wins: -4, daily: 1.9, awaken: Number.NaN, mythic: 'yes' as unknown as boolean,
      relics: ['yarn_ball', 'bogus_toy', 'yarn_ball', 'hourglass'] as ProfileData['achv']['relics'],
    };
    normalizeProfile(p);
    expect(p.achv).toEqual({ claimed: ['chapter_1', 'wins_10'], wins: 0, daily: 1, awaken: 0, mythic: false, relics: ['yarn_ball', 'hourglass'] });
  });

  it('fills a copy without the slice (a cloud copy or a code from before) with the defaults', () => {
    const raw = JSON.parse(JSON.stringify(blank())) as Record<string, unknown>;
    delete raw.achv;
    expect(sanitizeProfile(raw, 0, 1)?.achv).toEqual(blank().achv);
  });

  it('backfills the wins of a copy without the slice from the lifetime wins, and keeps a present slice', () => {
    const raw = JSON.parse(JSON.stringify(blank())) as Record<string, unknown>;
    (raw.stats as { wins: number }).wins = 200;
    delete raw.achv;
    expect(sanitizeProfile(raw, 0, 1)?.achv.wins).toBe(200);
    raw.achv = { ...blank().achv, wins: 7 };
    expect(sanitizeProfile(raw, 0, 1)?.achv.wins).toBe(7);
  });
});
