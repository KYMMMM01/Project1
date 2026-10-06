import { describe, expect, it } from 'vitest';
import type { RunStats } from '@/game/api';
import { WEEKLY_MISSIONS } from '@/meta/data/schedule';
import { at, createTestProfile } from '@/meta/testing';

const DAY = 86_400_000;

function stats(over: Partial<RunStats> = {}): RunStats {
  return {
    mode: 'chapter', chapter: 1, stake: 0, seed: 4321, victory: true, wavesCleared: 24, totalWaves: 24, kills: 300,
    bossesKilled: 5, summons: 40, merges: 25, molts: 0, awakenings: 0, relics: ['yarn_ball'],
    bestRarity: 'epic', peakEnemies: 20, duration: 400, revived: false, summonLuck: 0.5, damageByUnit: {}, ...over,
  };
}

describe('review save-4: a backup code never brings back a refunded order', () => {
  it('takes a refunded pack out of an older code, and leaves the gems the code held besides it', async () => {
    const { profile } = await createTestProfile();
    profile.data.gems = 50;
    await profile.grantOrder('gems_4600', 'X');
    const code = await profile.exportCode();
    profile.data.gems = 10;
    await profile.revokeOrder('X');
    expect(profile.data.gems).toBe(0);

    expect((await profile.importCode(code)).ok).toBe(true);
    expect(profile.data.gems).toBe(50);
    expect(profile.data.orders.X?.revoked).toBe(true);
    await profile.grantOrder('gems_4600', 'X');
    expect(profile.data.gems).toBe(50);
  });

  it('takes a refund that reached this device before the grant did out of a code that holds the grant', async () => {
    const a = await createTestProfile();
    await a.profile.grantOrder('gems_1450', 'late');
    const code = await a.profile.exportCode();
    const b = await createTestProfile({ start: at(2026, 10, 8) });
    await b.profile.revokeOrder('late', 'gems_1450');

    expect((await b.profile.importCode(code)).ok).toBe(true);
    expect(b.profile.data.gems).toBe(0);
    expect(b.profile.data.orders.late).toMatchObject({ revoked: true, p: 'gems_1450' });
  });

  it('does not bring back a refunded Butler Pass, its rug or the ad-free flag', async () => {
    const { profile } = await createTestProfile();
    await profile.grantOrder('butler_pass', 'B1');
    const code = await profile.exportCode();
    await profile.revokeOrder('B1');
    expect(profile.data.owned.butler).toBe(false);

    expect((await profile.importCode(code)).ok).toBe(true);
    expect(profile.data.owned.butler).toBe(false);
    expect(profile.data.cosmetics.owned).not.toContain('rug_butler');
    expect(profile.data.orders.B1?.revoked).toBe(true);
    expect(profile.featureUnlocked('speed3x')).toBe(false);
    expect(profile.isPurchasable('butler_pass')).toBe(true);
  });

  it('does not keep the pass on a second device that imports a code made after the refund', async () => {
    const a = await createTestProfile();
    await a.profile.grantOrder('butler_pass', 'B1');
    const b = await createTestProfile({ start: at(2026, 10, 8) });
    expect((await b.profile.importCode(await a.profile.exportCode())).ok).toBe(true);
    expect(b.profile.data.owned.butler).toBe(true);

    await a.profile.revokeOrder('B1');
    expect((await b.profile.importCode(await a.profile.exportCode())).ok).toBe(true);
    expect(b.profile.data.owned.butler).toBe(false);
    expect(b.profile.data.orders.B1?.revoked).toBe(true);
    expect(b.profile.featureUnlocked('speed3x')).toBe(false);
  });

  it('keeps the pass when another Butler Pass order of this device still stands', async () => {
    const a = await createTestProfile();
    await a.profile.grantOrder('butler_pass', 'B1');
    const code = await a.profile.exportCode();
    const b = await createTestProfile({ start: at(2026, 10, 8) });
    await b.profile.grantOrder('butler_pass', 'B2');
    await b.profile.revokeOrder('B1', 'butler_pass');

    expect((await b.profile.importCode(code)).ok).toBe(true);
    expect(b.profile.data.owned.butler).toBe(true);
    expect(b.profile.data.orders.B1?.revoked).toBe(true);
    expect(b.profile.data.orders.B2?.revoked).toBe(false);
  });
});

describe('review save-6: a gem pass bought in a frozen session', () => {
  it('counts its 30 days from the last trusted moment, so it is live on arrival', async () => {
    const rig = await createTestProfile();
    const { profile } = rig;
    profile.data.time.lastSeenAt = rig.clock.wall() + 40 * DAY;
    profile.resume();
    expect(profile.frozen).toBe(true);

    await profile.grantOrder('gem_pass', 'gp');
    expect(profile.gemPassView().active).toBe(true);
    expect(profile.data.gemPass.until).toBe(profile.data.time.lastSeenAt + 30 * DAY);
  });

  it('keeps all 30 days when the clock is only 20 days behind, and still counts from now otherwise', async () => {
    const rig = await createTestProfile();
    const { profile } = rig;
    profile.data.time.lastSeenAt = rig.clock.wall() + 20 * DAY;
    profile.resume();
    await profile.grantOrder('gem_pass', 'gp');
    expect(profile.data.gemPass.until - profile.data.time.lastSeenAt).toBe(30 * DAY);

    const fresh = await createTestProfile();
    await fresh.profile.grantOrder('gem_pass', 'gp');
    expect(fresh.profile.data.gemPass.until).toBe(fresh.clock.wall() + 30 * DAY);
    expect(fresh.profile.gemPassView().active).toBe(true);
  });
});

describe('review save-7: commands write into today, not into yesterday', () => {
  it('keeps a season pass bought seconds after the season changed', async () => {
    const rig = await createTestProfile({ start: at(2026, 10, 30, 23, 59) });
    rig.clock.advance(81_000);
    await rig.profile.grantOrder('season_pass', 'sp');
    rig.profile.refresh();
    expect(rig.profile.data.pass).toMatchObject({ season: 1, premium: true });
  });

  it('keeps the missions and the daily challenge of a run that ends after midnight', async () => {
    const rig = await createTestProfile({ start: at(2026, 10, 6, 23, 59) });
    const { profile } = rig;
    rig.clock.advance(81_000);
    await profile.finishRun(stats());
    await profile.finishRun(stats({ mode: 'daily', chapter: 2, wavesCleared: 12 }));
    const credited = [...profile.data.day.missions.progress];
    expect(Math.max(...credited)).toBeGreaterThan(0);

    profile.refresh();
    expect(profile.data.day.date).toBe('2026-10-07');
    expect(profile.data.day.missions.progress).toEqual(credited);
    expect(profile.data.day.challengeCleared).toBe(true);
    expect(profile.data.cup.days['2026-10-07']).toBe(12);
  });

  it('keeps the cup and endless week best of a run that ends after Monday starts', async () => {
    const rig = await createTestProfile({ start: at(2026, 10, 11, 23, 59) });
    const { profile } = rig;
    rig.clock.advance(81_000);
    await profile.finishRun(stats({ mode: 'daily', chapter: 2, wavesCleared: 9 }));
    await profile.finishRun(stats({ mode: 'endless', victory: false, wavesCleared: 17 }));

    profile.refresh();
    expect(profile.data.cup).toMatchObject({ week: '2026-10-12', days: { '2026-10-12': 9 } });
    expect(profile.data.endless).toMatchObject({ week: '2026-10-12', weekBest: 17 });
  });

  it('keeps the pass XP of a doubled result and of a sweep taken after the season changed', async () => {
    const rig = await createTestProfile({ start: at(2026, 10, 30, 23, 59) });
    const { profile } = rig;
    const first = await profile.finishRun(stats());
    expect(first.ok).toBe(true);
    rig.clock.advance(61_000);
    expect(profile.data.pass.season).toBe(0);

    expect((await profile.doubleResult('ad')).ok).toBe(true);
    profile.refresh();
    const doubled = profile.data.lastRun?.xp ?? 0;
    expect(doubled).toBeGreaterThan(0);
    expect(profile.data.pass).toMatchObject({ season: 1, xp: doubled });

    rig.clock.advance(DAY * 30);
    profile.data.tickets = 3;
    expect(profile.sweep(1, 0).ok).toBe(true);
    profile.refresh();
    expect(profile.data.pass.season).toBe(2);
    expect(profile.data.pass.xp).toBeGreaterThan(0);
  });
});

describe('review save-8: a refund closes the premium row only if its order held it open', () => {
  it('keeps the row when the duplicate order is refunded, and closes it with the last order', async () => {
    const { profile } = await createTestProfile();
    await profile.grantOrder('season_pass', 's1');
    await profile.grantOrder('season_pass', 's2');
    expect(profile.data.gems).toBe(600);

    await profile.revokeOrder('s2');
    expect(profile.data.pass.premium).toBe(true);
    expect(profile.data.gems).toBe(0);
    await profile.revokeOrder('s1');
    expect(profile.data.pass.premium).toBe(false);
  });

  it('keeps the row when the first order is refunded while the second still stands', async () => {
    const { profile } = await createTestProfile();
    await profile.grantOrder('season_pass', 's1');
    await profile.grantOrder('season_pass', 's2');

    await profile.revokeOrder('s1');
    expect(profile.data.pass.premium).toBe(true);
    await profile.revokeOrder('s2');
    expect(profile.data.pass.premium).toBe(false);
  });

  it('does not close this season\'s row for the refund of a pass bought in an earlier season', async () => {
    const rig = await createTestProfile();
    const { profile } = rig;
    await profile.grantOrder('season_pass', 'old');
    rig.clock.advance(30 * DAY);
    profile.resume();
    expect(profile.data.pass).toMatchObject({ season: 1, premium: false });
    await profile.grantOrder('season_pass', 'new');
    expect(profile.data.pass.premium).toBe(true);

    await profile.revokeOrder('old');
    expect(profile.data.pass.premium).toBe(true);
    await profile.revokeOrder('new');
    expect(profile.data.pass.premium).toBe(false);
  });
});

describe('review economy-4: "boss and elite" missions count elites too', () => {
  it('credits the cleared elite waves on top of the bosses the run reports', async () => {
    const { profile } = await createTestProfile({ start: at(2026, 10, 6, 12, 0) });
    const weekly = WEEKLY_MISSIONS.findIndex((m) => m.id === 'w_bosses');
    await profile.finishRun(stats({ wavesCleared: 24, bossesKilled: 3 }));
    expect(profile.data.week.missions.progress[weekly]).toBe(6);
    await profile.finishRun(stats({ victory: false, wavesCleared: 13, bossesKilled: 1 }));
    expect(profile.data.week.missions.progress[weekly]).toBe(6 + 3);
  });
});
