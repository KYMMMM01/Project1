import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloudSave, CLOUD_DEBOUNCE_MS, type CloudChoice, type CloudDeps } from '@/meta/cloudSave';
import { createTestProfile } from '@/meta/testing';
import type { BackupPreview } from '@/meta/profile';
import type { Profile } from '@/meta/profile';

const NOW = 1_700_000_000_000;

/** A cloud slot in memory, this install's id, a scripted answer to the choice dialog. */
function rig(opts: { cloud?: string | null; device?: string; answer?: CloudChoice; loadFails?: boolean } = {}) {
  const slot = { text: opts.cloud ?? null, writes: 0 };
  const asked: Array<{ cloud: BackupPreview; local: BackupPreview }> = [];
  const reload = vi.fn();
  const deps: CloudDeps = {
    load: async () => {
      if (opts.loadFails) throw new Error('offline');
      return slot.text;
    },
    save: async (text) => {
      slot.text = text;
      slot.writes++;
      return true;
    },
    deviceId: async () => opts.device ?? 'phone-b',
    now: () => NOW,
    ask: async (cloud, local) => {
      asked.push({ cloud, local });
      return opts.answer ?? 'local';
    },
    reload,
  };
  return { slot, asked, reload, deps };
}

const payload = (device: string, data: unknown, savedAt = NOW - 3_600_000, v = 1): string => JSON.stringify({ v, device, savedAt, data });
const upGems = (slot: { text: string | null }): number => JSON.parse(slot.text as string).data.gems;

/** A profile with progress: runs played and gems, last seen now. */
async function played(gems: number): Promise<Profile> {
  const r = await createTestProfile();
  r.profile.data.stats.runs = 5;
  r.profile.data.gems = gems;
  r.profile.data.time.lastSeenAt = NOW;
  return r.profile;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('cloud save after a sign-in', () => {
  it('no cloud copy yet: this device goes up, tagged with its id; writes behind the player only follow once settled', async () => {
    const profile = await played(120);
    const c = rig({ cloud: null });
    const cloud = new CloudSave(profile, c.deps);
    expect(await cloud.upload()).toBe(false); // nothing before the sync
    expect(await cloud.syncAfterSignIn()).toBe('uploaded');
    expect(cloud.settled).toBe(true);
    expect(JSON.parse(c.slot.text as string)).toMatchObject({ v: 1, device: 'phone-b', savedAt: NOW });
    expect(upGems(c.slot)).toBe(120);
    expect(c.asked).toHaveLength(0);
  });

  it("this device's own copy and an up-to-date profile: it goes up, nobody is asked", async () => {
    const profile = await played(300);
    const older = await played(10);
    const c = rig({ cloud: payload('phone-b', older.data, NOW - 120_000), device: 'phone-b' });
    expect(await new CloudSave(profile, c.deps).syncAfterSignIn()).toBe('uploaded');
    expect(upGems(c.slot)).toBe(300);
    expect(c.asked).toHaveLength(0);
  });

  it("this device's own copy but the profile is empty (a reset, a damaged save): the player is asked, never overwritten silently", async () => {
    const fresh = (await createTestProfile()).profile;
    const mine = await played(500);
    const keep = rig({ cloud: payload('phone-b', mine.data), device: 'phone-b', answer: 'cloud' });
    expect(await new CloudSave(fresh, keep.deps).syncAfterSignIn()).toBe('adopted');
    expect(keep.asked).toHaveLength(1);
    expect(fresh.data.gems).toBe(500);
  });

  it("this device's own copy newer than the profile (an old backup restored): the player is asked", async () => {
    const restored = await played(20);
    restored.data.time.lastSeenAt = NOW - 3 * 86_400_000;
    const later = await played(800);
    const c = rig({ cloud: payload('phone-b', later.data, NOW - 3_600_000), device: 'phone-b', answer: 'local' });
    expect(await new CloudSave(restored, c.deps).syncAfterSignIn()).toBe('uploaded');
    expect(c.asked).toHaveLength(1);
    expect(upGems(c.slot)).toBe(20);
  });

  it("a new phone (fresh profile) takes another device's copy, writes it back as its own and restarts", async () => {
    const fresh = (await createTestProfile()).profile;
    const other = await played(777);
    const c = rig({ cloud: payload('phone-a', other.data) });
    expect(await new CloudSave(fresh, c.deps).syncAfterSignIn()).toBe('adopted');
    expect(fresh.data.gems).toBe(777);
    expect(c.asked).toHaveLength(0);
    expect(c.reload).toHaveBeenCalledTimes(1);
    expect(JSON.parse(c.slot.text as string).device).toBe('phone-b');
  });

  it("another device's copy without progress never replaces a played profile", async () => {
    const profile = await played(50);
    const blank = (await createTestProfile()).profile;
    const c = rig({ cloud: payload('phone-a', blank.data) });
    expect(await new CloudSave(profile, c.deps).syncAfterSignIn()).toBe('uploaded');
    expect(profile.data.gems).toBe(50);
    expect(c.asked).toHaveLength(0);
  });

  it('both have progress: "this device" keeps it, "cloud" replaces it, closing the dialog decides nothing', async () => {
    const other = await played(900);
    other.data.stats.runs = 30;
    const a = await played(40);
    const keep = rig({ cloud: payload('phone-a', other.data), answer: 'local' });
    expect(await new CloudSave(a, keep.deps).syncAfterSignIn()).toBe('uploaded');
    expect(keep.asked[0]).toMatchObject({ cloud: { gems: 900 }, local: { gems: 40 } });
    expect(upGems(keep.slot)).toBe(40);

    const b = await played(40);
    const take = rig({ cloud: payload('phone-a', other.data), answer: 'cloud' });
    expect(await new CloudSave(b, take.deps).syncAfterSignIn()).toBe('adopted');
    expect(b.data.gems).toBe(900);
    expect(take.reload).toHaveBeenCalledTimes(1);

    const d = await played(40);
    const closed = rig({ cloud: payload('phone-a', other.data), answer: 'later' });
    const cloud = new CloudSave(d, closed.deps);
    expect(await cloud.syncAfterSignIn()).toBe('later');
    expect(closed.slot.writes).toBe(0);
    expect(cloud.settled).toBe(false);
    cloud.schedule();
    expect(await cloud.upload()).toBe(false); // still nothing written until it is settled
    expect(closed.slot.writes).toBe(0);
  });

  it('a failed read, a copy from a newer app or one this version cannot read: nothing is written', async () => {
    const profile = await played(60);
    for (const c of [rig({ loadFails: true }), rig({ cloud: payload('phone-a', { gems: 1 }, NOW, 2) }), rig({ cloud: payload('phone-a', 'garbage') })]) {
      const cloud = new CloudSave(profile, c.deps);
      expect(await cloud.syncAfterSignIn()).toBe('failed');
      expect(c.slot.writes).toBe(0);
      expect(cloud.settled).toBe(false);
    }
    // text that is not our payload at all is no copy: this device goes up
    const junk = rig({ cloud: '{"not":"ours"}' });
    expect(await new CloudSave(profile, junk.deps).syncAfterSignIn()).toBe('uploaded');
  });

  it('a run in progress is not cut by a restart: the sync waits for it to end', async () => {
    const fresh = (await createTestProfile()).profile;
    const other = await played(10);
    const prep = await fresh.prepareRun({ mode: 'chapter' });
    expect(prep.ok).toBe(true);
    expect(fresh.pendingRun).not.toBeNull();
    const c = rig({ cloud: payload('phone-a', other.data) });
    expect(await new CloudSave(fresh, c.deps).syncAfterSignIn()).toBe('later');
    expect(c.reload).not.toHaveBeenCalled();
    expect(c.slot.writes).toBe(0);
  });

  it("what was bought on this device after its last upload is granted again on the cloud copy it takes", async () => {
    const other = await played(900);
    other.data.stats.runs = 30;
    const here = await played(40);
    await here.grantOrder('gems_260', 'GPA.order-here', 'purchase');
    const gemsAfterBuy = here.data.gems;
    expect(gemsAfterBuy).toBeGreaterThan(40);
    const c = rig({ cloud: payload('phone-a', other.data), answer: 'cloud' });
    expect(await new CloudSave(here, c.deps).syncAfterSignIn()).toBe('adopted');
    expect(here.data.gems).toBe(900 + (gemsAfterBuy - 40));
    expect(here.data.orders['GPA.order-here']).toBeDefined();
  });

  it('changes go up once, a little after the last one; a change that only moved the clock is not written again', async () => {
    vi.useFakeTimers();
    const profile = await played(1);
    const c = rig();
    const cloud = new CloudSave(profile, c.deps);
    await cloud.syncAfterSignIn();
    expect(c.slot.writes).toBe(1);
    profile.data.gems = 2;
    cloud.schedule();
    await vi.advanceTimersByTimeAsync(CLOUD_DEBOUNCE_MS - 1000);
    cloud.schedule();
    await vi.advanceTimersByTimeAsync(CLOUD_DEBOUNCE_MS - 1000);
    expect(c.slot.writes).toBe(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(c.slot.writes).toBe(2);
    profile.data.time.lastSeenAt += 60_000;
    expect(await cloud.upload()).toBe(true);
    expect(c.slot.writes).toBe(2);
    cloud.signedOut();
    expect(cloud.settled).toBe(false);
  });
});

describe('endless record and the rankings', () => {
  it('every endless run goes up with its run for the server to judge (the server keeps the best per board and knows the week)', async () => {
    const sent: Array<[string, number, { waves: number; seconds: number } | undefined]> = [];
    const r = await createTestProfile({ submitScore: (board, score, run) => sent.push([board, score, run]) });
    r.profile.data.cleared[0] = 1;
    r.profile.data.cleared[1] = 1;
    for (const waves of [41, 33, 62]) {
      const prep = await r.profile.prepareRun({ mode: 'endless', chapter: 2 });
      expect(prep.ok).toBe(true);
      await r.profile.finishRun({
        mode: 'endless', chapter: 2, stake: 0, seed: 4321, victory: false, wavesCleared: waves, totalWaves: 0, kills: 300, bossesKilled: 2,
        summons: 40, merges: 25, molts: 0, awakenings: 0, relics: [], bestRarity: 'epic', peakEnemies: 20, duration: 400, revived: false,
        summonLuck: 0.5, damageByUnit: {},
      } as Parameters<typeof r.profile.finishRun>[0]);
    }
    expect(sent.filter(([b]) => b === 'endless_best')).toEqual([
      ['endless_best', 41, { waves: 41, seconds: 400 }],
      ['endless_best', 33, { waves: 33, seconds: 400 }],
      ['endless_best', 62, { waves: 62, seconds: 400 }],
    ]);
    expect(r.profile.data.endless.best).toBe(62);
  });
});
