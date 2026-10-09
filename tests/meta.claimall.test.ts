import { describe, expect, it } from 'vitest';
import { mergeBundles } from '@/meta/bundle';
import { CUP_TIERS, DAILY_MISSIONS, ENDLESS_TIERS, WEEKLY_MISSIONS } from '@/meta/data/schedule';
import type { Profile } from '@/meta/profile';
import { createTestProfile } from '@/meta/testing';
import type { Bundle, Result } from '@/meta/types';

/** Everything a claim leaves behind that a test can see: the saved data, the money lines, the analytics, and how often the profile announced a change. */
interface Outcome {
  data: string;
  currency: string[];
  analytics: string[];
  changes: number;
  rewards: Bundle[];
}

async function scenario(setup: (p: Profile) => void, act: (p: Profile) => Bundle[]): Promise<Outcome> {
  const rig = await createTestProfile();
  const p = rig.profile;
  p.data.stats.runs = 5;
  p.data.cleared = [1, 1, 0, 0, 0];
  p.refresh();
  setup(p);
  const currency: string[] = [];
  p.events.on('currency', (e) => currency.push(`${e.currency}:${e.delta}:${e.reason}`));
  let changes = 0;
  p.subscribe(() => changes++);
  const before = rig.analytics.length;
  const rewards = act(p);
  return {
    data: JSON.stringify(p.data),
    currency,
    analytics: rig.analytics.slice(before).map((a) => `${a.event}:${JSON.stringify(a.params)}`),
    changes,
    rewards,
  };
}

/** The values of results that must all be ok, in order. */
function values(results: readonly Result<Bundle>[]): Bundle[] {
  return results.flatMap((r) => (r.ok ? [r.value] : []));
}

const sum = (bundles: readonly Bundle[]): Bundle => bundles.reduce((a, b) => mergeBundles(a, b), {});

function finishAll(p: Profile): void {
  p.data.day.missions.progress = DAILY_MISSIONS.map((m) => m.target);
  p.data.week.missions.progress = WEEKLY_MISSIONS.map((m) => m.target);
}

function finishSome(p: Profile): void {
  p.data.day.missions.progress = DAILY_MISSIONS.map((m, i) => (i === 1 || i === 3 ? m.target : 0));
  p.data.week.missions.progress = WEEKLY_MISSIONS.map((m, i) => (i % 2 === 0 ? m.target : 1));
}

function reachCup(p: Profile, tiers: 1 | 2 | 3): void {
  const week = p.data.cup.week;
  const days: Record<string, number> = { [week]: 40, '2026-10-06': 30, '2026-10-08': 30 };
  if (tiers < 3) delete days['2026-10-08'];
  if (tiers < 2) delete days['2026-10-06'];
  p.data.cup.days = days;
}

describe('claiming a whole mission list at once', () => {
  for (const scope of ['daily', 'weekly'] as const) {
    const defs = scope === 'daily' ? DAILY_MISSIONS : WEEKLY_MISSIONS;

    it(`pays the ${scope} list exactly like claiming each mission in turn`, async () => {
      const each = await scenario(finishAll, (p) => values(defs.map((_, i) => p.claimMission(scope, i))));
      const all = await scenario(finishAll, (p) => {
        const r = p.claimAllMissions(scope);
        expect(r.ok && r.value.count).toBe(defs.length);
        return r.ok ? [r.value.reward] : [];
      });
      // Same save, same money lines in the same order, same analytics, one merged bundle.
      expect(all.data).toBe(each.data);
      expect(all.currency).toEqual(each.currency);
      expect(all.analytics).toEqual(each.analytics);
      expect(all.rewards).toEqual([sum(each.rewards)]);
      // Five announcements while claiming one by one, one for the whole list.
      expect(each.changes).toBe(defs.length);
      expect(all.changes).toBe(1);
    });

    it(`takes only the finished ones of the ${scope} list and leaves the rest untouched`, async () => {
      const each = await scenario(finishSome, (p) => values(defs.map((_, i) => p.claimMission(scope, i))));
      const all = await scenario(finishSome, (p) => {
        const r = p.claimAllMissions(scope);
        return r.ok ? [r.value.reward] : [];
      });
      expect(all.data).toBe(each.data);
      expect(all.currency).toEqual(each.currency);
      expect(all.rewards).toEqual([sum(each.rewards)]);
      const count = scope === 'daily' ? 2 : Math.ceil(defs.length / 2);
      expect(each.rewards).toHaveLength(count);
    });
  }

  it('says how many it took, refuses a second time, and never pays a mission twice', async () => {
    const rig = await createTestProfile();
    const p = rig.profile;
    p.data.stats.runs = 5;
    p.refresh();
    expect(p.claimAllMissions('daily')).toEqual({ ok: false, error: 'nothing_to_claim' });
    finishSome(p);
    const first = p.claimAllMissions('daily');
    expect(first.ok && first.value.count).toBe(2);
    const gold = p.data.gold;
    expect(p.claimAllMissions('daily')).toEqual({ ok: false, error: 'nothing_to_claim' });
    expect(p.claimMission('daily', 1)).toEqual({ ok: false, error: 'already_claimed' });
    expect(p.data.gold).toBe(gold);
    // A mission that finishes later joins the next claim-all.
    p.data.day.missions.progress = DAILY_MISSIONS.map((m) => m.target);
    const rest = p.claimAllMissions('daily');
    expect(rest.ok && rest.value.count).toBe(DAILY_MISSIONS.length - 2);
  });

  it('reads the list the profile holds: claiming the daily list leaves the weekly list alone', async () => {
    const rig = await createTestProfile();
    const p = rig.profile;
    p.data.stats.runs = 5;
    p.refresh();
    finishAll(p);
    p.claimAllMissions('daily');
    expect(p.missionsView('daily').every((m) => m.claimed)).toBe(true);
    expect(p.missionsView('weekly').some((m) => m.claimed)).toBe(false);
  });

  it('opens the daily chest through the same points as claiming one by one (the chest stays its own claim)', async () => {
    const rig = await createTestProfile();
    const p = rig.profile;
    p.data.stats.runs = 5;
    p.refresh();
    finishAll(p);
    expect(p.dailyChestView().ready).toBe(false);
    p.claimAllMissions('daily');
    expect(p.dailyChestView()).toMatchObject({ points: 100, ready: true, claimed: false });
  });

  it('is locked while missions are, like a single claim', async () => {
    const rig = await createTestProfile();
    const p = rig.profile;
    expect(p.featureUnlocked('missions')).toBe(false);
    expect(p.claimAllMissions('daily')).toEqual({ ok: false, error: 'locked' });
    expect(p.claimAllCup()).toEqual({ ok: false, error: 'locked' });
    expect(p.claimAllEndless()).toEqual({ ok: false, error: 'locked' });
  });
});

describe('claiming every tier of the weekly cup and of endless mode at once', () => {
  it('pays the cup like claiming each reached tier in turn', async () => {
    const each = await scenario((p) => reachCup(p, 3), (p) => values(CUP_TIERS.map((_, i) => p.claimCup(i))));
    const all = await scenario((p) => reachCup(p, 3), (p) => {
      const r = p.claimAllCup();
      expect(r.ok && r.value.count).toBe(CUP_TIERS.length);
      return r.ok ? [r.value.reward] : [];
    });
    expect(all.data).toBe(each.data);
    expect(all.currency).toEqual(each.currency);
    expect(all.rewards).toEqual([sum(each.rewards)]);
    expect(each.changes).toBe(CUP_TIERS.length);
    expect(all.changes).toBe(1);
  });

  it('takes only the reached cup tiers, once', async () => {
    const rig = await createTestProfile();
    const p = rig.profile;
    p.data.stats.runs = 5;
    p.data.cleared = [1, 1, 0, 0, 0];
    p.refresh();
    expect(p.claimAllCup()).toEqual({ ok: false, error: 'nothing_to_claim' });
    reachCup(p, 2);
    const r = p.claimAllCup();
    expect(r.ok && r.value.count).toBe(2);
    expect(r.ok && r.value.reward).toEqual(mergeBundles(CUP_TIERS[0]!.reward, CUP_TIERS[1]!.reward));
    expect(p.claimAllCup()).toEqual({ ok: false, error: 'nothing_to_claim' });
    expect(p.claimCup(0)).toEqual({ ok: false, error: 'already_claimed' });
    expect(p.claimCup(2)).toEqual({ ok: false, error: 'not_ready' });
  });

  it('pays endless mode like claiming each reached tier in turn', async () => {
    const reach = (p: Profile): void => {
      p.data.endless.weekBest = 80;
    };
    const each = await scenario(reach, (p) => values(ENDLESS_TIERS.map((_, i) => p.claimEndless(i))));
    const all = await scenario(reach, (p) => {
      const r = p.claimAllEndless();
      expect(r.ok && r.value.count).toBe(ENDLESS_TIERS.length);
      return r.ok ? [r.value.reward] : [];
    });
    expect(all.data).toBe(each.data);
    expect(all.currency).toEqual(each.currency);
    expect(all.rewards).toEqual([sum(each.rewards)]);
    expect(all.changes).toBe(1);
  });

  it('takes only the reached endless tiers and says nothing to claim when there are none', async () => {
    const rig = await createTestProfile();
    const p = rig.profile;
    p.data.stats.runs = 5;
    p.data.cleared = [1, 1, 0, 0, 0];
    p.refresh();
    expect(p.claimAllEndless()).toEqual({ ok: false, error: 'nothing_to_claim' });
    p.data.endless.weekBest = 61;
    const r = p.claimAllEndless();
    expect(r.ok && r.value.count).toBe(2);
    expect(p.claimEndless(1)).toEqual({ ok: false, error: 'already_claimed' });
  });
});
