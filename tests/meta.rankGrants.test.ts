import { describe, expect, it } from 'vitest';
import { RANK_CLAIMED_KEPT } from '@/meta/profileData';
import { createTestProfile } from '@/meta/testing';

const w1 = { week: 'week-2026-11-16', rank: 1, items: ['frame_rank_1', 'plate_rank_1'] };
const w2 = { week: 'week-2026-11-23', rank: 5, items: ['frame_rank_10', 'plate_rank_10'] };

/** A profile and a counter of the saves (each save fires the change event once). */
async function rig() {
  const r = await createTestProfile();
  let saves = 0;
  r.profile.subscribe(() => saves++);
  return { ...r, saves: () => saves };
}

describe('claimRankGrants', () => {
  it('pays new weeks, records their keys and saves once for all of them', async () => {
    const { profile, saves } = await rig();
    const paid = profile.claimRankGrants('u1', [w1, w2]);
    expect(paid.map((p) => [p.week, p.rank, p.bundle])).toEqual([
      [w1.week, 1, { cosmetics: w1.items }],
      [w2.week, 5, { cosmetics: w2.items }],
    ]);
    expect(profile.data.cosmetics.owned).toEqual(expect.arrayContaining([...w1.items, ...w2.items]));
    expect(profile.data.rankClaimed).toEqual(['u1:' + w1.week, 'u1:' + w2.week]);
    expect(saves()).toBe(1);
  });

  it('pays the same week again nothing and saves nothing', async () => {
    const { profile, saves } = await rig();
    profile.claimRankGrants('u1', [w1]);
    const before = saves();
    const owned = profile.data.cosmetics.owned.length;
    expect(profile.claimRankGrants('u1', [w1])).toEqual([]);
    expect(saves()).toBe(before);
    expect(profile.data.cosmetics.owned).toHaveLength(owned);
  });

  it('is not blocked by another account key', async () => {
    const { profile } = await rig();
    profile.claimRankGrants('u1', [w1]);
    expect(profile.claimRankGrants('u2', [w1])).toHaveLength(1);
    expect(profile.data.rankClaimed).toEqual(['u1:' + w1.week, 'u2:' + w1.week]);
  });

  it('leaves a week holding an item this build does not know for an updated build to pay whole', async () => {
    const { profile, saves } = await rig();
    expect(profile.claimRankGrants('u1', [{ week: w1.week, rank: 1, items: ['frame_rank_1', 'icon_from_the_future'] }])).toEqual([]);
    expect(profile.data.cosmetics.owned).not.toContain('frame_rank_1');
    expect(profile.data.rankClaimed).toEqual([]);
    expect(saves()).toBe(0);
    // The same week once the build knows every item: paid in full.
    expect(profile.claimRankGrants('u1', [{ week: w1.week, rank: 1, items: ['frame_rank_1', 'plate_rank_1'] }])[0]!.bundle).toEqual({ cosmetics: ['frame_rank_1', 'plate_rank_1'] });
    expect(profile.data.rankClaimed).toEqual(['u1:' + w1.week]);
  });

  it('turns an item that is already owned into gems', async () => {
    const { profile } = await rig();
    profile.data.cosmetics.owned.push('plate_rank_1');
    const gems = profile.data.gems;
    const paid = profile.claimRankGrants('u1', [w1]);
    expect(paid[0]!.bundle).toEqual({ gems: 100, cosmetics: ['frame_rank_1'] });
    expect(profile.data.gems).toBe(gems + 100);
    expect(profile.data.cosmetics.owned.filter((id) => id === 'plate_rank_1')).toHaveLength(1);
  });

  it('keeps the newest 52 keys', async () => {
    const { profile } = await rig();
    const weeks = Array.from({ length: RANK_CLAIMED_KEPT + 3 }, (_, i) => ({
      week: 'week-' + new Date(Date.UTC(2025, 0, 6 + i * 7)).toISOString().slice(0, 10),
      rank: 100,
      items: ['frame_rank_100'],
    }));
    profile.claimRankGrants('u1', weeks);
    expect(profile.data.rankClaimed).toHaveLength(RANK_CLAIMED_KEPT);
    expect(profile.data.rankClaimed.at(-1)).toBe('u1:' + weeks.at(-1)!.week);
    expect(profile.data.rankClaimed[0]).toBe('u1:' + weeks[3]!.week);
  });
});
