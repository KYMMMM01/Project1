import { describe, expect, it } from 'vitest';
import { claimableAchievements } from '@/meta/achievements';
import { ACHIEVEMENTS } from '@/meta/data/achievements';
import { createTestProfile } from '@/meta/testing';
import { achievementRows, missionBadges } from '@/screens/missions/model';

describe('achievement rows', () => {
  it('lists one row per group, in progress, with no step taken on a fresh profile', async () => {
    const { profile } = await createTestProfile();
    const rows = achievementRows(profile.data);
    expect(rows).toHaveLength(new Set(ACHIEVEMENTS.map((a) => a.group)).size);
    expect(rows.every((r) => r.state === 'progress' && r.steps.every((s) => s === 'open'))).toBe(true);
    expect(rows.map((r) => r.def.step)).toEqual(rows.map(() => 1));
  });

  it('puts claimable rows first and finished rows last, and shows the next step once one is claimed', async () => {
    const { profile } = await createTestProfile();
    const d = profile.data;
    d.cleared = d.cleared.map(() => 1);
    d.achv.claimed = ['unit_max'];
    expect(achievementRows(d)[0]?.def.group).toBe('chapter');
    expect(achievementRows(d)[0]).toMatchObject({ state: 'claimable', steps: ['ready', 'ready', 'ready'] });
    expect(achievementRows(d)[0]?.def.key).toBe('chapter_1');

    d.achv.claimed = ['chapter_1', 'unit_max'];
    const row = achievementRows(d).find((r) => r.def.group === 'chapter');
    expect(row).toMatchObject({ state: 'claimable', steps: ['claimed', 'ready', 'ready'] });
    expect(row?.def.key).toBe('chapter_3');

    const last = achievementRows(d).at(-1);
    expect(last).toMatchObject({ state: 'done', current: 1 });
    expect(last?.def.key).toBe('unit_max');
  });

  it('counts every claimable step in the badge, as the claim-all bar does', async () => {
    const { profile } = await createTestProfile();
    profile.data.cleared = profile.data.cleared.map(() => 1);
    profile.data.stats.runs = 5;
    profile.refresh();
    expect(claimableAchievements(profile.data).length).toBeGreaterThanOrEqual(3);
    expect(missionBadges(profile).achievement).toBe(claimableAchievements(profile.data).length);
  });
});
