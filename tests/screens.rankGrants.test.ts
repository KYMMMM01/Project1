import { beforeEach, describe, expect, it, vi } from 'vitest';

const app = vi.hoisted(() => ({
  state: { status: 'on', uid: 'u1' } as { status: string; uid?: string },
  claimGrants: vi.fn(),
  pay: vi.fn(),
  showRewards: vi.fn(),
}));

vi.mock('@/platform', () => ({
  account: { state: () => app.state },
  ranking: { claimGrants: app.claimGrants },
  // The clock is set to Wednesday 2026-11-25: this week starts on Monday the 23rd, last week on the 16th.
  seoulWeek: (ms: number) => (ms > Date.UTC(2026, 10, 22) ? '2026-11-23' : '2026-11-16'),
}));
vi.mock('@/meta', () => ({
  bundleParts: (b: unknown) => ['parts', b],
  profile: { claimRankGrants: app.pay },
}));
vi.mock('../src/screens/contract', () => ({ services: { showRewards: app.showRewards } }));

import { claimRankGrants } from '../src/screens/system/rankGrants';

const grant = { week: 'week-2026-11-16', rank: 3, items: [] as string[] };
const here = (): boolean => true;

describe('claimRankGrants', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 10, 25));
    app.state = { status: 'on', uid: 'u1' };
    app.claimGrants.mockReset().mockResolvedValue([grant]);
    app.pay.mockReset().mockReturnValue([]);
    app.showRewards.mockReset().mockResolvedValue(undefined);
  });

  it('does nothing signed out', async () => {
    app.state = { status: 'off' };
    await claimRankGrants(here);
    expect(app.claimGrants).not.toHaveBeenCalled();
    expect(app.pay).not.toHaveBeenCalled();
  });

  it('pays nothing when the server could not be read', async () => {
    app.claimGrants.mockResolvedValue(null);
    await claimRankGrants(here);
    expect(app.pay).not.toHaveBeenCalled();
  });

  it('shows one popup per paid week: the week before this one says last week, an older one does not', async () => {
    app.pay.mockReturnValue([
      { week: 'week-2026-11-16', rank: 12, bundle: { gems: 1 } },
      { week: 'week-2026-11-09', rank: 4, bundle: { gems: 2 } },
    ]);
    await claimRankGrants(here);
    expect(app.pay).toHaveBeenCalledWith('u1', [grant]);
    expect(app.showRewards.mock.calls).toEqual([
      [['parts', { gems: 1 }], '지난주 주간 랭킹 12위'],
      [['parts', { gems: 2 }], '주간 랭킹 4위 보상'],
    ]);
  });

  it('shows nothing when nothing was new', async () => {
    await claimRankGrants(here);
    expect(app.showRewards).not.toHaveBeenCalled();
  });

  it('runs a call that came during another once that one ends, and never two at once', async () => {
    let done: (v: null) => void = () => undefined;
    app.claimGrants.mockReturnValueOnce(new Promise((r) => (done = r)));
    const first = claimRankGrants(here);
    await claimRankGrants(here);
    await claimRankGrants(here);
    expect(app.claimGrants).toHaveBeenCalledTimes(1);
    done(null);
    await first;
    await vi.runAllTimersAsync();
    expect(app.claimGrants).toHaveBeenCalledTimes(2);
  });

  it('pays nothing when the player left the place that asked (a battle started) while the server answered', async () => {
    let live = true;
    let done: (v: unknown) => void = () => undefined;
    app.claimGrants.mockReturnValueOnce(new Promise((r) => (done = r)));
    const run = claimRankGrants(() => live);
    live = false;
    done([grant]);
    await run;
    expect(app.pay).not.toHaveBeenCalled();
    expect(app.showRewards).not.toHaveBeenCalled();
  });

  it('pays nothing when another account signed in while the server answered', async () => {
    let done: (v: unknown) => void = () => undefined;
    app.claimGrants.mockReturnValueOnce(new Promise((r) => (done = r)));
    const run = claimRankGrants(here);
    app.state = { status: 'on', uid: 'u2' };
    done([grant]);
    await run;
    expect(app.pay).not.toHaveBeenCalled();
    expect(app.showRewards).not.toHaveBeenCalled();
  });

  it('claims for the new account when it signed in while the old one was being answered', async () => {
    let done: (v: unknown) => void = () => undefined;
    app.claimGrants.mockReturnValueOnce(new Promise((r) => (done = r)));
    const run = claimRankGrants(here);
    app.state = { status: 'on', uid: 'u2' };
    await claimRankGrants(here);
    done([grant]);
    await run;
    await vi.runAllTimersAsync();
    expect(app.pay).toHaveBeenCalledTimes(1);
    expect(app.pay).toHaveBeenCalledWith('u2', [grant]);
  });
});
